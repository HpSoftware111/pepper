import crypto from 'crypto';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { parse as parseCsv } from 'csv-parse/sync';
import { fetch } from 'undici';
import mongoose from 'mongoose';
import Message from '../models/Message.js';
import ThreadMeta from '../models/ThreadMeta.js';
import UserMemory from '../models/UserMemory.js';
import Sentencia from '../models/Sentencia.js';
import Document from '../models/Document.js';
import ExtractedText from '../models/ExtractedText.js';
import { detectLanguageFromText, getLanguageKey } from './chatController.js';

const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'txt', 'md', 'csv', 'rtf'];
const MAX_FILE_SIZE = 12 * 1024 * 1024; // 12MB
const MAX_FILES = 5;

const cleanText = (text) =>
  (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const extractPlainText = (buffer) => cleanText(buffer.toString('utf8'));

const extractRtf = (buffer) => {
  const raw = buffer.toString('utf8');
  return cleanText(
    raw
      .replace(/\\par[d]?/g, '\n')
      .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\[a-z]+\d*/g, '')
      .replace(/[{}]/g, ''),
  );
};

const extractors = {
  pdf: async (buffer) => {
    const result = await pdfParse(buffer);
    return cleanText(result.text || '');
  },
  docx: async (buffer) => {
    const { value } = await mammoth.extractRawText({ buffer });
    return cleanText(value);
  },
  txt: async (buffer) => extractPlainText(buffer),
  md: async (buffer) => extractPlainText(buffer),
  csv: async (buffer) => {
    const rows = parseCsv(buffer.toString('utf8'), {
      relaxColumnCount: true,
      skip_empty_lines: true,
    });
    return cleanText(
      rows
        .map((row) => row.join('\t'))
        .join('\n')
        .trim(),
    );
  },
  rtf: async (buffer) => extractRtf(buffer),
};

const supportedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/rtf',
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = file.originalname.split('.').pop()?.toLowerCase();
  if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
    return cb(new Error('UNSUPPORTED_EXTENSION'));
  }
  if (file.mimetype && file.mimetype !== 'application/octet-stream' && !supportedMimeTypes.has(file.mimetype)) {
    // allow octet-stream since some browsers send that
    return cb(new Error('UNSUPPORTED_MIMETYPE'));
  }
  cb(null, true);
};

export const filesUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
  fileFilter,
}).array('files', MAX_FILES);

const wordCount = (text) => {
  if (!text) return 0;
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
};

export const extractFile = async (file) => {
  const ext = file.originalname.split('.').pop()?.toLowerCase();
  const extractor = ext ? extractors[ext] : null;
  if (!extractor) {
    throw new Error('UNSUPPORTED_EXTENSION');
  }
  const text = await extractor(file.buffer);
  if (!text) {
    throw new Error('EMPTY_TEXT');
  }
  return {
    id: crypto.randomUUID(),
    name: file.originalname,
    ext,
    size: file.size,
    mimeType: file.mimetype,
    text,
    wordCount: wordCount(text),
    source: 'upload',
  };
};

export const extractUploadedFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se adjuntaron archivos.' });
    }
    const results = await Promise.all(
      req.files.map(async (file) => {
        try {
          return { status: 'ready', ...(await extractFile(file)) };
        } catch (error) {
          return {
            status: 'error',
            name: file.originalname,
            ext: file.originalname.split('.').pop()?.toLowerCase() ?? '',
            size: file.size,
            mimeType: file.mimetype,
            error: error?.message || 'No se pudo procesar el archivo.',
          };
        }
      }),
    );
    return res.json({ files: results });
  } catch (error) {
    const code = error?.message === 'UNSUPPORTED_EXTENSION' ? 400 : 500;
    return res.status(code).json({ error: 'No se pudieron procesar los archivos.' });
  }
};

/**
 * Extract text from files and store in ExtractedText model
 * Returns textId for each successfully extracted file
 */
