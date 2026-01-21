import mongoose from 'mongoose';
import { fetch } from 'undici';
import Message from '../models/Message.js';
import ThreadMeta from '../models/ThreadMeta.js';
import UserMemory from '../models/UserMemory.js';
import Sentencia from '../models/Sentencia.js';
import Document from '../models/Document.js';
import { getExtractedTextsByIds } from './extractedTextController.js';
import { DASHBOARD_AGENT_SYSTEM_PROMPT, DASHBOARD_AGENT_SCENARIO_KEY, getDashboardAgentStartMessage } from './dashboardAgentController.js';
import { trackResourceUsage } from '../services/resourceTrackingService.js';

const threadCache = new Map(); // threadId -> messages cache
const threadOwner = new Map(); // threadId -> owner key

const MAX_MEMORY_SUMMARY_CHARS = 100000;
const SHORT_HISTORY_MAX = 8;
const CACHE_HISTORY_LIMIT = 20;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';

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
  'dashboard-agent': {
    es: DASHBOARD_AGENT_SYSTEM_PROMPT,
    en: DASHBOARD_AGENT_SYSTEM_PROMPT,
    pt: DASHBOARD_AGENT_SYSTEM_PROMPT,
  },
  default: {
    es: 'Eres un asistente jurídico que responde con claridad y precisión.',
    en: 'You are a legal assistant that answers with clarity and precision.',
    pt: 'Você é um assistente jurídico que responde com clareza e precisão.',
  },
};

const SUPPORTED_LANGUAGES = ['es', 'en', 'pt'];

const localeStrings = {
  jurisSearching: {
    es: '🔎 Consultando base de datos de sentencias…',
    en: '🔎 Searching the constitutional rulings database…',
    pt: '🔎 Consultando o banco de sentenças constitucionais…',
  },
  jurisNoMatches: {
    es: 'No encontré **sentencias** que coincidan con tu consulta en la base de datos.\n\n➡️ Este escenario está limitado a la búsqueda de sentencias curadas.',
    en: 'I could not find any **rulings** that match your query in the database.\n\n➡️ This scenario is limited to curated rulings searches.',
    pt: 'Não encontrei **sentenças** que correspondam à sua consulta no banco de dados.\n\n➡️ Este cenário é limitado à busca de sentenças selecionadas.',
  },
  textNoDocs: {
    es: 'No encontré análisis previos para tu usuario en **current_state**.\n\n➡️ Sube un documento o ejecuta un análisis para poder responder con esa información.',
    en: 'I could not find prior analyses for your user in **current_state**.\n\n➡️ Upload a document or run an analysis so I can reference that information.',
    pt: 'Não encontrei análises anteriores para seu usuário em **current_state**.\n\n➡️ Envie um documento ou execute uma análise para que eu possa usar essas informações.',
  },
  genericError: {
    es: 'Lo siento, ocurrió un error al procesar tu solicitud.',
    en: 'Sorry, something went wrong while processing your request.',
    pt: 'Desculpe, ocorreu um erro ao processar sua solicitação.',
  },
};

// Normalize scenario key consistently across the application
const normalizeScenarioKey = (scenario) => {
  if (!scenario) return null;
  const key = String(scenario).toLowerCase().trim();
  // Handle common variations
  if (key.includes('dashboard') || key.includes('agent')) {
    return 'dashboard-agent';
  }
  if (key.includes('legal') || key.includes('writing') || key.includes('escritura')) {
    return 'legal-writing';
  }
  if (key.includes('juris') || key.includes('jurisprudencia')) {
    return 'jurisprudence';
  }
  if (key.includes('text') || key.includes('analysis') || key.includes('analisis') || key.includes('análisis')) {
    return 'text-analysis';
  }
  return key;
};

export const getLanguageKey = (lang) => (SUPPORTED_LANGUAGES.includes(lang) ? lang : 'es');

const getScenarioPrompt = (scenarioKey, lang) => {
  const normalized = normalizeScenarioKey(scenarioKey);
  const profile = scenarioPrompts[normalized] || scenarioPrompts.default;
  const languageKey = getLanguageKey(lang);
  return profile[languageKey] || profile.es || scenarioPrompts.default.es;
};

const getLocaleString = (key, lang) => {
  const entry = localeStrings[key];
  if (!entry) return '';
  const languageKey = getLanguageKey(lang);
  return entry[languageKey] || entry.es || '';
};

/**
 * Estimate token count from text
 * Rough estimation: ~4 chars per token for English, ~2.5 for Spanish/Portuguese
 * @param {string} text - Text to estimate
 * @param {string} lang - Language code
 * @returns {number} Estimated token count
 */
const estimateTokens = (text, lang = 'es') => {
  if (!text || typeof text !== 'string') return 0;
  const languageKey = getLanguageKey(lang);
  // Average chars per token: English ~4, Spanish/Portuguese ~2.5
  const charsPerToken = languageKey === 'en' ? 4 : 2.5;
  return Math.ceil(text.length / charsPerToken);
};

const buildJurisUserPrompt = (lang, question, contextBlock) => {
  const languageKey = getLanguageKey(lang);
  if (languageKey === 'en') {
    return `📨 USER QUESTION:\n${question}\n\n📂 CONTEXT (Relevant rulings found in the database):\n${contextBlock}\n\n📜 INSTRUCTIONS:\n1️⃣ Answer ONLY with the context above.\n2️⃣ Do not make up names, articles, statutes, or rulings.\n3️⃣ Use Colombian legal language and structure.\n4️⃣ If the request is not legal, state that limitation.\n5️⃣ Use real line breaks (\\n).`;
  }
  if (languageKey === 'pt') {
    return `📨 PERGUNTA DO USUÁRIO:\n${question}\n\n📂 CONTEXTO (Sentenças relevantes encontradas no banco de dados):\n${contextBlock}\n\n📜 INSTRUÇÕES:\n1️⃣ Responda SOMENTE com base nesse contexto.\n2️⃣ Não invente nomes, artigos, normas ou sentenças.\n3️⃣ Utilize linguagem jurídica colombiana.\n4️⃣ Se o tema não for jurídico, explique essa limitação.\n5️⃣ Use quebras de linha reais (\\n).`;
  }
  return `📨 PREGUNTA DEL USUARIO:\n${question}\n\n📂 CONTEXTO (Sentencias relevantes encontradas en la base de datos):\n${contextBlock}\n\n📜 INSTRUCCIONES:\n1️⃣ Responde con base EXCLUSIVA en el contexto anterior.\n2️⃣ No inventes nombres, artículos, normas ni sentencias.\n3️⃣ Usa lenguaje jurídico colombiano.\n4️⃣ Si el contenido no es jurídico, responde que no puedes abordar ese tema.\n5️⃣ Usa saltos de línea reales (\\n).`;
};

