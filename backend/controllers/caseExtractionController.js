import mongoose from 'mongoose';
import { fetch } from 'undici';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import { extractFile } from './fileController.js';
import { detectLanguageFromText, getLanguageKey } from './chatController.js';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';

/**
 * Ensure DeepSeek API key is configured
 */
const ensureDeepseekKey = () => {
    if (!DEEPSEEK_API_KEY || !DEEPSEEK_API_KEY.trim()) {
        throw new Error('DEEPSEEK_API_KEY no configurada');
    }
};

/**
 * Get case extraction prompt based on language
 */
const getCaseExtractionPrompt = (lang) => {
    const languageKey = getLanguageKey(lang);
    const prompts = {
        es: `Eres un asistente especializado en extracción estructurada de datos de casos legales.

Tu misión es extraer información factual y estructurada de documentos legales, SIN realizar análisis jurídico profundo ni interpretaciones legales.

INSTRUCCIONES:
1. Extrae SOLO información explícita que aparezca en el documento
2. NO inventes, asumas o infieras información que no esté presente
3. NO calcules fechas límite ni plazos legales
4. NO interpretes el significado legal de los hechos
5. Si una información no está presente, deja el campo vacío o usa null

FORMATO DE RESPUESTA:
Debes responder ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes o después.

El JSON debe tener esta estructura exacta:
{
  "case_id": "string o null",
  "parties": {
    "plaintiff": "string o null",
    "defendant": "string o null",
    "other": ["string"] o []
  },
  "case_type": "string o null",
  "status": "new" | "review" | "in_progress" | "appeals" | "pending_decision" | "closed" o null,
  "deadlines": [
    {
      "title": "string",
      "due_date": "ISO date string (YYYY-MM-DDTHH:mm:ssZ)",
      "case_id": "string",
      "owner": "string o null",
      "completed": false
    }
  ] o [],
  "last_documents": [
    {
      "name": "string",
      "uploaded_at": "ISO date string",
      "type": "string"
    }
  ] o [],
  "next_actions": [
    {
      "title": "string",
      "description": "string o null",
      "priority": "urgent" | "pending" | "normal"
    }
  ] o [],
  "summary": "string o null"
}

REGLAS IMPORTANTES:
- case_id: Busca números de caso, expedientes, referencias. Si no hay, usa null.
- parties: Extrae nombres de demandantes y demandados explícitamente mencionados.
- case_type: Identifica el tipo de caso (ej: "Criminal Defense", "Family Law", "Corporate", etc.) solo si está explícitamente mencionado.
- status: Usa SOLO si el documento menciona explícitamente el estado. Si no, usa null.
- deadlines: SOLO incluye fechas que estén EXPLÍCITAMENTE mencionadas en el documento. NO calcules plazos legales.
- next_actions: Extrae acciones mencionadas explícitamente. NO sugieras acciones.
- summary: Resumen factual de 2-3 oraciones basado en el contenido del documento.

IMPORTANTE: Responde SOLO con el JSON, sin explicaciones adicionales.`,

        en: `You are an assistant specialized in structured extraction of legal case data.

Your mission is to extract factual and structured information from legal documents, WITHOUT performing deep legal analysis or legal interpretations.

INSTRUCTIONS:
1. Extract ONLY explicit information that appears in the document
2. DO NOT invent, assume, or infer information that is not present
3. DO NOT calculate deadlines or legal timeframes
4. DO NOT interpret the legal meaning of facts
5. If information is not present, leave the field empty or use null

RESPONSE FORMAT:
You must respond ONLY with a valid JSON object, without additional text before or after.

The JSON must have this exact structure:
{
  "case_id": "string or null",
  "parties": {
    "plaintiff": "string or null",
    "defendant": "string or null",
    "other": ["string"] or []
  },
  "case_type": "string or null",
  "status": "new" | "review" | "in_progress" | "appeals" | "pending_decision" | "closed" or null,
  "deadlines": [
    {
      "title": "string",
      "due_date": "ISO date string (YYYY-MM-DDTHH:mm:ssZ)",
      "case_id": "string",
      "owner": "string or null",
      "completed": false
    }
  ] or [],
  "last_documents": [
    {
      "name": "string",
      "uploaded_at": "ISO date string",
      "type": "string"
    }
  ] or [],
  "next_actions": [
    {
      "title": "string",
      "description": "string or null",
      "priority": "urgent" | "pending" | "normal"
    }
  ] or [],
  "summary": "string or null"
}

IMPORTANT RULES:
- case_id: Look for case numbers, file numbers, references. If none, use null.
- parties: Extract names of plaintiffs and defendants explicitly mentioned.
- case_type: Identify case type (e.g., "Criminal Defense", "Family Law", "Corporate", etc.) only if explicitly mentioned.
- status: Use ONLY if the document explicitly mentions the status. If not, use null.
- deadlines: ONLY include dates that are EXPLICITLY mentioned in the document. DO NOT calculate legal deadlines.
- next_actions: Extract actions explicitly mentioned. DO NOT suggest actions.
- summary: Factual summary of 2-3 sentences based on document content.

IMPORTANT: Respond ONLY with the JSON, without additional explanations.`,

        pt: `Você é um assistente especializado em extração estruturada de dados de casos legais.

Sua missão é extrair informações factuais e estruturadas de documentos legais, SEM realizar análise jurídica profunda nem interpretações legais.

INSTRUÇÕES:
1. Extraia APENAS informações explícitas que apareçam no documento
2. NÃO invente, assuma ou infira informações que não estejam presentes
3. NÃO calcule prazos nem deadlines legais
4. NÃO interprete o significado legal dos fatos
5. Se uma informação não estiver presente, deixe o campo vazio ou use null

FORMATO DE RESPOSTA:
Você deve responder APENAS com um objeto JSON válido, sem texto adicional antes ou depois.

O JSON deve ter esta estrutura exata:
{
  "case_id": "string ou null",
  "parties": {
    "plaintiff": "string ou null",
    "defendant": "string ou null",
    "other": ["string"] ou []
  },
  "case_type": "string ou null",
  "status": "new" | "review" | "in_progress" | "appeals" | "pending_decision" | "closed" ou null,
  "deadlines": [
    {
      "title": "string",
      "due_date": "ISO date string (YYYY-MM-DDTHH:mm:ssZ)",
      "case_id": "string",
      "owner": "string ou null",
      "completed": false
    }
  ] ou [],
  "last_documents": [
    {
      "name": "string",
      "uploaded_at": "ISO date string",
      "type": "string"
    }
  ] ou [],
  "next_actions": [
    {
      "title": "string",
      "description": "string ou null",
      "priority": "urgent" | "pending" | "normal"
    }
  ] ou [],
  "summary": "string ou null"
}

REGRAS IMPORTANTES:
- case_id: Procure números de caso, processos, referências. Se não houver, use null.
- parties: Extraia nomes de requerentes e requeridos explicitamente mencionados.
- case_type: Identifique o tipo de caso (ex: "Criminal Defense", "Family Law", "Corporate", etc.) apenas se estiver explicitamente mencionado.
- status: Use APENAS se o documento mencionar explicitamente o status. Se não, use null.
- deadlines: APENAS inclua datas que estejam EXPLICITAMENTE mencionadas no documento. NÃO calcule prazos legais.
- next_actions: Extraia ações explicitamente mencionadas. NÃO sugira ações.
- summary: Resumo factual de 2-3 frases baseado no conteúdo do documento.

IMPORTANTE: Responda APENAS com o JSON, sem explicações adicionais.`,
    };

    return prompts[languageKey] || prompts.es;
};