export const extractAndStore = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se adjuntaron archivos.' });
    }

    const { userId, email } = req.user || {};
    if (!userId || !email) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { storeOnly = true } = req.body || {}; // Default to store only, don't send to chat

    // Extract text from all files
    const extractionResults = await Promise.all(
      req.files.map(async (file) => {
        try {
          const extracted = await extractFile(file);
          return { status: 'ready', file, ...extracted };
        } catch (error) {
          return {
            status: 'error',
            file,
            name: file.originalname,
            ext: file.originalname.split('.').pop()?.toLowerCase() ?? '',
            size: file.size,
            mimeType: file.mimetype,
            error: error?.message || 'No se pudo procesar el archivo.',
          };
        }
      }),
    );

    const successfulExtractions = extractionResults.filter((r) => r.status === 'ready' && r.text);
    if (successfulExtractions.length === 0) {
      return res.status(400).json({
        error: 'No se pudo extraer texto de ningún archivo.',
        files: extractionResults.map((r) => ({
          name: r.name || r.file?.originalname,
          status: r.status,
          error: r.error,
        })),
      });
    }

    // Detect language from extracted text
    const combinedText = successfulExtractions.map((f) => f.text).join('\n\n');
    const detectedLang = detectLanguageFromText(combinedText);
    const detectedLangKey = getLanguageKey(detectedLang);

    // Store each extracted file in ExtractedText model
    const storedTexts = await Promise.all(
      successfulExtractions.map(async (extraction) => {
        try {
          // Generate textId explicitly to avoid validation error (required field)
          const textId = `text-${crypto.randomUUID()}`;

          const extractedText = new ExtractedText({
            textId,
            userId: new mongoose.Types.ObjectId(userId),
            userEmail: email.toLowerCase(),
            source: 'file',
            sourceName: extraction.name || extraction.file?.originalname || `File - ${new Date().toLocaleString()}`,
            extractedText: extraction.text.trim(),
            metadata: {
              fileSize: extraction.size || extraction.file?.size || null,
              fileType: extraction.mimeType || extraction.file?.mimetype || extraction.ext || null,
              fileName: extraction.name || extraction.file?.originalname || null,
              wordCount: extraction.wordCount || 0,
              language: detectedLangKey,
            },
            status: 'ready',
          });

          await extractedText.save();

          return {
            textId: extractedText.textId,
            fileName: extraction.name || extraction.file?.originalname,
            wordCount: extractedText.metadata.wordCount,
            status: 'stored',
          };
        } catch (error) {
          console.error('[extractAndStore] Error storing extracted text:', error);
          return {
            fileName: extraction.name || extraction.file?.originalname,
            status: 'error',
            error: error?.message || 'Error al almacenar el texto extraído',
          };
        }
      }),
    );

    const successfullyStored = storedTexts.filter((t) => t.status === 'stored');
    const failedStored = storedTexts.filter((t) => t.status === 'error');

    return res.json({
      success: true,
      totalFiles: req.files.length,
      extracted: successfulExtractions.length,
      stored: successfullyStored.length,
      failed: failedStored.length,
      extractedTexts: successfullyStored.map((t) => ({
        textId: t.textId,
        fileName: t.fileName,
        wordCount: t.wordCount,
      })),
      errors: failedStored.length > 0 ? failedStored : undefined,
    });
  } catch (error) {
    console.error('[extractAndStore] Error:', error);
    const code = error?.message === 'UNSUPPORTED_EXTENSION' ? 400 : 500;
    return res.status(code).json({
      error: 'No se pudieron procesar los archivos.',
      message: error?.message || 'Error desconocido',
    });
  }
};

// Constants for chat integration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const CACHE_HISTORY_LIMIT = 20;
const threadCache = new Map();
const threadOwner = new Map();

const ensureDeepseekKey = () => {
  if (!DEEPSEEK_API_KEY || !DEEPSEEK_API_KEY.trim()) {
    throw new Error('DEEPSEEK_API_KEY no configurada');
  }
};