const buildTextAnalysisUserPrompt = (lang, question, contextBlock, email) => {
  const languageKey = getLanguageKey(lang);
  const safeEmail = email || 'usuario';
  if (languageKey === 'en') {
    return `📨 USER QUESTION:\n${question}\n\n📂 CONTEXT (All current_state fields for user ${safeEmail}):\n${contextBlock}\n\n📜 INSTRUCTIONS:\n1️⃣ Answer ONLY with the context above.\n2️⃣ ❌ Do NOT copy or summarize that context unless explicitly asked.\n3️⃣ ✅ Respond directly to the request with legal rigor.\n4️⃣ Do not add external sources.\n5️⃣ Use Colombian legal terminology, a professional tone, and real line breaks (\\n).`;
  }
  if (languageKey === 'pt') {
    return `📨 PERGUNTA DO USUÁRIO:\n${question}\n\n📂 CONTEXTO (Todos os campos de current_state do usuário ${safeEmail}):\n${contextBlock}\n\n📜 INSTRUÇÕES:\n1️⃣ Responda APENAS com base nesse contexto.\n2️⃣ ❌ Não copie nem resuma o contexto, salvo se solicitado.\n3️⃣ ✅ Responda diretamente ao pedido com rigor jurídico.\n4️⃣ Não adicione fontes externas.\n5️⃣ Use terminologia jurídica colombiana, tom profissional e quebras de linha reais (\\n).`;
  }
  return `📨 PREGUNTA DEL USUARIO:\n${question}\n\n📂 CONTEXTO (Todos los campos de current_state del usuario ${safeEmail}):\n${contextBlock}\n\n📜 INSTRUCCIONES:\n1️⃣ Responde únicamente con base en ese contexto.\n2️⃣ ❌ No copies ni resumas el contexto salvo petición expresa.\n3️⃣ ✅ Responde directamente a la solicitud con rigor jurídico.\n4️⃣ No agregues fuentes externas.\n5️⃣ Usa lenguaje técnico jurídico colombiano y saltos de línea reales (\\n).`;
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

const ownerKeyFromUser = (user) => {
  if (!user) return null;
  const id = (user.userId || user._id || user.id || '').toString();
  const mail = (user.email || user.user_email || '').toLowerCase();
  return `${id}::${mail}`;
};

const defaultThreadTitle = (doc) => {
  const scenarioLabel =
    doc?.scenario === 'jurisprudence'
      ? 'Jurisprudencia'
      : doc?.scenario === 'legal-writing'
        ? 'Redacción legal'
        : 'Análisis de texto';
  const date = doc?.lastMessageAt || doc?.updatedAt;
  const formatted = date ? new Date(date).toLocaleString('es-CO') : '';
  return formatted ? `${scenarioLabel} • ${formatted}` : scenarioLabel;
};

const getThreadOwner = (threadId) => threadOwner.get(threadId) || null;
const setThreadOwner = (threadId, ownerKey) => {
  if (threadId && ownerKey) threadOwner.set(threadId, ownerKey);
};

const dropThreadArtifacts = (threadId) => {
  if (!threadId) return;
  threadCache.delete(threadId);
  threadOwner.delete(threadId);
};

const sanitizeText = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const buildCachedHistory = (messages) => {
  if (!Array.isArray(messages) || !messages.length) return '';
  const lines = messages
    .map((msg) => {
      const role = msg?.role === 'assistant' ? 'Pepper' : 'Usuario';
      const parts = Array.isArray(msg?.content)
        ? msg.content.map((chunk) => chunk?.text?.value ?? chunk?.text ?? chunk?.value ?? '').filter(Boolean)
        : [];
      const text = sanitizeText(parts.join(' '));
      if (!text) return null;
      return `${role}: ${text}`;
    })
    .filter(Boolean);
  return lines.join('\n');
};

const buildUpdatedSummary = (prevSummary, userText, assistantText) => {
  const segments = [];
  if (userText) segments.push(`Usuario: ${sanitizeText(userText)}`);
  if (assistantText) segments.push(`Pepper: ${sanitizeText(assistantText)}`);
  let next = prevSummary ? `${prevSummary}\n${segments.join('\n')}` : segments.join('\n');
  if (next.length > MAX_MEMORY_SUMMARY_CHARS) {
    next = next.slice(next.length - MAX_MEMORY_SUMMARY_CHARS);
  }
  return next;
};

async function updateUserMemory({ userEmail, userId, threadId, scenario, summary, lastMessageAt }) {
  if (!userEmail) return;
  const mem =
    (await UserMemory.findOne({ user_email: userEmail })) ||
    new UserMemory({ user_email: userEmail, user_id: userId, facts: [], recentThreads: [] });

  if (userId) mem.user_id = userId;
  mem.user_email = userEmail;

  const recent = mem.recentThreads || [];
  const filtered = recent.filter((item) => item.threadId !== threadId || item.scenario !== scenario);
  filtered.unshift({
    threadId,
    summary: summary ? summary.slice(-MAX_MEMORY_SUMMARY_CHARS) : '',
    scenario,
    lastMessageAt: lastMessageAt || new Date(),
  });
  mem.recentThreads = filtered.slice(0, 10);
  await mem.save();
}

async function updateThreadMeta({ threadId, userEmail, userId, scenario, userText, assistantText }) {
  if (!threadId || !userEmail || !scenario) return;
  const now = new Date();
  const meta =
    (await ThreadMeta.findOne({ threadId, scenario })) ||
    new ThreadMeta({
      threadId,
      user_email: userEmail,
      user_id: userId,
      scenario,
      summary: '',
      shortHistory: [],
    });

  meta.user_email = userEmail;
  if (userId) meta.user_id = userId;
  meta.scenario = scenario;
  meta.lastMessageAt = now;

  const summary = buildUpdatedSummary(meta.summary || '', userText, assistantText);
  meta.summary = summary;

  const shortHistory = meta.shortHistory || [];
  if (userText) shortHistory.push({ role: 'user', content: sanitizeText(userText), at: now });
  if (assistantText) shortHistory.push({ role: 'assistant', content: sanitizeText(assistantText), at: now });
  meta.shortHistory = shortHistory.slice(-SHORT_HISTORY_MAX);
  meta.messageCount = (meta.messageCount || 0) + (userText ? 1 : 0) + (assistantText ? 1 : 0);
  meta.tokensApprox = Math.round(summary.length / 4);

  await meta.save();
  await updateUserMemory({
    userEmail,
    userId,
    threadId,
    scenario,
    summary,
    lastMessageAt: now,
  });
}

async function removeThreadMeta(threadIds = [], userEmail) {
  if (!threadIds.length) return;
  await ThreadMeta.deleteMany({ threadId: { $in: threadIds } });
  if (userEmail) {
    const mem = await UserMemory.findOne({ user_email: userEmail });
    if (mem) {
      mem.recentThreads = (mem.recentThreads || []).filter((item) => !threadIds.includes(item.threadId));
      await mem.save();
    }
  }
}

const buildMemoryBlock = (metaDoc, userMemory, threadId, scenario) => {
  const segments = [];
  if (metaDoc?.summary) {
    segments.push(`Resumen del hilo actual:\n${metaDoc.summary}`);
  }
  if (metaDoc?.shortHistory?.length) {
    const formatted = metaDoc.shortHistory
      .map((entry) => `${entry.role === 'user' ? 'Usuario' : 'Pepper'}: ${entry.content}`)
      .join('\n');
    segments.push(`Intercambios recientes:\n${formatted}`);
  }
  if (userMemory?.recentThreads?.length) {
    const others = userMemory.recentThreads
      .filter((item) => item.threadId !== threadId && item.scenario === scenario)
      .slice(0, 3)
      .map((item) => `• Hilo ${item.threadId}: (${item.scenario || 'sin escenario'}) ${item.summary || ''}`);
    if (others.length) {
      segments.push(`Otros recuerdos recientes del usuario:\n${others.join('\n')}`);
    }
  }
  return segments.join('\n\n');
};

const augmentPromptWithMemory = (originalPrompt, memoryBlock) => {
  if (!memoryBlock || !memoryBlock.trim()) return originalPrompt;
  return `🧠 CONTEXTO PERSISTENTE:\n${memoryBlock}\n\n${originalPrompt}`;
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
            /^\d+\s+[A-ZÁÉÍÓÚÜÑ]/.test(line));
        if (isHeaderLike || isDataRow) {
          let tableRows = [parts];
          let j = i + 1;
          let consecutiveTableRows = 1;
          while (j < lines.length && consecutiveTableRows < 15) {
            const nextLine = lines[j].trim();
            if (!nextLine) break;
            const nextParts = nextLine.split(/\s{2,}/).filter((p) => p.trim().length > 0);
            if (nextLine.match(/^[\s\-:]+$/)) {
              j += 1;
              continue;
            }
            if (/^TOTAL/i.test(nextLine)) {
              tableRows.push(['TOTAL', ...nextParts.slice(1)]);
              j += 1;
              consecutiveTableRows += 1;
              continue;
            }
            if (
              nextParts.length >= 2 &&
              (nextParts.length === parts.length ||
                nextParts.length === parts.length - 1 ||
                nextParts.length === parts.length + 1)
            ) {
              tableRows.push(nextParts);
              consecutiveTableRows += 1;
              j += 1;
            } else {
              break;
            }
          }
          if (tableRows.length >= 2) {
            const colCounts = tableRows.map((r) => r.length);
            const mostCommonCols = Math.max(
              colCounts.reduce((a, b, _, arr) => (arr.filter((v) => v === a).length >= arr.filter((v) => v === b).length ? a : b)),
              tableRows[0].some((c) => /ÍTEM|ITEM/i.test(c)) ? 6 : 3,
            );
            const normalizedRows = tableRows.map((row, idx) => {
              const padded = [...row];
              while (padded.length < mostCommonCols) padded.push('');
              if (idx > 0 && /^TOTAL/i.test(row[0])) {
                const totalRow = ['TOTAL'];
                for (let k = 1; k < mostCommonCols; k += 1) {
                  totalRow.push(row[k] || '');
                }
                return totalRow.slice(0, mostCommonCols);
              }
              return padded.slice(0, mostCommonCols);
            });
            const headerRow = normalizedRows[0].map((cell) => {
              const trimmed = cell.trim();
              return trimmed.length > 0 ? trimmed : '—';
            });
            const separator = '|' + headerRow.map(() => '---').join('|') + '|';
            result.push('| ' + headerRow.join(' | ') + ' |');
            result.push(separator);
            for (let k = 1; k < normalizedRows.length; k += 1) {
              const row = normalizedRows[k].map((cell) => {
                const trimmed = cell.trim();
                return trimmed.length > 0 ? trimmed : '—';
              });
              result.push('| ' + row.join(' | ') + ' |');
            }
            result.push('');
            i = j;
            continue;
          }
        }
      }
      result.push(lines[i]);
      i += 1;
    }
    return result.join('\n');
  } catch (err) {
    console.error('convertPlainTextTablesToMarkdown err', err);
    return text;
  }
};

const buildMemorySnapshot = async ({ threadId, userEmail, userId, scenario, userText, assistantText }) => {
  if (!scenario) return;
  try {
    await updateThreadMeta({ threadId, userEmail, userId, scenario, userText, assistantText });
  } catch (error) {
    console.warn('persist memory failed', error?.message);
  }
};

const norm = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const safeArray = (x) => (Array.isArray(x) ? x : []);
const getAllFromDocs = (docs, key) => {
  const out = [];
  for (const d of docs) {
    // Support both old current_state format and new Document model format
    const v = d?.[key] || d?.metadata?.[key];
    if (Array.isArray(v)) out.push(...v);
    else if (v != null) out.push(v);
  }
  return out;
};

/**
 * Load text-analysis context from Document model (Pepper 2.0)
 * Replaces old current_state collection queries
 */
async function loadTextAnalysisContext(threadId, userId, userEmail) {
  try {
    // Load all documents for this thread
    const documents = await Document.find({ threadId, user_id: userId }).sort({ createdAt: -1 });

    // If no documents found, try fallback to user_email (for migration period)
    if (!documents.length && userEmail) {
      const fallbackDocs = await Document.find({ user_email: userEmail.toLowerCase(), scenario: 'text-analysis' })
        .sort({ createdAt: -1 })
        .limit(10);
      return fallbackDocs;
    }

    return documents;
  } catch (error) {
    console.error('[text-analysis][loadContext] Error loading documents:', error);
    return [];
  }
}

/**
 * Build context block from Document model documents
 * Formats documents similar to old current_state format for compatibility
 */