/**
 * Call DeepSeek API for case extraction
 */
const extractCaseDataWithAI = async (documentText, lang) => {
    ensureDeepseekKey();

    const systemPrompt = getCaseExtractionPrompt(lang);
    const userPrompt = `Extrae la información estructurada del siguiente documento legal:\n\n${documentText}`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
    ];

    const response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DEEPSEEK_API_KEY.trim()}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages,
            temperature: 0.1, // Low temperature for structured extraction
            max_tokens: 2000,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error('No response content from DeepSeek API');
    }

    // Extract JSON from response (may have markdown code blocks)
    let jsonStr = content.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
        const extractedData = JSON.parse(jsonStr);
        return extractedData;
    } catch (parseError) {
        console.error('[caseExtraction] JSON parse error:', parseError);
        console.error('[caseExtraction] Raw content:', content);
        throw new Error('Failed to parse AI response as JSON');
    }
};

/**
 * Validate and normalize extracted case data
 */
const validateAndNormalizeCaseData = (extractedData, userId, email) => {
    // Ensure required structure
    const normalized = {
        case_id: extractedData.case_id || null,
        parties: {
            plaintiff: extractedData.parties?.plaintiff || null,
            defendant: extractedData.parties?.defendant || null,
            other: Array.isArray(extractedData.parties?.other) ? extractedData.parties.other : [],
        },
        case_type: extractedData.case_type || null,
        status: extractedData.status || 'new',
        deadlines: Array.isArray(extractedData.deadlines)
            ? extractedData.deadlines.map((d) => ({
                title: d.title || '',
                due_date: d.due_date ? new Date(d.due_date) : null,
                case_id: d.case_id || extractedData.case_id || '',
                owner: d.owner || '',
                completed: d.completed || false,
            }))
            : [],
        last_documents: Array.isArray(extractedData.last_documents)
            ? extractedData.last_documents.map((d) => ({
                name: d.name || '',
                uploaded_at: d.uploaded_at ? new Date(d.uploaded_at) : new Date(),
                type: d.type || 'document',
            }))
            : [],
        next_actions: Array.isArray(extractedData.next_actions)
            ? extractedData.next_actions.map((a) => ({
                title: a.title || '',
                description: a.description || null,
                priority: ['urgent', 'pending', 'normal'].includes(a.priority) ? a.priority : 'pending',
            }))
            : [],
        summary: extractedData.summary || null,
    };

    // Filter out deadlines with invalid dates
    normalized.deadlines = normalized.deadlines.filter((d) => d.due_date && !isNaN(d.due_date.getTime()));

    // Validate status
    const validStatuses = ['new', 'review', 'in_progress', 'appeals', 'pending_decision', 'closed'];
    if (!validStatuses.includes(normalized.status)) {
        normalized.status = 'new';
    }

    return normalized;
};