const ownerKeyFromUser = (user) => {
  if (!user) return null;
  const id = (user.userId || user._id || user.id || '').toString();
  const mail = (user.email || user.user_email || '').toLowerCase();
  return `${id}::${mail}`;
};

const getThreadOwner = (threadId) => threadOwner.get(threadId) || null;
const setThreadOwner = (threadId, ownerKey) => {
  if (threadId && ownerKey) threadOwner.set(threadId, ownerKey);
};

const ensureThreadOwner = async (threadId, reqOwnerKey, userEmail) => {
  let currentOwner = getThreadOwner(threadId);
  if (!currentOwner) {
    // First check ThreadMeta (for newly created threads)
    const threadMeta = await ThreadMeta.findOne({ threadId })
      .select({ user_email: 1, user_id: 1 })
      .lean();
    if (threadMeta) {
      const mongoOwnerKey = ownerKeyFromUser({ _id: threadMeta?.user_id, email: threadMeta?.user_email });
      if (mongoOwnerKey) {
        setThreadOwner(threadId, mongoOwnerKey);
        currentOwner = mongoOwnerKey;
      }
    } else {
      // If no ThreadMeta, check Message collection
      const lastMeta = await Message.findOne({ threadId })
        .sort({ timestamp: -1, _id: -1 })
        .select({ user_email: 1, user_id: 1 })
        .lean();
      const mongoOwnerKey = ownerKeyFromUser({ _id: lastMeta?.user_id, email: lastMeta?.user_email });
      if (mongoOwnerKey) {
        setThreadOwner(threadId, mongoOwnerKey);
        currentOwner = mongoOwnerKey;
      }
    }
  }
  if (currentOwner && currentOwner !== reqOwnerKey) {
    const err = new Error('THREAD_OWNERSHIP_MISMATCH');
    err.code = 'THREAD_OWNERSHIP_MISMATCH';
    throw err;
  }
  if (!currentOwner) setThreadOwner(threadId, reqOwnerKey);
};

const normalizeScenarioKey = (value = '') => {
  const key = String(value || '').toLowerCase();
  if (key.startsWith('juris')) return 'jurisprudence';
  if (key.startsWith('text') || key.includes('analisis') || key.includes('análisis')) return 'text-analysis';
  if (key.includes('legal') || key.includes('writing') || key.includes('escritura')) return 'legal-writing';
  return 'default';
};