function buildContextBlockFromDocuments(documents) {
  if (!documents || !documents.length) return '';

  const EXCLUDE_KEYS = new Set(['_id', '__v', 'threadId', 'user_id', 'user_email', 'scenario', 'createdAt', 'updatedAt', 'timestamp']);
  const stringifyValue = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  const parts = [];
  documents.forEach((doc, i) => {
    const title = doc.metadata?.title || doc.fileName || `Documento ${i + 1}`;
    parts.push(`\n================ DOCUMENTO ${i + 1}: ${title} ================\n`);

    // Include main content
    if (doc.content) {
      parts.push(`\n[content]\n${doc.content}\n`);
    }

    // Include metadata fields
    if (doc.metadata) {
      Object.entries(doc.metadata).forEach(([k, v]) => {
        if (EXCLUDE_KEYS.has(k)) return;
        const rendered = stringifyValue(v);
        if (rendered && rendered.trim().length) {
          parts.push(`\n[${k}]\n${rendered}\n`);
        }
      });
    }

    // Include top-level fields for backward compatibility
    Object.entries(doc.toObject()).forEach(([k, v]) => {
      if (EXCLUDE_KEYS.has(k) || k === 'metadata' || k === 'content') return;
      const rendered = stringifyValue(v);
      if (rendered && rendered.trim().length) {
        parts.push(`\n[${k}]\n${rendered}\n`);
      }
    });
  });

  return parts.join('');
}

/**
 * Build master document for dashboard
 * Aggregates all documents and analyses for a user's text-analysis threads
 */
async function buildMasterDocument(userId, userEmail, threadId = null) {
  try {
    const query = { user_id: userId, scenario: 'text-analysis' };
    if (threadId) {
      query.threadId = threadId;
    }

    const documents = await Document.find(query).sort({ createdAt: -1 });

    if (!documents.length) {
      return null;
    }

    // Aggregate all analysis results
    const aggregated = {
      allDocuments: documents.map(doc => ({
        id: doc._id,
        threadId: doc.threadId,
        fileName: doc.fileName,
        documentType: doc.documentType,
        createdAt: doc.createdAt,
        wordCount: doc.wordCount,
      })),
      allAnalyses: {
        sentence_result: getAllFromDocs(documents, 'sentence_result'),
        sentencia_list: getAllFromDocs(documents, 'sentencia_list'),
        evidence_checklist: getAllFromDocs(documents, 'evidence_checklist'),
        evidencias_cumplen: getAllFromDocs(documents, 'evidencias_cumplen'),
        evidencias_no_cumplen: getAllFromDocs(documents, 'evidencias_no_cumplen'),
        constitution: documents.find(d => d.metadata?.constitution || d.content)?.metadata?.constitution ||
          documents.find(d => d.content)?.content || '',
        articulo_result: getAllFromDocs(documents, 'articulo_result'),
        pdf_content: documents.map(d => d.metadata?.pdf_content || d.content).filter(Boolean).join('\n\n---\n\n'),
        pdf_resume: documents.map(d => d.metadata?.pdf_resume).filter(Boolean).join('\n\n---\n\n'),
        resultados: documents.map(d => d.metadata?.resultados).filter(Boolean).join('\n\n---\n\n'),
      },
      totalDocuments: documents.length,
      totalWordCount: documents.reduce((sum, d) => sum + (d.wordCount || 0), 0),
      lastUpdated: documents[0]?.updatedAt || documents[0]?.createdAt || new Date(),
    };

    // Get conversation summaries from threads
    const threadIds = [...new Set(documents.map(d => d.threadId).filter(Boolean))];
    if (threadIds.length) {
      const threadMetas = await ThreadMeta.find({
        threadId: { $in: threadIds },
        scenario: 'text-analysis'
      }).sort({ lastMessageAt: -1 });

      aggregated.conversationSummaries = threadMetas.map(tm => ({
        threadId: tm.threadId,
        summary: tm.summary,
        title: tm.title,
        lastMessageAt: tm.lastMessageAt,
        messageCount: tm.messageCount,
      }));
    }

    return aggregated;
  } catch (error) {
    console.error('[master-document][build] Error building master document:', error);
    return null;
  }
}

const buildArticlesIndex = (txt) => {
  const index = {};
  if (!txt) return index;
  let matched = false;
  const reBold = /\*\*\s*Art[íi]culo\s+(\d+)\.\s*\*\*([\s\S]*?)(?=\*\*\s*Art[íi]culo\s+\d+\.\s*\*\*|$)/gi;
  let m;
  while ((m = reBold.exec(txt)) !== null) {
    matched = true;
    index[m[1]] = m[2].trim();
  }
  if (!matched) {
    const rePlain = /(^|\n)\s*Art[íi]culo\s+(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*Art[íi]culo\s+\d+\.|$))/gi;
    let mp;
    while ((mp = rePlain.exec(txt)) !== null) {
      index[mp[2]] = (mp[3] || '').trim();
    }
  }
  return index;
};

const isRightsSupportQuery = (q) =>
  /\bque\s+articulos?.*\b(soportan|sustentan|fundamentan|amparan|protegen)\b/.test(q) ||
  /\b(base|fundamento)\s+constitucional\b/.test(q) ||
  /\barticulos?.*sobre\s+el\s+derecho\b/.test(q);

const extractRightKeywords = (qNorm) => {
  const LEX = [
    { key: 'igualdad', kw: ['igualdad', 'no discriminacion', 'discriminacion'] },
    { key: 'dignidad', kw: ['dignidad', 'dignidad humana'] },
    { key: 'vida', kw: ['vida', 'pena de muerte'] },
    { key: 'integridad', kw: ['integridad', 'torturas', 'tratos crueles', 'degradantes', 'inhumanos'] },
    { key: 'libre_desarrollo', kw: ['libre desarrollo de la personalidad', 'desarrollo de la personalidad', 'libre desarrollo'] },
    { key: 'expresion', kw: ['libertad de expresion', 'expresion', 'opinion'] },
    { key: 'educacion', kw: ['educacion', 'estudio'] },
    { key: 'salud', kw: ['salud'] },
    { key: 'familia', kw: ['familia'] },
  ];
  const m = qNorm.match(/\bderech[oa]s?\s+(?:a|al|a la|a los|a las)?\s*([a-z0-9\s]{3,})/);
  const focus = m ? m[1].trim() : qNorm;
  const hit = new Set();
  for (const e of LEX) {
    for (const k of e.kw) {
      if (focus.includes(k)) {
        hit.add(e.key);
        break;
      }
    }
  }
  if (!hit.size) {
    const raw = focus.replace(/\b(del|de|la|el|los|las|y|o|en|para|por|un|una|que|se|al)\b/g, ' ').trim();
    const toks = raw.split(/\s+/).filter((w) => w.length > 2);
    return [...new Set(toks)].slice(0, 6);
  }
  const out = [];
  for (const e of LEX) if (hit.has(e.key)) out.push(...e.kw);
  return [...new Set(out)];
};