/**
 * Extract case data from uploaded document
 */
export async function extractFromDocument(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se adjuntaron archivos' });
        }

        // Process first file only for case extraction
        const file = req.files[0];

        // Extract text from file
        let documentText;
        try {
            const extracted = await extractFile(file);
            documentText = extracted.text;
        } catch (extractError) {
            return res.status(400).json({
                error: 'No se pudo extraer texto del archivo',
                message: extractError.message,
            });
        }

        if (!documentText || documentText.trim().length === 0) {
            return res.status(400).json({ error: 'El archivo no contiene texto extraíble' });
        }

        // Detect language
        const detectedLang = detectLanguageFromText(documentText);
        const langKey = getLanguageKey(detectedLang);

        // Extract case data using AI
        let extractedData;
        try {
            extractedData = await extractCaseDataWithAI(documentText, langKey);
        } catch (aiError) {
            console.error('[caseExtraction] AI extraction error:', aiError);
            return res.status(500).json({
                error: 'Error al extraer datos del caso con IA',
                message: aiError.message,
            });
        }

        // Validate and normalize
        const normalizedData = validateAndNormalizeCaseData(extractedData, userId, email);

        // Generate case_id if not present
        if (!normalizedData.case_id) {
            // Generate a temporary case_id based on timestamp
            const timestamp = Date.now();
            normalizedData.case_id = `CASE-${timestamp}`;
        } else {
            // Normalize case_id (uppercase, trim)
            normalizedData.case_id = normalizedData.case_id.trim().toUpperCase();
        }

        // Add file as last_document
        normalizedData.last_documents.push({
            name: file.originalname,
            uploaded_at: new Date(),
            type: file.mimetype || 'document',
        });

        return res.json({
            success: true,
            extractedData: normalizedData,
            fileName: file.originalname,
            wordCount: documentText.split(/\s+/).length,
        });
    } catch (error) {
        console.error('[caseExtraction][extractFromDocument] Error:', error);
        return res.status(500).json({
            error: 'Error al procesar el documento',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Generate MCD from extracted case data
 */
export async function generateMCDFromExtraction(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        const { extractedData, source_document_id } = req.body;

        if (!extractedData || !extractedData.case_id) {
            return res.status(400).json({
                error: 'extractedData con case_id es requerido',
            });
        }

        // Validate and normalize
        const normalizedData = validateAndNormalizeCaseData(extractedData, userId, email);

        // Normalize case_id
        normalizedData.case_id = normalizedData.case_id.trim().toUpperCase();

        // Check if case_id already exists (exclude soft-deleted cases)
        const existing = await MasterCaseDocument.findOne({
            case_id: normalizedData.case_id,
            user_id: userId,
            is_deleted: { $ne: true }, // Exclude soft-deleted cases
        });

        if (existing) {
            return res.status(409).json({
                error: `Ya existe un caso con ID "${normalizedData.case_id}"`,
                existingMCD: existing.toObject(),
            });
        }

        // Create MCD
        const mcd = await MasterCaseDocument.create({
            case_id: normalizedData.case_id,
            parties: normalizedData.parties,
            case_type: normalizedData.case_type || 'Unknown',
            status: normalizedData.status,
            deadlines: normalizedData.deadlines,
            last_documents: normalizedData.last_documents,
            next_actions: normalizedData.next_actions,
            summary: normalizedData.summary || '',
            user_id: new mongoose.Types.ObjectId(userId),
            user_email: email.toLowerCase().trim(),
            source: 'document',
            source_document_id: source_document_id
                ? new mongoose.Types.ObjectId(source_document_id)
                : null,
        });

        return res.status(201).json({
            success: true,
            mcd: mcd.toObject(),
            message: 'Master Case Document creado exitosamente',
        });
    } catch (error) {
        console.error('[caseExtraction][generateMCDFromExtraction] Error:', error);
        return res.status(500).json({
            error: 'Error al generar Master Case Document',
            message: error.message || 'Error desconocido',
        });
    }
}

/**
 * Extract case data and generate MCD in one step
 */
export async function extractAndGenerateMCD(req, res) {
    try {
        const { userId, email } = req.user || {};
        if (!userId || !email) {
            return res.status(401).json({ error: 'Usuario no autenticado' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se adjuntaron archivos' });
        }

        // Process first file
        const file = req.files[0];

        // Extract text
        let documentText;
        try {
            const extracted = await extractFile(file);
            documentText = extracted.text;
        } catch (extractError) {
            return res.status(400).json({
                error: 'No se pudo extraer texto del archivo',
                message: extractError.message,
            });
        }

        if (!documentText || documentText.trim().length === 0) {
            return res.status(400).json({ error: 'El archivo no contiene texto extraíble' });
        }

        // Detect language
        const detectedLang = detectLanguageFromText(documentText);
        const langKey = getLanguageKey(detectedLang);

        // Extract case data using AI
        let extractedData;
        try {
            extractedData = await extractCaseDataWithAI(documentText, langKey);
        } catch (aiError) {
            console.error('[caseExtraction] AI extraction error:', aiError);
            return res.status(500).json({
                error: 'Error al extraer datos del caso con IA',
                message: aiError.message,
            });
        }

        // Validate and normalize
        const normalizedData = validateAndNormalizeCaseData(extractedData, userId, email);

        // Generate case_id if not present
        if (!normalizedData.case_id) {
            const timestamp = Date.now();
            normalizedData.case_id = `CASE-${timestamp}`;
        } else {
            normalizedData.case_id = normalizedData.case_id.trim().toUpperCase();
        }

        // Add file as last_document
        normalizedData.last_documents.push({
            name: file.originalname,
            uploaded_at: new Date(),
            type: file.mimetype || 'document',
        });

        // Check if case_id already exists (exclude soft-deleted cases)
        const existing = await MasterCaseDocument.findOne({
            case_id: normalizedData.case_id,
            user_id: userId,
            is_deleted: { $ne: true }, // Exclude soft-deleted cases
        });

        if (existing) {
            return res.status(409).json({
                error: `Ya existe un caso con ID "${normalizedData.case_id}"`,
                existingMCD: existing.toObject(),
                extractedData: normalizedData,
            });
        }

        // Create MCD
        const mcd = await MasterCaseDocument.create({
            case_id: normalizedData.case_id,
            parties: normalizedData.parties,
            case_type: normalizedData.case_type || 'Unknown',
            status: normalizedData.status,
            deadlines: normalizedData.deadlines,
            last_documents: normalizedData.last_documents,
            next_actions: normalizedData.next_actions,
            summary: normalizedData.summary || '',
            user_id: new mongoose.Types.ObjectId(userId),
            user_email: email.toLowerCase().trim(),
            source: 'document',
        });

        // Automatically sync to calendar (async, don't wait)
        const { syncMCDToCalendar } = await import('../services/calendarSyncService.js');
        syncMCDToCalendar(userId, mcd.toObject()).catch((error) => {
            console.error('[CaseExtraction] Error syncing to calendar:', error);
            // Don't fail the request if calendar sync fails
        });

        return res.status(201).json({
            success: true,
            mcd: mcd.toObject(),
            extractedData: normalizedData,
            fileName: file.originalname,
            message: 'Master Case Document creado exitosamente desde documento',
        });
    } catch (error) {
        console.error('[caseExtraction][extractAndGenerateMCD] Error:', error);
        return res.status(500).json({
            error: 'Error al procesar documento y generar MCD',
            message: error.message || 'Error desconocido',
        });
    }
}