const getScenarioPrompt = (scenarioKey, lang) => {
  const scenarioPrompts = {
    'text-analysis': {
      es: 'Eres un asistente experto en análisis textual. Extraes ideas clave, clasificas temas y resumes información de forma clara.\n👉 No emites opiniones personales ni interpretaciones jurídicas salvo que el perfil activo sea jurídico.\n👉 Importante: Usa saltos de línea reales (`\\n`) entre párrafos, secciones y listas, para mejorar la legibilidad del contenido jurídico.',
      en: 'You are an expert assistant for textual and evidence analysis. You extract key insights, classify issues, and summarize legal information clearly.\n👉 Do not include personal opinions or legal interpretations unless the active scenario explicitly allows it.\n👉 Important: Use real line breaks (`\\n`) between paragraphs, sections, and lists to keep responses readable.',
      pt: 'Você é um assistente especializado em análise textual e de evidências. Você extrai ideias centrais, classifica temas e resume informações jurídicas com clareza.\n👉 Não apresente opiniões pessoais nem interpretações jurídicas além do permitido pelo cenário ativo.\n👉 Importante: Use quebras de linha reais (`\\n`) entre parágrafos, seções e listas para manter a leitura confortável.',
    },
    jurisprudence: {
      es: 'Eres un asistente jurídico especializado en interpretación de jurisprudencia y argumentación legal.\nHablas con lenguaje técnico-formal, redactas como un profesional del derecho colombiano.\n📚 Siempre que sea posible, citas sentencias, artículos constitucionales o normas relevantes.\n⚖️ No das consejos fuera del ámbito jurídico. Si el tema no es legal, responde educadamente que estás limitado a asuntos jurídicos.\n👉 Importante: Usa saltos de línea reales (`\\n`).',
      en: 'You are a constitutional attorney specialized in Colombian case law and legal argumentation.\nSpeak in a formal, technical tone and write like a Colombian legal professional.\n📚 Cite rulings, constitutional articles, or relevant statutes whenever possible.\n⚖️ Do not provide advice outside the legal domain. If the topic is not legal, politely explain that you are limited to Colombian legal matters.\n👉 Important: Use real line breaks (`\\n`).',
      pt: 'Você é um advogado constitucionalista especializado em jurisprudência colombiana e argumentação jurídica.\nUtilize um tom técnico e formal, redigindo como um profissional do direito colombiano.\n📚 Sempre que possível, cite sentenças, artigos constitucionais ou normas relevantes.\n⚖️ Não ofereça conselhos fora do âmbito jurídico. Se o tema não for legal, explique educadamente que sua atuação se limita ao direito colombiano.\n👉 Importante: Use quebras de linha reais (`\\n`).',
    },
    'legal-writing': {
      es: 'Eres un abogado redactor jurídico colombiano. Adaptas tu salida a la intención del usuario, siguiendo estas reglas:\n• Responde de forma concisa cuando la pregunta sea breve/factual.\n• Solo redactas documentos jurídicos estructurados cuando el usuario lo solicite explícitamente.\n• Si falta contexto esencial, formula UNA pregunta de aclaración.\n• No inventes datos cambiantes; indica que pueden variar.\n• Mantén precisión legal, lenguaje técnico y tono profesional.\n• Si el tema no es jurídico, indica que solo puedes ayudar con derecho colombiano.\n• Tablas siempre en formato Markdown con columnas ÍTEM, DESCRIPCIÓN, UNIDAD, CANTIDAD, V/UNITARIO, V/TOTAL.\n👉 Usa saltos de línea reales (`\\n`).',
      en: 'You are a Colombian legal writer. Adapt your response to the user intent, following these rules:\n• Keep answers concise when the question is short or factual.\n• Draft structured legal documents only when the user explicitly asks for them.\n• If essential context is missing, ask ONE clarifying question.\n• Never invent mutable data; state when figures may vary.\n• Maintain legal accuracy, technical language, and a professional tone.\n• If the topic is not legal, state that you can only help with Colombian law.\n• Any tables must use Markdown with the columns ITEM, DESCRIPTION, UNIT, QUANTITY, UNIT_VALUE, TOTAL_VALUE.\n👉 Use real line breaks (`\\n`).',
      pt: 'Você é um redator jurídico colombiano. Adapte sua resposta à intenção do usuário, seguindo estas regras:\n• Responda de forma concisa quando a pergunta for breve ou factual.\n• Só elabore documentos jurídicos estruturados quando o usuário solicitar explicitamente.\n• Se faltar contexto essencial, faça UMA pergunta de esclarecimento.\n• Não invente dados variáveis; indique quando os valores podem mudar.\n• Mantenha precisão legal, linguagem técnica e tom profissional.\n• Se o tema não for jurídico, informe que você só pode ajudar com direito colombiano.\n• Qualquer tabela deve usar Markdown com as colunas ITEM, DESCRIÇÃO, UNIDADE, QUANTIDADE, V/UNITÁRIO, V/TOTAL.\n👉 Use quebras de linha reais (`\\n`).',
    },
    default: {
      es: 'Eres un asistente jurídico que responde con claridad y precisión.',
      en: 'You are a legal assistant that answers with clarity and precision.',
      pt: 'Você é um assistente jurídico que responde com clareza e precisão.',
    },
  };
  const normalized = normalizeScenarioKey(scenarioKey);
  const profile = scenarioPrompts[normalized] || scenarioPrompts.default;
  const languageKey = getLanguageKey(lang);
  return profile[languageKey] || profile.es || scenarioPrompts.default.es;
};