const scoreArticle = (text, keywords) => {
  const n = norm(text);
  let score = 0;
  for (const k of keywords) {
    const kk = norm(k);
    const rx = new RegExp(`\\b${kk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    const matches = n.match(rx);
    if (matches) score += matches.length * (kk.length >= 8 ? 2 : 1);
  }
  return score;
};

const snippetAround = (text, keywords, maxLen = 220) => {
  const lower = norm(text);
  let pos = -1;
  for (const k of keywords) {
    const kk = norm(k);
    const i = lower.indexOf(kk);
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) return text.slice(0, maxLen).trim() + (text.length > maxLen ? '…' : '');
  const start = Math.max(0, pos - 100);
  const end = Math.min(text.length, pos + 100);
  const raw = text.slice(start, end).trim();
  return (start > 0 ? '…' : '') + raw + (end < text.length ? '…' : '');
};

const answerArticlesSupportingRight = (question, constitutionText = '', articuloResult = []) => {
  if (!isRightsSupportQuery(norm(question))) return null;
  if (!constitutionText) {
    const arts = Array.isArray(articuloResult) ? articuloResult : [];
    return arts.length
      ? `Base constitucional identificada en el expediente: Art. ${arts.join(', ')}.`
      : 'No tengo el texto constitucional cargado en este expediente.';
  }
  const idx = buildArticlesIndex(constitutionText);
  const articles = Object.keys(idx);
  if (!articles.length) return 'No pude indexar artículos de la Constitución en este expediente.';
  const keywords = extractRightKeywords(norm(question));
  if (!keywords.length) {
    const arts = Array.isArray(articuloResult) ? articuloResult : [];
    return arts.length
      ? `Base constitucional identificada: Art. ${arts.join(', ')}.`
      : 'Indícame el derecho concreto para mostrar los artículos pertinentes.';
  }
  const scored = articles
    .map((num) => {
      const text = idx[num] || '';
      return { num, score: scoreArticle(text, keywords), text };
    })
    .filter((r) => r.score > 0);
  if (!scored.length) {
    const arts = Array.isArray(articuloResult) ? articuloResult : [];
    return arts.length ? `Puedes revisar: Art. ${arts.join(', ')}.` : 'No encontré coincidencias claras en el texto constitucional.';
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);
  const bullets = top.map((r) => `• **Art. ${r.num}** — ${snippetAround(r.text, keywords)}`).join('\n');
  const rest = scored.length > 3 ? `\n\nOtros posibles: Art. ${scored.slice(3, Math.min(6, scored.length)).map((x) => x.num).join(', ')}.` : '';
  return `Artículos pertinentes según el texto del expediente:\n${bullets}${rest}`;
};

const answerApellidoDemandante = (question, docs) => {
  const qn = norm(question);
  if (!/\b(apellid[oa]s?)\b.*\b(demandante|accionante)\b/.test(qn)) return null;
  const candidates = [];
  for (const d of docs) {
    // Support both old current_state format and new Document model format
    const pdfContent = d.pdf_content || d.metadata?.pdf_content || d.content;
    const pdfResume = d.pdf_resume || d.metadata?.pdf_resume;
    const resultados = d.resultados || d.metadata?.resultados;
    const title = d.title || d.metadata?.title || d.fileName;
    const content = [pdfContent, pdfResume, resultados, title].filter(Boolean).join('\n');
    if (!content) continue;
    const lines = content.split(/\n/);
    for (const line of lines) {
      let m;
      if ((m = line.match(/DEMANDANTE:\s*([^\n]+)/i))) candidates.push(m[1].replace(/\[[^\]]*\]/g, '').trim());
      if ((m = line.match(/\bYo,\s*([^,]+),/i))) candidates.push(m[1].replace(/\[[^\]]*\]/g, '').trim());
      if ((m = line.match(/\bAccionante:\s*([^\n]+)/i))) candidates.push(m[1].replace(/\[[^\]]*\]/g, '').trim());
    }
  }
  const clean = candidates
    .map((s) => s.replace(/["'“" "]/g, '').trim())
    .filter((s) => s && !/^\[/.test(s) && !/N\/?A|S\.?A\.?/.test(s));
  let best = clean.find((s) => /\s/.test(s)) || clean[0] || null;
  if (!best) {
    for (const d of docs) {
      // Support both old current_state format and new Document model format
      const pdfContent = d.pdf_content || d.metadata?.pdf_content || d.content || '';
      const m = pdfContent.match(/\bDEMANDANTE:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)\b/);
      if (m) return `No aparece el apellido en el expediente analizado; el nombre consignado es "${m[1]}".`;
    }
    return 'No encuentro el apellido de la demandante en el material cargado.';
  }
  const tokens = best.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const nombre = tokens[0];
    const apellido = tokens.slice(1).join(' ');
    return `Apellido de la demandante: **${apellido}**.\nNombre completo consignado: **${best}**.`;
  }
  return `No aparece el apellido en el expediente; el nombre consignado es "${best}".`;
};

const answerSentenciaQuestion = (question, docs) => {
  const qn = norm(question);
  if (!/\bsentenci|jurisprudenc|providenci|t-\d|c-\d|su-\d/.test(qn)) return null;
  const list = getAllFromDocs(docs, 'sentencia_list');
  const results = getAllFromDocs(docs, 'sentence_result');
  const provMatch = question.match(/\b([A-Z]{1,3}-\d{2,3}-\d{2})\b/i);
  const provCode = provMatch ? provMatch[1].toUpperCase() : null;
  if (!provCode && /\b(lista|relacionad|vinculad|cuáles|cuales|que\s+sentencias?)\b/.test(qn)) {
    const rows = (results.length ? results : list)
      .slice(0, 8)
      .map((s) => {
        const p = s.providencia || s.providencia?.trim?.() || s.providencia;
        const f = s.fecha_sentencia || '';
        const m = s.magistrado || (s.sujeto ? '' : '');
        const d = s.derechos || (Array.isArray(s.derechos) ? s.derechos.join(', ') : '');
        return `• ${p || '—'}${f ? ` — ${f}` : ''}${m ? ` — ${m}` : ''}${d ? ` — ${d}` : ''}`;
      })
      .filter(Boolean);
    if (!rows.length) return 'No encuentro sentencias relacionadas en el expediente cargado.';
    return `Sentencias relacionadas registradas en el expediente:\n${rows.join('\n')}`;
  }
  if (provCode) {
    const s =
      results.find((x) => String(x.providencia || '').toUpperCase() === provCode) ||
      list.find((x) => String(x.providencia || '').toUpperCase() === provCode);
    if (!s) return `No encontré la providencia ${provCode} en el expediente.`;
    const wants = {
      mag: /\bmagistrad/.test(qn),
      exp: /\bexpedient/.test(qn),
      der: /\bderech/.test(qn),
      fec: /\bfech/.test(qn),
      url: /\burl|enlace|hipervinculo|hipervínculo/.test(qn),
      res: /\bresumen|sintesis|síntesis|tema\b/.test(qn),
    };
    if (wants.mag && s.magistrado) return `Magistrado(a) en ${provCode}: **${s.magistrado}**.`;
    if (wants.exp && s.expediente) return `Expediente de ${provCode}: **${s.expediente}**.`;
    if (wants.der && s.derechos) {
      const d = Array.isArray(s.derechos) ? s.derechos.join(', ') : s.derechos;
      return `Derechos en ${provCode}: ${d || 'no disponibles en el expediente'}.`;
    }
    if (wants.fec && s.fecha_sentencia) return `Fecha de ${provCode}: **${s.fecha_sentencia}**.`;
    if (wants.url && s.url) return `URL oficial de ${provCode}: ${s.url}`;
    if (wants.res) {
      const hr = s.hechos_relevantes || s.tema;
      if (hr) return `Resumen breve de ${provCode}: ${hr}`;
      return `No tengo un resumen almacenado para ${provCode}.`;
    }
    const lines = [];
    if (s.providencia) lines.push(`• Providencia: ${s.providencia}`);
    if (s.fecha_sentencia) lines.push(`• Fecha: ${s.fecha_sentencia}`);
    if (s.magistrado) lines.push(`• Magistrado: ${s.magistrado}`);
    if (s.expediente) lines.push(`• Expediente: ${s.expediente}`);
    if (s.derechos) lines.push(`• Derechos: ${Array.isArray(s.derechos) ? s.derechos.join(', ') : s.derechos}`);
    if (s.hechos_relevantes) lines.push(`• Hechos relevantes: ${s.hechos_relevantes}`);
    if (s.url) lines.push(`• URL: ${s.url}`);
    return lines.length ? lines.join('\n') : `No hay metadatos suficientes de ${provCode} en el expediente.`;
  }
  return null;
};

const answerEvidenceQuestion = (question, docs) => {
  const qn = norm(question);
  if (!/\bevidenc|prueb|checklist|lista de control|por que.*cumple|porque.*cumple|no cumple/.test(qn)) return null;
  const checklist = getAllFromDocs(docs, 'evidence_checklist');
  const cumplen = getAllFromDocs(docs, 'evidencias_cumplen');
  const noCumplen = getAllFromDocs(docs, 'evidencias_no_cumplen');
  if (!checklist.length && !cumplen.length && !noCumplen.length) {
    return 'No encuentro un bloque de evidencias en el expediente cargado.';
  }
  let whyTarget = null;
  const m = question.match(/por qu[eé]\s+(?:marcaste\s+)?(.+?)\s+cumple/i);
  if (m) whyTarget = norm(m[1]);
  if (whyTarget && cumplen.length) {
    const hits = cumplen.filter(
      (e) => norm(e.descripcion).includes(whyTarget) || norm(e.subevidencia || '').includes(whyTarget),
    );
    if (hits.length) {
      const rows = hits.slice(0, 6).map((e) => `• ${e.descripcion} → ${e.subevidencia}: **${e.resultado}**`);
      return `Marcado como "cumple" por:\n${rows.join('\n')}`;
    }
  }
  const bullets = [];
  if (checklist.length) {
    for (const item of checklist.slice(0, 5)) {
      const evs = Array.isArray(item.evidencias) ? item.evidencias.slice(0, 4) : [];
      const sub = evs
        .map((ev) => `   - (${ev.tipo}) ${ev.descripcion}${ev.archivo ? ` — ${ev.archivo}` : ''}`)
        .join('\n');
      bullets.push(`• ${item.descripcion}${sub ? `\n${sub}` : ''}`);
    }
  }
  const status = [];
  if (cumplen.length) status.push(`✅ Cumplen: ${cumplen.length}`);
  if (noCumplen.length) status.push(`⚠️ No cumplen: ${noCumplen.length}`);
  return `${status.join(' · ')}\n${bullets.join('\n')}`;
};

const tryQuickAnswersTextAnalysis = (question, docs) => {
  const r1 = answerApellidoDemandante(question, docs);
  if (r1) return r1;
  const r2 = answerSentenciaQuestion(question, docs);
  if (r2) return r2;
  const r3 = answerEvidenceQuestion(question, docs);
  if (r3) return r3;
  let constitutionText = '';
  let articuloResult = [];
  for (const d of docs) {
    // Support both old current_state format and new Document model format
    if (!constitutionText) {
      constitutionText = d.constitution || d.metadata?.constitution || '';
    }
    if (Array.isArray(d.articulo_result)) {
      articuloResult = d.articulo_result;
    } else if (Array.isArray(d.metadata?.articulo_result)) {
      articuloResult = d.metadata.articulo_result;
    }
  }
  const r4 = answerArticlesSupportingRight(question, constitutionText, articuloResult);
  if (r4) return r4;
  return null;
};

const ensureDeepseekKey = () => {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }
};

export const createThread = async (req, res) => {
  const threadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    threadCache.set(threadId, []);
  } catch (error) {
    console.warn('threadCache init failed', error?.message);
  }
  const { email } = req.user || {};
  const scenario = req.body?.scenario || req.query?.scenario || null;
  // Normalize scenario key consistently
  const normalizedScenario = normalizeScenarioKey(scenario);
  const ownerKey = ownerKeyFromUser(req.user);
  if (ownerKey) setThreadOwner(threadId, ownerKey);

  if (email && normalizedScenario) {
    try {
      await ThreadMeta.findOneAndUpdate(
        { threadId, scenario: normalizedScenario },
        {
          $setOnInsert: {
            threadId,
            scenario: normalizedScenario, // Use normalized key
            user_email: email,
            summary: '',
            shortHistory: [],
            messageCount: 0,
            title: '',
          },
          $set: { lastMessageAt: new Date() },
        },
        { upsert: true, new: true },
      );
      await updateUserMemory({
        userEmail: email,
        userId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
        threadId,
        scenario: normalizedScenario, // Use normalized key
        summary: '',
        lastMessageAt: new Date(),
      });
    } catch (err) {
      console.warn('createThread meta init failed', err?.message);
    }
  }
  return res.json({ threadId });
};

export const listMessages = async (req, res) => {
  try {
    const { threadId } = req.query;
    if (!threadId) {
      return res.json({ messages: [], status: 'completed', scenario: null, user: { email: null, id: null } });
    }
    const reqOwnerKey = ownerKeyFromUser(req.user);
    let cachedOwner = getThreadOwner(threadId);
    if (!cachedOwner) {
      const lastMeta = await Message.findOne({ threadId })
        .sort({ timestamp: -1, _id: -1 })
        .select({ user_email: 1, user_id: 1 })
        .lean();
      const mongoOwnerKey = ownerKeyFromUser({ _id: lastMeta?.user_id, email: lastMeta?.user_email });
      if (mongoOwnerKey) {
        setThreadOwner(threadId, mongoOwnerKey);
        cachedOwner = mongoOwnerKey;
      }
    }
    if (cachedOwner && reqOwnerKey && cachedOwner !== reqOwnerKey) {
      return res.json({
        messages: [],
        status: 'forbidden',
        scenario: null,
        user: { email: null, id: null },
        reason: 'thread-belongs-to-other-user',
      });
    }
    let messages = threadCache.get(threadId);
    let scenarioForThread = null;
    let userForThread = { email: null, id: null };
    if (!Array.isArray(messages) || messages.length === 0) {
      const docs = await Message.find({ threadId }).sort({ timestamp: 1 }).limit(60).lean();
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        if (scenarioForThread == null && docs[i]?.scenario) scenarioForThread = String(docs[i].scenario);
        if ((userForThread.email == null || userForThread.id == null) && (docs[i]?.user_email || docs[i]?.user_id)) {
          userForThread = { email: docs[i]?.user_email ?? null, id: docs[i]?.user_id ?? null };
        }
        if (scenarioForThread != null && (userForThread.email != null || userForThread.id != null)) break;
      }
      messages = docs.map((d) => {
        const role = d.sender === 'assistant' ? 'assistant' : 'user';
        const text = d.text || d.reply || '';
        const attachments = Array.isArray(d.attachments) ? d.attachments : [];
        return {
          role,
          content: [{ type: 'text', text: { value: text || '' } }],
          attachments: attachments.length > 0 ? attachments : undefined,
          timestamp: d.timestamp,
        };
      });
      if (messages.length) {
        threadCache.set(threadId, messages.slice(-CACHE_HISTORY_LIMIT));
      }
    } else if (!scenarioForThread || (userForThread.email == null && userForThread.id == null)) {
      const lastMeta = await Message.findOne({
        threadId,
        $or: [{ scenario: { $exists: true, $ne: null } }, { user_email: { $exists: true } }, { user_id: { $exists: true } }],
      })
        .sort({ timestamp: -1, _id: -1 })
        .select({ scenario: 1, user_email: 1, user_id: 1 })
        .lean();
      if (lastMeta) {
        if (!scenarioForThread && lastMeta.scenario) scenarioForThread = String(lastMeta.scenario);
        if (userForThread.email == null || userForThread.id == null) {
          userForThread = { email: lastMeta.user_email ?? null, id: lastMeta.user_id ?? null };
        }
      }
    }
    let threadMetaDoc = null;
    let userMemoryDoc = null;
    if (scenarioForThread && (userForThread?.email || req.user?.email)) {
      const email = userForThread?.email || req.user?.email;
      try {
        threadMetaDoc = await ThreadMeta.findOne({ threadId, scenario: scenarioForThread, user_email: email }).lean();
        userMemoryDoc = await UserMemory.findOne({ user_email: email }).select({ recentThreads: 1, facts: 1 }).lean();
      } catch (err) {
        console.warn('listMessages memory lookup failed', err?.message);
      }
    }
    const memoryBlock = buildMemoryBlock(threadMetaDoc, userMemoryDoc, threadId, scenarioForThread);
    return res.json({
      messages: messages || [],
      status: 'completed',
      scenario: scenarioForThread,
      user: userForThread,
      memory: {
        summary: threadMetaDoc?.summary || '',
        shortHistory: threadMetaDoc?.shortHistory || [],
        messageCount: threadMetaDoc?.messageCount || (messages?.length ?? 0),
        recentThreads: (userMemoryDoc?.recentThreads || []).filter((item) => item.scenario === scenarioForThread),
        facts: userMemoryDoc?.facts || [],
        memoryBlock,
      },
    });
  } catch (error) {
    console.error('listMessages error', error);
    return res.json({ messages: [], status: 'completed', scenario: null, user: { email: null, id: null } });
  }
};

export const listThreads = async (req, res) => {
  try {
    const { email } = req.user || {};
    if (!email) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    const docs = await ThreadMeta.find({ user_email: email }).sort({ lastMessageAt: -1 }).lean();
    const threads = docs.map((doc) => ({
      threadId: doc.threadId,
      title: doc.title?.trim() || defaultThreadTitle(doc),
      scenario: doc.scenario || 'text-analysis',
      updatedAt: doc.lastMessageAt || doc.updatedAt || null,
    }));
    return res.json({ threads });
  } catch (error) {
    console.error('listThreads error', error);
    return res.status(500).json({ error: 'No se pudo obtener la lista de conversaciones.' });
  }
};

export const updateThreadTitle = async (req, res) => {
  try {
    const { email } = req.user || {};
    const { threadId } = req.params;
    const { title } = req.body || {};
    if (!email) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    if (!threadId || typeof title !== 'string') {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const trimmed = title.trim().slice(0, 160);
    const updated = await ThreadMeta.findOneAndUpdate(
      { threadId, user_email: email },
      { $set: { title: trimmed } },
      { new: true },
    ).lean();
    if (!updated) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    return res.json({
      thread: {
        threadId,
        title: updated.title || defaultThreadTitle(updated),
        scenario: updated.scenario || 'text-analysis',
        updatedAt: updated.lastMessageAt || updated.updatedAt || null,
      },
    });
  } catch (error) {
    console.error('updateThreadTitle error', error);
    return res.status(500).json({ error: 'No se pudo actualizar el nombre de la conversación.' });
  }
};

export const clearHistory = async (req, res) => {
  try {
    const { email, userId } = req.user || {};
    if (!email || !userId) {
      return res.status(403).json({ ok: false, error: 'Usuario no autenticado' });
    }
    const { threadIds } = req.body || {};
    const baseFilter = { user_email: email };
    if (Array.isArray(threadIds) && threadIds.length) {
      baseFilter.threadId = { $in: threadIds };
    }
    const ownedThreadIds = await Message.distinct('threadId', baseFilter);
    const reqOwnerKey = ownerKeyFromUser(req.user);
    const cacheOnlyThreadIds = [];
    if (reqOwnerKey && Array.isArray(threadIds)) {
      for (const tid of threadIds) {
        if (!ownedThreadIds.includes(tid)) {
          const cachedOwner = getThreadOwner(tid);
          if (!cachedOwner || cachedOwner === reqOwnerKey) {
            cacheOnlyThreadIds.push(tid);
          }
        }
      }
    }
    if (!ownedThreadIds.length) {
      cacheOnlyThreadIds.forEach(dropThreadArtifacts);
      await removeThreadMeta(cacheOnlyThreadIds, email);
      return res.json({ ok: true, deleted: 0, threadIds: cacheOnlyThreadIds });
    }
    const deleteResult = await Message.deleteMany({
      user_email: email,
      threadId: { $in: ownedThreadIds },
    });
    const cleanupTargets = [...new Set([...ownedThreadIds, ...cacheOnlyThreadIds])];
    cleanupTargets.forEach(dropThreadArtifacts);
    await removeThreadMeta(cleanupTargets, email);
    return res.json({
      ok: true,
      deleted: deleteResult?.deletedCount || 0,
      threadIds: cleanupTargets,
    });
  } catch (error) {
    console.error('clearHistory error', error);
    return res.status(500).json({ ok: false, error: 'No se pudo borrar el historial.' });
  }
};

export const deleteThread = async (req, res) => {
  try {
    const { email, userId } = req.user || {};
    const { threadId } = req.params;
    if (!email || !threadId) {
      return res.status(400).json({ error: 'Parámetros inválidos' });
    }
    const owned = await ThreadMeta.findOne({ threadId, user_email: email });
    if (!owned) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    await Message.deleteMany({ user_email: email, threadId });
    await ThreadMeta.deleteOne({ threadId, user_email: email });
    await removeThreadMeta([threadId], email);
    dropThreadArtifacts(threadId);
    return res.json({ ok: true, threadId });
  } catch (error) {
    console.error('deleteThread error', error);
    return res.status(500).json({ error: 'No se pudo eliminar la conversación.' });
  }
};

const ensureThreadOwner = async (threadId, reqOwnerKey) => {
  let currentOwner = getThreadOwner(threadId);
  if (!currentOwner) {
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
  if (currentOwner && currentOwner !== reqOwnerKey) {
    const err = new Error('THREAD_OWNERSHIP_MISMATCH');
    err.code = 'THREAD_OWNERSHIP_MISMATCH';
    throw err;
  }
  if (!currentOwner) setThreadOwner(threadId, reqOwnerKey);
};

export const detectLanguageFromText = (text = '') => {
  const sample = (text || '').trim();
  if (!sample) return 'es';
  const hasSpanishAccents = /[áéíóúñü¿¡]/i.test(sample);
  const hasPortugueseAccents = /[ãõâêôç]/i.test(sample);
  if (hasPortugueseAccents && !hasSpanishAccents) return 'pt';
  if (hasSpanishAccents && !hasPortugueseAccents) return 'es';

  const lowered = sample.toLowerCase();
  const languageKeywords = {
    es: ['derecho', 'tutela', 'magistrado', 'constitucion', 'constitución', 'articulo', 'artículo', 'gracias', 'hola', 'colombia', 'jurisprudencia'],
    en: ['law', 'case', 'please', 'thanks', 'thank you', 'analysis', 'draft', 'hello', 'court', 'evidence', 'summary', 'should', 'could'],
    pt: ['você', 'vocês', 'obrigado', 'obrigada', 'jurisprudência', 'jurisprudencia', 'artigo', 'processo', 'ação', 'acao', 'juiz', 'sentença', 'sentenca', 'brasil'],
  };

  const scores = { es: 0, en: 0, pt: 0 };
  Object.entries(languageKeywords).forEach(([lang, keywords]) => {
    keywords.forEach((kw) => {
      if (lowered.includes(kw)) {
        scores[lang] += 1;
      }
    });
  });

  const best = Object.entries(scores).reduce(
    (acc, [lang, value]) => (value > acc.score ? { lang, score: value } : acc),
    { lang: 'es', score: 0 },
  );
  if (best.score > 0) {
    return best.lang;
  }

  if (hasPortugueseAccents) return 'pt';
  if (hasSpanishAccents) return 'es';
  const asciiOnly = /^[\x00-\x7F]+$/.test(sample);
  if (asciiOnly) {
    return 'en';
  }
  return 'es';
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

const translateIfNeeded = (text, targetLang) => {
  if (!text) return text;
  if (targetLang === 'es') return text;
  return text;
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

const persistMessages = async ({ threadId, text, responseText, email, userId, scenario, attachments = [], userLang = 'es' }) => {
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
      attachments: attachments.length > 0 ? attachments.map((att) => ({ name: att.name, ext: att.ext })) : [],
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

  // Track AI chat token usage
  if (userId && text && responseText) {
    const inputTokens = estimateTokens(text, userLang);
    const outputTokens = estimateTokens(responseText, userLang);
    const totalTokens = inputTokens + outputTokens;

    trackResourceUsage(userId, 'aiChatTokens', totalTokens, {
      inputTokens,
      outputTokens,
      model: 'deepseek-chat',
    }).catch((err) => {
      console.error('[persistMessages] Error tracking AI token usage:', err);
      // Don't fail if tracking fails
    });
  }
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
      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        continue;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        onChunk(delta);
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }
  }
};

export const sendMessage = async (req, res) => {
  const payload = req.query.threadId ? req.query : req.body;
  const { threadId, text, scenario, extractedTextIds } = payload;
  if (!threadId || !text || !scenario) {
    res.write(`data: ${JSON.stringify({ error: 'Faltan parámetros (threadId, text, scenario)' })}\n\n`);
    return res.end();
  }
  const { email, userId } = req.user || {};
  if (!email || !userId) {
    res.write(`data: ${JSON.stringify({ error: 'Usuario no autenticado o token inválido' })}\n\n`);
    return res.end();
  }

  // Normalize scenario key consistently (same as createThread)
  const threadScenarioKey = normalizeScenarioKey(scenario);
  const reqOwnerKey = ownerKeyFromUser(req.user);
  try {
    await ensureThreadOwner(threadId, reqOwnerKey);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'Este hilo pertenece a otro usuario.', code: err.code })}\n\n`);
    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
    return res.end();
  }

  // Load extracted texts if provided
  let extractedTextsContext = '';
  if (extractedTextIds && Array.isArray(extractedTextIds) && extractedTextIds.length > 0) {
    try {
      const extractedTexts = await getExtractedTextsByIds(extractedTextIds, userId);
      if (extractedTexts && extractedTexts.length > 0) {
        const contextParts = extractedTexts.map((et, index) => {
          const sourceLabel = et.source === 'voice'
            ? `🎙️ Transcripción de voz: ${et.sourceName || `Grabación ${index + 1}`}`
            : `📄 Archivo: ${et.sourceName || et.metadata?.fileName || `Archivo ${index + 1}`}`;
          return `\n${sourceLabel}\n${'='.repeat(60)}\n${et.extractedText}\n`;
        });
        extractedTextsContext = `\n\n📋 CONTEXTO DE TEXTOS EXTRAÍDOS:\n${contextParts.join('\n---\n')}\n\n`;
        console.log(`[sendMessage] Loaded ${extractedTexts.length} extracted texts for context`);
      }
    } catch (err) {
      console.error('[sendMessage] Error loading extracted texts:', err);
      // Continue without extracted texts if loading fails
    }
  }

  // Load memory with multiple fallback strategies for legal-writing scenario
  let threadMetaDoc = null;
  let userMemoryDoc = null;
  let memoryBlock = '';
  try {
    // First try exact match with normalized key
    threadMetaDoc = await ThreadMeta.findOne({ threadId, scenario: threadScenarioKey, user_email: email }).lean();

    // If not found, try with original scenario value (for backward compatibility)
    if (!threadMetaDoc) {
      threadMetaDoc = await ThreadMeta.findOne({ threadId, scenario: String(scenario).toLowerCase().trim(), user_email: email }).lean();
    }

    // If still not found, try without user_email filter (for migration cases)
    if (!threadMetaDoc) {
      threadMetaDoc = await ThreadMeta.findOne({ threadId, scenario: threadScenarioKey }).lean();
    }

    // Load user memory
    userMemoryDoc = await UserMemory.findOne({ user_email: email }).select({ recentThreads: 1, facts: 1 }).lean();

    // Build memory block
    memoryBlock = buildMemoryBlock(threadMetaDoc, userMemoryDoc, threadId, threadScenarioKey);

    // Log memory loading for debugging (especially for legal-writing)
    if (threadScenarioKey.includes('legal') || threadScenarioKey.includes('writing')) {
      console.log(`[sendMessage] Legal-writing memory loaded:`, {
        threadId,
        scenario: threadScenarioKey,
        hasThreadMeta: !!threadMetaDoc,
        hasUserMemory: !!userMemoryDoc,
        memoryBlockLength: memoryBlock.length,
      });
    }
  } catch (err) {
    console.warn('sendMessage memory load failed', err?.message);
    // Continue without memory if loading fails
  }

  // Load cached messages from thread cache
  const cachedMessages = threadCache.get(threadId) || [];
  const cachedHistoryBlock = buildCachedHistory(cachedMessages);
  const contextualMemoryBlock = [memoryBlock, cachedHistoryBlock ? `Historial inmediato:\n${cachedHistoryBlock}` : null]
    .filter(Boolean)
    .join('\n\n');

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Combine user message with extracted texts context
  const fullUserMessage = extractedTextsContext
    ? `${extractedTextsContext}Pregunta del usuario: "${text}"`
    : text;

  const isJuris = threadScenarioKey.startsWith('jurisprudence') || threadScenarioKey.startsWith('juris');
  const isTextAnalysis =
    threadScenarioKey.startsWith('text-analysis') ||
    threadScenarioKey.startsWith('analisis') ||
    threadScenarioKey.startsWith('análisis') ||
    threadScenarioKey.startsWith('text');

  const writeAndPersist = async (replyText) => {
    const userMessage = { role: 'user', content: [{ type: 'text', text: { value: text } }] };
    const assistantMessage = { role: 'assistant', content: [{ type: 'text', text: { value: replyText } }] };
    const updatedMessages = [...cachedMessages, userMessage, assistantMessage].slice(-CACHE_HISTORY_LIMIT);
    threadCache.set(threadId, updatedMessages);
    await persistMessages({ threadId, text, responseText: replyText, email, userId, scenario: threadScenarioKey, userLang });
    await buildMemorySnapshot({
      threadId,
      userEmail: email,
      userId,
      scenario: threadScenarioKey,
      userText: text,
      assistantText: replyText,
    });
  };

  const userLang = detectLanguageFromText(text);
  try {
    if (isJuris) {
      res.write(`data: ${JSON.stringify({ content: getLocaleString('jurisSearching', userLang) })}\n\n`);
      let coincidencias = [];
      try {
        coincidencias = await Sentencia.find(
          { $text: { $search: text } },
          {
            score: { $meta: 'textScore' },
            magistrado: 1,
            tema: 1,
            texto: 1,
            fecha_sentencia: 1,
            url: 1,
            providencia: 1,
            expediente: 1,
            derechos: 1,
            hechos_relevantes: 1,
            sujeto: 1,
            conflicto_juridico: 1,
          },
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(50)
          .lean();
      } catch (err) {
        console.warn('Sentencia text search failed, falling back to regex', err?.message);
        const safe = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe, 'i');
        coincidencias = await Sentencia.find({
          $or: [{ providencia: regex }, { expediente: regex }, { tema: regex }, { texto: regex }],
        })
          .limit(20)
          .lean();
      }
      if (!coincidencias || coincidencias.length === 0) {
        const msg = getLocaleString('jurisNoMatches', userLang);
        res.write(`data: ${JSON.stringify({ content: msg })}\n\n`);
        await writeAndPersist(msg);
        res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
        return res.end();
      }
      const contextLines = coincidencias
        .map((d) => {
          const prov = d.providencia ? String(d.providencia).trim() : '';
          const fecha = d.fecha_sentencia ? new Date(d.fecha_sentencia).toISOString().slice(0, 10) : 's/f';
          const tema = d.tema || 'Sin tema';
          const mag = d.magistrado || 'Sin magistrado';
          const url = d.url || '';
          const exp = d.expediente || '';
          const derechos = Array.isArray(d.derechos) ? d.derechos.join(', ') : d.derechos || '';
          const hechos = Array.isArray(d.hechos_relevantes) ? d.hechos_relevantes.join(', ') : d.hechos_relevantes || '';
          const sujeto = d.sujeto || {};
          const sujetoStr = [sujeto.genero, sujeto.edad, sujeto.condicion_especial, sujeto.grupo_etnico, sujeto.condicion_social]
            .filter(Boolean)
            .join(' · ');
          const conflicto = d.conflicto_juridico || {};
          const conflictoStr = [conflicto.frase, conflicto.tipo].filter(Boolean).join(' — ');
          const extracto = d.texto ? String(d.texto).slice(0, 600) + (d.texto.length > 600 ? '…' : '') : '';
          return [
            prov ? `📘 Providencia: ${prov}` : '',
            fecha ? `📅 Fecha: ${fecha}` : '',
            mag ? `👨‍⚖️ Magistrado: ${mag}` : '',
            tema ? `🧭 Tema: ${tema}` : '',
            exp ? `📂 Expediente: ${exp}` : '',
            derechos ? `⚖️ Derechos discutidos: ${derechos}` : '',
            hechos ? `📌 Hechos relevantes: ${hechos}` : '',
            sujetoStr ? `👥 Sujeto(s) implicado(s): ${sujetoStr}` : '',
            conflictoStr ? `⚔️ Conflicto jurídico: ${conflictoStr}` : '',
            url ? `🔗 ${url}` : '',
            extracto ? `📝 Extracto:\n${extracto}` : '',
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n---\n\n');
      const systemPrompt = getScenarioPrompt('jurisprudence', userLang);
      const userPrompt = augmentPromptWithMemory(
        buildJurisUserPrompt(userLang, text, contextLines),
        contextualMemoryBlock,
      );
      const messages = [
        { role: 'system', content: buildSystemPrompt(systemPrompt, userLang) },
        { role: 'user', content: userPrompt },
      ];
      const reader = await streamDeepseek({ messages, temperature: 0.2, maxTokens: 1800, lang: userLang });
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
      await writeAndPersist(processed);
      res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
      return res.end();
    }

    if (isTextAnalysis) {
      // Load documents from Document model (Pepper 2.0) instead of current_state
      const documents = await loadTextAnalysisContext(threadId, userId, email);

      if (!documents.length) {
        const msg = getLocaleString('textNoDocs', userLang);
        res.write(`data: ${JSON.stringify({ content: msg })}\n\n`);
        await writeAndPersist(msg);
        res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
        return res.end();
      }

      // Convert Document model to format expected by tryQuickAnswersTextAnalysis
      const docsForQuickAnswers = documents.map(doc => ({
        ...doc.toObject(),
        ...doc.metadata,
        title: doc.metadata?.title || doc.fileName,
        file_name: doc.fileName,
        filename: doc.fileName,
      }));

      const quick = tryQuickAnswersTextAnalysis(text, docsForQuickAnswers);
      if (quick) {
        res.write(`data: ${JSON.stringify({ content: quick })}\n\n`);
        await writeAndPersist(quick);
        res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
        return res.end();
      }

      // Build context block from documents
      let contextBlock = buildContextBlockFromDocuments(documents);
      // Add extracted texts to context block if provided
      if (extractedTextsContext) {
        contextBlock = extractedTextsContext + '\n\n' + contextBlock;
      }
      const systemPrompt = getScenarioPrompt('text-analysis', userLang);
      const userPrompt = augmentPromptWithMemory(
        buildTextAnalysisUserPrompt(userLang, text, contextBlock, email),
        contextualMemoryBlock,
      );
      const messages = [
        { role: 'system', content: buildSystemPrompt(systemPrompt, userLang) },
        { role: 'user', content: userPrompt },
      ];
      const reader = await streamDeepseek({ messages, temperature: 0.2, maxTokens: 1800, lang: userLang });
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
      await writeAndPersist(processed);
      res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
      return res.end();
    }

    // Check if this is a new dashboard-agent thread (no previous messages in cache or DB)
    const isDashboardAgent = threadScenarioKey === DASHBOARD_AGENT_SCENARIO_KEY;
    const isNewThread = cachedMessages.length === 0;

    // For dashboard-agent, if it's a new thread, send starting message first
    // Then continue to process the user's message
    if (isDashboardAgent && isNewThread) {
      // Send the starting message first
      const startMessage = getDashboardAgentStartMessage();
      res.write(`data: ${JSON.stringify({ content: startMessage })}\n\n`);
      // Persist the starting message
      await persistMessages({
        threadId,
        text: '', // Empty user message for the greeting
        responseText: startMessage,
        email,
        userId,
        scenario: threadScenarioKey
      });
      // Update cache with the greeting
      const greetingMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: { value: startMessage } }]
      };
      threadCache.set(threadId, [greetingMessage]);
      // Continue to process user's message normally below
    }

    const basePrompt = augmentPromptWithMemory(
      buildDefaultUserPrompt(userLang, fullUserMessage),
      contextualMemoryBlock,
    );
    const systemPrompt = getScenarioPrompt(threadScenarioKey, userLang);
    const messages = [
      { role: 'system', content: buildSystemPrompt(systemPrompt, userLang || 'es') },
      { role: 'user', content: basePrompt },
    ];
    const reader = await streamDeepseek({ messages, temperature: 0.7, maxTokens: 2000, lang: userLang || 'es' });
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
    await writeAndPersist(processed);
    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
    return res.end();
  } catch (error) {
    console.error('sendMessage error', error);
    const fallback = getLocaleString('genericError', userLang);
    res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
    res.write(`data: ${JSON.stringify({ completed: true })}\n\n`);
    try {
      await writeAndPersist(fallback);
    } catch (persistErr) {
      console.error('sendMessage persist fallback failed', persistErr);
    }
    return res.end();
  }
};