const buildSystemPrompt = (basePrompt, language) => {
  const cleanedPrompt = basePrompt.replace(/\n+/g, '\n');
  if (language === 'pt') {
    return `Responda SEMPRE em português brasileiro (tom jurídico, profissional e respeitoso).\n${cleanedPrompt}`;
  }
  if (language === 'en') {
    return `Answer ONLY in clear professional English unless the user explicitly requests another language.\n${cleanedPrompt}`;
  }
  return `Responde SIEMPRE en español latino (tono profesional, jurídico, claro y respetuoso).\n${cleanedPrompt}`;
};

const buildDefaultUserPrompt = (lang, question) => {
  const languageKey = getLanguageKey(lang);
  if (languageKey === 'en') {
    return `User question: "${question}".`;
  }
  if (languageKey === 'pt') {
    return `Pergunta do usuário: "${question}".`;
  }
  return `Pregunta del usuario: "${question}".`;
};

const streamDeepseek = async ({ messages, temperature = 0.2, maxTokens = 1800, lang }) => {
  ensureDeepseekKey();
  const localized = messages.map((msg, idx) => {
    if (idx === 0 && msg.role === 'system') {
      return { ...msg, content: buildSystemPrompt(msg.content, lang) };
    }
    return msg;
  });
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY.trim()}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: localized,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });
  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(`DeepSeek error: ${response.status} ${message}`);
  }
  return response.body.getReader();
};

const writeStreamChunks = async ({ reader, res, onChunk }) => {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sepIndex;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex).trim();
      buffer = buffer.slice(sepIndex + 2);
      if (!rawEvent.startsWith('data:')) continue;
      const dataStr = rawEvent.slice(5).trim();
      if (!dataStr) continue;
      if (dataStr === '[DONE]') {
        onChunk('[DONE]');
        return;
      }
      try {
        const payload = JSON.parse(dataStr);
        const delta = payload.choices?.[0]?.delta?.content || '';
        if (delta) {
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          onChunk(delta);
        }
      } catch (e) {
        // ignore malformed chunks
      }
    }
  }
};

const persistMessages = async ({ threadId, text, responseText, email, userId, scenario }) => {
  await Message.insertMany([
    {
      sender: 'user',
      text,
      user_email: email,
      user_id: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      scenario,
      prompt: text,
      reply: null,
      threadId,
      timestamp: new Date(),
    },
    {
      sender: 'assistant',
      text: responseText,
      user_email: email,
      user_id: userId ? new mongoose.Types.ObjectId(userId) : undefined,
      scenario,
      prompt: text,
      reply: responseText,
      threadId,
      timestamp: new Date(),
    },
  ]);
};

const convertPlainTextTablesToMarkdown = (text) => {
  if (!text || typeof text !== 'string') return text;
  try {
    const lines = text.split('\n');
    const result = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (line && line.length > 15) {
        const parts = line.split(/\s{2,}/).filter((p) => p.trim().length > 0);
        const isHeaderLike =
          parts.length >= 3 &&
          (parts.every((p) => p.length < 25) ||
            /ÍTEM|ITEM|DESCRIPCIÓN|DESCRIPCION|UNIDAD|CANTIDAD|V\/UNITARIO|V\/TOTAL|TOTAL/i.test(line));
        const isDataRow =
          parts.length >= 3 &&
          (parts.some((p) => /^\d+/.test(p) || /^\$/.test(p) || /m²|m2|unidad/i.test(p)) ||
            parts.some((p) => p.length > 20));
        if (isHeaderLike || isDataRow) {
          const markdownRow = '| ' + parts.join(' | ') + ' |';
          result.push(markdownRow);
          if (isHeaderLike && i + 1 < lines.length) {
            const separator = '|' + parts.map(() => '---').join('|') + '|';
            result.push(separator);
          }
        } else {
          result.push(lines[i]);
        }
      } else {
        result.push(lines[i]);
      }
      i++;
    }
    return result.join('\n');
  } catch {
    return text;
  }
};

export const extractAndChat = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se adjuntaron archivos.' });
    }

    const { threadId, scenario, userMessage } = req.body || {};
    if (!threadId || !scenario) {
      return res.status(400).json({ error: 'Faltan parámetros (threadId, scenario)' });
    }
    const hasUserText = userMessage && String(userMessage).trim().length > 0;

    const { email, userId } = req.user || {};
    if (!email || !userId) {
      return res.status(401).json({ error: 'Usuario no autenticado o token inválido' });
    }

    // Verify thread ownership by checking ThreadMeta directly
    // This is simpler and more reliable than the cache-based ownership check
    const threadMeta = await ThreadMeta.findOne({ threadId }).lean();
    if (threadMeta) {
      // Thread exists - verify it belongs to this user
      if (threadMeta.user_email?.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ error: 'Este hilo pertenece a otro usuario.' });
      }
    }
    // If thread doesn't exist yet, that's okay - we'll create ThreadMeta when persisting messages

    // Set ownership in cache for consistency
    const reqOwnerKey = ownerKeyFromUser(req.user);
    setThreadOwner(threadId, reqOwnerKey);

    // Extract files
    const extractionResults = await Promise.all(
      req.files.map(async (file) => {
        try {
          return { status: 'ready', ...(await extractFile(file)) };
        } catch (error) {
          return {
            status: 'error',
            name: file.originalname,
            ext: file.originalname.split('.').pop()?.toLowerCase() ?? '',
            size: file.size,
            mimeType: file.mimetype,
            error: error?.message || 'No se pudo procesar el archivo.',
          };
        }
      }),
    );

    const successfulExtractions = extractionResults.filter((r) => r.status === 'ready' && r.text);
    if (successfulExtractions.length === 0) {
      return res.status(400).json({
        error: 'No se pudo extraer texto de ningún archivo.',
        files: extractionResults,
      });
    }

    // Store extracted files in Document model (Pepper 2.0)
    const documentPromises = successfulExtractions.map(async (file) => {
      try {
        const doc = new Document({
          threadId,
          user_id: new mongoose.Types.ObjectId(userId),
          user_email: email.toLowerCase(),
          scenario: threadScenarioKey,
          documentType: 'uploaded',
          fileName: file.name,
          fileExtension: file.ext,
          content: file.text,
          wordCount: file.wordCount || 0,
          status: 'ready',
          metadata: {
            title: file.name,
          },
        });
        await doc.save();
        return doc;
      } catch (error) {
        console.error('[fileController][storeDocument] Error storing document:', error);
        return null;
      }
    });

    const storedDocuments = (await Promise.all(documentPromises)).filter(Boolean);
    console.log(`[fileController] Stored ${storedDocuments.length} documents for thread ${threadId}`);

    // Combine extracted text for LLM processing
    const combinedText = successfulExtractions.map((f) => `[Archivo: ${f.name}]\n${f.text}`).join('\n\n---\n\n');

    // If user provided text, include it in the prompt
    const fullPromptText = hasUserText ? `${userMessage.trim()}\n\n${combinedText}` : combinedText;

    // Detect language from user message or extracted text
    const userLang = detectLanguageFromText(hasUserText ? userMessage : combinedText);
    const threadScenarioKey = String(scenario).toLowerCase().trim();

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send file extraction status
    res.write(
      `data: ${JSON.stringify({ content: `📄 Archivos procesados: ${successfulExtractions.length} archivo(s)\n\n` })}\n\n`,
    );

    // Get memory context
    let threadMetaDoc = null;
    let userMemoryDoc = null;
    try {
      threadMetaDoc = await ThreadMeta.findOne({ threadId, scenario: threadScenarioKey, user_email: email }).lean();
      userMemoryDoc = await UserMemory.findOne({ user_email: email }).select({ recentThreads: 1, facts: 1 }).lean();
    } catch (err) {
      console.warn('extractAndChat memory load failed', err?.message);
    }

    const cachedMessages = threadCache.get(threadId) || [];
    const cachedHistoryBlock =
      cachedMessages.length > 0
        ? cachedMessages
          .slice(-CACHE_HISTORY_LIMIT)
          .map((m) => `${m.role === 'user' ? 'Usuario' : 'Pepper'}: ${m.content?.[0]?.text?.value || m.text || ''}`)
          .join('\n')
        : '';

    const memoryBlock = threadMetaDoc?.summary
      ? `Resumen del hilo actual:\n${threadMetaDoc.summary}`
      : '';
    const contextualMemoryBlock = [memoryBlock, cachedHistoryBlock ? `Historial inmediato:\n${cachedHistoryBlock}` : null]
      .filter(Boolean)
      .join('\n\n');

    // Build prompt based on scenario
    const systemPrompt = getScenarioPrompt(threadScenarioKey, userLang);
    const userPrompt = contextualMemoryBlock
      ? `🧠 CONTEXTO PERSISTENTE:\n${contextualMemoryBlock}\n\n${buildDefaultUserPrompt(userLang, fullPromptText)}`
      : buildDefaultUserPrompt(userLang, fullPromptText);

    const messages = [
      { role: 'system', content: buildSystemPrompt(systemPrompt, userLang) },
      { role: 'user', content: userPrompt },
    ];

    // Stream response from DeepSeek
    const reader = await streamDeepseek({ messages, temperature: 0.7, maxTokens: 2000, lang: userLang });
    let fullResponse = '';
    await writeStreamChunks({
      reader,
      res,
      onChunk: (chunk) => {
        if (chunk === '[DONE]') return;
        fullResponse += chunk;
      },
    });

    const processed = convertPlainTextTablesToMarkdown(fullResponse);

    // Prepare attachments for persistence
    const fileAttachments = successfulExtractions.map((file) => ({
      name: file.name,
      ext: file.ext,
    }));

    // Save file message (with attachments, no text)
    await Message.insertMany([
      {
        sender: 'user',
        text: '', // Empty text for file-only message
        user_email: email,
        user_id: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        scenario: threadScenarioKey,
        prompt: '',
        reply: null,
        threadId,
        attachments: fileAttachments,
        timestamp: new Date(),
      },
    ]);

    // If user provided text, save it as a separate message
    if (hasUserText) {
      await Message.insertMany([
        {
          sender: 'user',
          text: userMessage.trim(),
          user_email: email,
          user_id: userId ? new mongoose.Types.ObjectId(userId) : undefined,
          scenario: threadScenarioKey,
          prompt: userMessage.trim(),
          reply: null,
          threadId,
          attachments: [], // No attachments for text message
          timestamp: new Date(),
        },
      ]);
    }

    // Save assistant response
    await Message.insertMany([
      {
        sender: 'assistant',
        text: processed,
        user_email: email,
        user_id: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        scenario: threadScenarioKey,
        prompt: hasUserText ? userMessage.trim() : '',
        reply: processed,
        threadId,
        timestamp: new Date(),
      },
    ]);

    // Update cache
    const fileCacheMessage = { role: 'user', content: [{ type: 'text', text: { value: '' } }], attachments: fileAttachments };
    const textCacheMessage = hasUserText ? { role: 'user', content: [{ type: 'text', text: { value: userMessage.trim() } }] } : null;
    const assistantCacheMessage = { role: 'assistant', content: [{ type: 'text', text: { value: processed } }] };
    const newCacheMessages = [fileCacheMessage, textCacheMessage, assistantCacheMessage].filter(Boolean);
    const updatedMessages = [...cachedMessages, ...newCacheMessages].slice(-CACHE_HISTORY_LIMIT);
    threadCache.set(threadId, updatedMessages);

    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
    return res.end();
  } catch (error) {
    console.error('extractAndChat error', error);
    const userLang = detectLanguageFromText(req.body?.text || '');
    const fallback = 'Lo siento, ocurrió un error al procesar los archivos.';
    res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
    return res.end();
  }
};