// Helper to generate non-streaming response (for voice transcription)
export { buildMasterDocument };

export const generateResponseNonStreaming = async ({ threadId, text, scenario, userEmail, userId, userLang, extractedTextIds }) => {
  const threadScenarioKey = String(scenario).toLowerCase().trim();

  // Load extracted texts if provided
  let extractedTextsContext = '';
  if (extractedTextIds && Array.isArray(extractedTextIds) && extractedTextIds.length > 0) {
    try {
      const extractedTexts = await getExtractedTextsByIds(extractedTextIds, userId);
      if (extractedTexts && extractedTexts.length > 0) {
        const contextParts = extractedTexts.map((et, index) => {
          const sourceLabel = et.source === 'voice'
            ? `🎙️ Transcripción de voz: ${et.sourceName || `Grabación ${index + 1}`}`
            : `📄 Archivo: ${et.sourceName || et.metadata?.fileName || `Archivo ${index + 1}`}`;
          return `\n${sourceLabel}\n${'='.repeat(60)}\n${et.extractedText}\n`;
        });
        extractedTextsContext = `\n\n📋 CONTEXTO DE TEXTOS EXTRAÍDOS:\n${contextParts.join('\n---\n')}\n\n`;
        console.log(`[generateResponseNonStreaming] Loaded ${extractedTexts.length} extracted texts for context`);
      }
    } catch (err) {
      console.error('[generateResponseNonStreaming] Error loading extracted texts:', err);
      // Continue without extracted texts if loading fails
    }
  }

  let threadMetaDoc = null;
  let userMemoryDoc = null;
  let memoryBlock = '';
  try {
    threadMetaDoc = await ThreadMeta.findOne({ threadId, scenario: threadScenarioKey, user_email: userEmail }).lean();
    userMemoryDoc = await UserMemory.findOne({ user_email: userEmail }).select({ recentThreads: 1, facts: 1 }).lean();
    memoryBlock = buildMemoryBlock(threadMetaDoc, userMemoryDoc, threadId, threadScenarioKey);
  } catch (err) {
    console.warn('generateResponseNonStreaming memory load failed', err?.message);
  }
  const cachedMessages = threadCache.get(threadId) || [];
  const cachedHistoryBlock = cachedMessages.length > 0 ? cachedMessages.map(m => `${m.role === 'user' ? 'Usuario' : 'Pepper'}: ${m.content?.[0]?.text?.value || m.content || ''}`).join('\n') : '';
  const contextualMemoryBlock = [memoryBlock, cachedHistoryBlock ? `Historial inmediato:\n${cachedHistoryBlock}` : null]
    .filter(Boolean)
    .join('\n\n');

  // Combine user message with extracted texts context
  const fullUserMessage = extractedTextsContext
    ? `${extractedTextsContext}Pregunta del usuario: "${text}"`
    : text;

  const isJuris = threadScenarioKey.startsWith('jurisprudence') || threadScenarioKey.startsWith('juris');
  const isTextAnalysis =
    threadScenarioKey.startsWith('text-analysis') ||
    threadScenarioKey.startsWith('analisis') ||
    threadScenarioKey.startsWith('análisis') ||
    threadScenarioKey.startsWith('text');

  if (isJuris) {
    let coincidencias = [];
    try {
      coincidencias = await Sentencia.find(
        { $text: { $search: text } },
        {
          score: { $meta: 'textScore' },
          magistrado: 1,
          tema: 1,
          texto: 1,
          fecha_sentencia: 1,
          url: 1,
          providencia: 1,
          expediente: 1,
          derechos: 1,
          hechos_relevantes: 1,
          sujeto: 1,
          conflicto_juridico: 1,
        },
      )
        .sort({ score: { $meta: 'textScore' } })
        .limit(50)
        .lean();
    } catch (err) {
      console.warn('Sentencia text search failed, falling back to regex', err?.message);
      const safe = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');
      coincidencias = await Sentencia.find({
        $or: [{ providencia: regex }, { expediente: regex }, { tema: regex }, { texto: regex }],
      })
        .limit(20)
        .lean();
    }
    if (!coincidencias || coincidencias.length === 0) {
      const msg = getLocaleString('jurisNoMatches', userLang);
      // Update thread cache for context
      const userMessage = { role: 'user', content: [{ type: 'text', text: { value: text } }] };
      const assistantMessage = { role: 'assistant', content: [{ type: 'text', text: { value: msg } }] };
      const updatedMessages = [...cachedMessages, userMessage, assistantMessage].slice(-CACHE_HISTORY_LIMIT);
      threadCache.set(threadId, updatedMessages);
      await persistMessages({ threadId, text, responseText: msg, email: userEmail, userId, scenario: threadScenarioKey });
      await buildMemorySnapshot({
        threadId,
        userEmail,
        userId,
        scenario: threadScenarioKey,
        userText: text,
        assistantText: msg,
      });
      return msg;
    }
    const contextLines = coincidencias
      .map((d) => {
        const prov = d.providencia ? String(d.providencia).trim() : '';
        const fecha = d.fecha_sentencia ? new Date(d.fecha_sentencia).toISOString().slice(0, 10) : 's/f';
        const tema = d.tema || 'Sin tema';
        const mag = d.magistrado || 'Sin magistrado';
        const url = d.url || '';
        const exp = d.expediente || '';
        const derechos = Array.isArray(d.derechos) ? d.derechos.join(', ') : d.derechos || '';
        const hechos = Array.isArray(d.hechos_relevantes) ? d.hechos_relevantes.join(', ') : d.hechos_relevantes || '';
        const sujeto = d.sujeto || {};
        const sujetoStr = [sujeto.genero, sujeto.edad, sujeto.condicion_especial, sujeto.grupo_etnico, sujeto.condicion_social]
          .filter(Boolean)
          .join(' · ');
        const conflicto = d.conflicto_juridico || {};
        const conflictoStr = [conflicto.frase, conflicto.tipo].filter(Boolean).join(' — ');
        const extracto = d.texto ? String(d.texto).slice(0, 600) + (d.texto.length > 600 ? '…' : '') : '';
        return [
          prov ? `📘 Providencia: ${prov}` : '',
          fecha ? `📅 Fecha: ${fecha}` : '',
          mag ? `👨‍⚖️ Magistrado: ${mag}` : '',
          tema ? `🧭 Tema: ${tema}` : '',
          exp ? `📂 Expediente: ${exp}` : '',
          derechos ? `⚖️ Derechos discutidos: ${derechos}` : '',
          hechos ? `📌 Hechos relevantes: ${hechos}` : '',
          sujetoStr ? `👥 Sujeto(s) implicado(s): ${sujetoStr}` : '',
          conflictoStr ? `⚔️ Conflicto jurídico: ${conflictoStr}` : '',
          url ? `🔗 ${url}` : '',
          extracto ? `📝 Extracto:\n${extracto}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n---\n\n');
    const systemPrompt = getScenarioPrompt('jurisprudence', userLang);
    const userPrompt = augmentPromptWithMemory(
      buildJurisUserPrompt(userLang, text, contextLines),
      contextualMemoryBlock,
    );
    const messages = [
      { role: 'system', content: buildSystemPrompt(systemPrompt, userLang) },
      { role: 'user', content: userPrompt },
    ];
    const reader = await streamDeepseek({ messages, temperature: 0.2, maxTokens: 1800, lang: userLang });
    let fullResponse = '';
    // Collect all chunks (non-streaming)
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
              fullResponse += parsed.choices[0].delta.content;
            }
          } catch { }
        }
      }
    }
    const processed = convertPlainTextTablesToMarkdown(fullResponse);
    // Update thread cache for context
    const userMessage = { role: 'user', content: [{ type: 'text', text: { value: text } }] };
    const assistantMessage = { role: 'assistant', content: [{ type: 'text', text: { value: processed } }] };
    const updatedMessages = [...cachedMessages, userMessage, assistantMessage].slice(-CACHE_HISTORY_LIMIT);
    threadCache.set(threadId, updatedMessages);
    await persistMessages({ threadId, text, responseText: processed, email: userEmail, userId, scenario: threadScenarioKey, userLang });
    await buildMemorySnapshot({
      threadId,
      userEmail,
      userId,
      scenario: threadScenarioKey,
      userText: text,
      assistantText: processed,
    });
    return processed;
  }

  if (isTextAnalysis) {
    // Load documents from Document model (Pepper 2.0) instead of current_state
    const documents = await loadTextAnalysisContext(threadId, userId, userEmail);

    if (!documents.length) {
      const msg = getLocaleString('textNoDocs', userLang);
      // Update thread cache for context
      const userMessage = { role: 'user', content: [{ type: 'text', text: { value: text } }] };
      const assistantMessage = { role: 'assistant', content: [{ type: 'text', text: { value: msg } }] };
      const updatedMessages = [...cachedMessages, userMessage, assistantMessage].slice(-CACHE_HISTORY_LIMIT);
      threadCache.set(threadId, updatedMessages);
      await persistMessages({ threadId, text, responseText: msg, email: userEmail, userId, scenario: threadScenarioKey });
      await buildMemorySnapshot({
        threadId,
        userEmail,
        userId,
        scenario: threadScenarioKey,
        userText: text,
        assistantText: msg,
      });
      return msg;
    }

    // Convert Document model to format expected by tryQuickAnswersTextAnalysis
    const docsForQuickAnswers = documents.map(doc => ({
      ...doc.toObject(),
      ...doc.metadata,
      title: doc.metadata?.title || doc.fileName,
      file_name: doc.fileName,
      filename: doc.fileName,
    }));

    const quick = tryQuickAnswersTextAnalysis(text, docsForQuickAnswers);
    if (quick) {
      // Update thread cache for context
      const userMessage = { role: 'user', content: [{ type: 'text', text: { value: text } }] };
      const assistantMessage = { role: 'assistant', content: [{ type: 'text', text: { value: quick } }] };
      const updatedMessages = [...cachedMessages, userMessage, assistantMessage].slice(-CACHE_HISTORY_LIMIT);
      threadCache.set(threadId, updatedMessages);
      await persistMessages({ threadId, text, responseText: quick, email: userEmail, userId, scenario: threadScenarioKey });
      await buildMemorySnapshot({
        threadId,
        userEmail,
        userId,
        scenario: threadScenarioKey,
        userText: text,
        assistantText: quick,
      });
      return quick;
    }

    // Build context block from documents
    let contextBlock = buildContextBlockFromDocuments(documents);
    // Add extracted texts to context block if provided
    if (extractedTextsContext) {
      contextBlock = extractedTextsContext + '\n\n' + contextBlock;
    }
    const systemPrompt = getScenarioPrompt('text-analysis', userLang);
    const userPrompt = augmentPromptWithMemory(
      buildTextAnalysisUserPrompt(userLang, text, contextBlock, userEmail),
      contextualMemoryBlock,
    );
    const messages = [
      { role: 'system', content: buildSystemPrompt(systemPrompt, userLang) },
      { role: 'user', content: userPrompt },
    ];
    const reader = await streamDeepseek({ messages, temperature: 0.2, maxTokens: 1800, lang: userLang });
    let fullResponse = '';
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
              fullResponse += parsed.choices[0].delta.content;
            }
          } catch { }
        }
      }
    }
    const processed = convertPlainTextTablesToMarkdown(fullResponse);
    // Update thread cache for context
    const userMessage = { role: 'user', content: [{ type: 'text', text: { value: text } }] };
    const assistantMessage = { role: 'assistant', content: [{ type: 'text', text: { value: processed } }] };
    const updatedMessages = [...cachedMessages, userMessage, assistantMessage].slice(-CACHE_HISTORY_LIMIT);
    threadCache.set(threadId, updatedMessages);
    await persistMessages({ threadId, text, responseText: processed, email: userEmail, userId, scenario: threadScenarioKey, userLang });
    await buildMemorySnapshot({
      threadId,
      userEmail,
      userId,
      scenario: threadScenarioKey,
      userText: text,
      assistantText: processed,
    });
    return processed;
  }

  const basePrompt = augmentPromptWithMemory(
    buildDefaultUserPrompt(userLang, fullUserMessage),
    contextualMemoryBlock,
  );
  const systemPrompt = getScenarioPrompt(threadScenarioKey, userLang);
  const messages = [
    { role: 'system', content: buildSystemPrompt(systemPrompt, userLang || 'es') },
    { role: 'user', content: basePrompt },
  ];
  const reader = await streamDeepseek({ messages, temperature: 0.7, maxTokens: 2000, lang: userLang || 'es' });
  let fullResponse = '';
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            fullResponse += parsed.choices[0].delta.content;
          }
        } catch { }
      }
    }
  }
  const processed = convertPlainTextTablesToMarkdown(fullResponse);
  // Update thread cache for context
  const userMessage = { role: 'user', content: [{ type: 'text', text: { value: text } }] };
  const assistantMessage = { role: 'assistant', content: [{ type: 'text', text: { value: processed } }] };
  const updatedMessages = [...cachedMessages, userMessage, assistantMessage].slice(-CACHE_HISTORY_LIMIT);
  threadCache.set(threadId, updatedMessages);
  await persistMessages({ threadId, text, responseText: processed, email: userEmail, userId, scenario: threadScenarioKey });
  await buildMemorySnapshot({
    threadId,
    userEmail,
    userId,
    scenario: threadScenarioKey,
    userText: text,
    assistantText: processed,
  });
  return processed;
};

