import multer from 'multer';
import OpenAI from 'openai';
import crypto from 'crypto';
import { detectLanguageFromText, getLanguageKey, generateResponseNonStreaming } from './chatController.js';
import ExtractedText from '../models/ExtractedText.js';
import mongoose from 'mongoose';
import { trackResourceUsage } from '../services/resourceTrackingService.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Language mapping for OpenAI (ISO 639-1 codes)
const languageMap = {
  es: 'es',
  en: 'en',
  pt: 'pt',
};

// Language profiles for response compatibility
const languageProfiles = {
  es: { locale: 'es-ES' },
  en: { locale: 'en-US' },
  pt: { locale: 'pt-BR' },
};

export const speechUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max (OpenAI limit)
  },
});

export const transcribeAudio = async (req, res) => {
  try {
    const audioFile = req.file;
    if (!audioFile) {
      return res.status(400).json({ error: 'Audio file is required.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const { language = 'auto', threadId, scenario, sourceName, duration } = req.body || {};

    // Convert language hint if provided
    // Prioritize explicit language hints over auto-detect for better accuracy
    let languageCode = null;
    if (language !== 'auto' && language) {
      const langKey = getLanguageKey(language);
      languageCode = languageMap[langKey] || null;

      // Log language hint for debugging
      console.log(`[transcribeAudio] Language hint received: ${language} -> ${languageCode || 'auto-detect'}`);
    } else {
      console.log(`[transcribeAudio] Using auto-detect (no language hint provided)`);
    }

    // If Spanish is explicitly requested, always use it (don't fall back to auto)
    if (language === 'es' || language === 'es-ES' || language === 'es-MX' || language === 'es-CO') {
      languageCode = 'es';
      console.log(`[transcribeAudio] Forcing Spanish language for transcription`);
    }

    // Create a File object for OpenAI API
    // OpenAI SDK accepts File, Blob, or Buffer
    // Node.js 18+ has File constructor globally (project uses Node 20+)
    const file = new File(
      [audioFile.buffer],
      audioFile.originalname || 'recording.webm',
      { type: audioFile.mimetype || 'audio/webm' }
    );

    // Call OpenAI Whisper API
    // Use explicit language code if provided, otherwise let Whisper auto-detect
    const whisperOptions = {
      file: file,
      model: 'whisper-1',
      response_format: 'json',
      temperature: 0, // Lower temperature for more consistent results
    };

    // Only set language if we have an explicit code (don't send undefined)
    if (languageCode) {
      whisperOptions.language = languageCode;
      console.log(`[transcribeAudio] Sending to Whisper with explicit language: ${languageCode}`);
    } else {
      console.log(`[transcribeAudio] Sending to Whisper with auto-detect`);
    }

    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create(whisperOptions);
    } catch (whisperError) {
      console.error('[transcribeAudio] Whisper API error:', whisperError);
      throw whisperError;
    }

    const transcript = transcription.text || '';

    // Detect language from transcript (used for both storage and response)
    const detectedLangKey = transcript
      ? getLanguageKey(detectLanguageFromText(transcript))
      : 'es';

    // Store transcription in ExtractedText model (so it appears in extracted texts list)
    let textId = null;
    if (transcript.trim() && req.user?.userId && req.user?.email) {
      try {
        textId = `text-${crypto.randomUUID()}`;
        const extractedText = new ExtractedText({
          textId,
          userId: new mongoose.Types.ObjectId(req.user.userId),
          userEmail: req.user.email.toLowerCase(),
          source: 'voice',
          sourceName: sourceName || `Voice Recording - ${new Date().toLocaleString()}`,
          extractedText: transcript.trim(),
          metadata: {
            duration: duration ? parseFloat(duration) : null,
            wordCount: 0, // Will be calculated in pre-save hook
            language: detectedLangKey,
            meetingTitle: null,
          },
          status: 'ready',
        });

        await extractedText.save();
        console.log(`[transcribeAudio] Transcription stored with textId: ${textId}`);
      } catch (storeError) {
        console.error('[transcribeAudio] Error storing transcription:', storeError);
        // Continue even if storage fails - don't break the transcription flow
      }
    }

    // Track voice transcription usage
    if (req.user?.userId && transcript) {
      const audioDuration = duration ? parseFloat(duration) : null;

      trackResourceUsage(req.user.userId, 'voiceTranscriptions', 1, {
        audioDuration,
        language: detectedLangKey,
      }).catch((err) => {
        console.error('[transcribeAudio] Error tracking resource usage:', err);
        // Don't fail the request if tracking fails
      });
    }

    // Map back to locale format for frontend compatibility
    const resolvedLocale = languageProfiles[detectedLangKey]?.locale || 'es-ES';

    // If threadId and scenario provided, also generate response
    let response = null;
    if (threadId && scenario && req.user) {
      const { email, userId } = req.user;
      if (email && userId) {
        try {
          response = await generateResponseNonStreaming({
            threadId,
            text: transcript,
            scenario,
            userEmail: email,
            userId,
            userLang: detectedLangKey,
          });
        } catch (err) {
          console.error('generateResponseNonStreaming error', err);
          // Continue without response if generation fails
        }
      }
    }

    return res.json({
      text: transcript,
      language: resolvedLocale,
      confidence: null, // OpenAI doesn't provide confidence scores
      response: response, // Include generated response if available
      textId: textId, // Include textId so frontend knows it was stored
    });
  } catch (error) {
    console.error('[transcribeAudio] Error:', error);
    console.error('[transcribeAudio] Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      languageHint: req.body?.language,
    });

    // Handle OpenAI-specific errors with better messages
    if (error.status === 401) {
      return res.status(401).json({ error: 'OpenAI API key is invalid.' });
    }
    if (error.status === 429) {
      return res.status(429).json({
        error: 'OpenAI API rate limit exceeded. Please try again later.',
      });
    }
    if (error.status === 413) {
      return res.status(413).json({
        error: 'Audio file is too large. Maximum size is 25MB.',
      });
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Unable to connect to OpenAI API. Please try again later.',
      });
    }

    // Check if it's a timeout error
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return res.status(504).json({
        error: 'Transcription request timed out. The audio may be too long or the service is slow. Please try again.',
      });
    }

    // Provide more helpful error message
    const errorMessage = error.message || 'No se pudo transcribir el audio.';
    return res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        languageHint: req.body?.language,
      } : undefined,
    });
  }
};

/**
 * Transcribe a single audio chunk and return the transcript
 * Used for continuous/streaming transcription
 */
export const transcribeChunk = async (audioBuffer, languageCode = null) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const file = new File([audioBuffer], 'chunk.webm', { type: 'audio/webm' });

    const whisperOptions = {
      file: file,
      model: 'whisper-1',
      response_format: 'json',
      temperature: 0,
    };

    if (languageCode) {
      whisperOptions.language = languageCode;
    }

    const transcription = await openai.audio.transcriptions.create(whisperOptions);
    return transcription.text || '';
  } catch (error) {
    console.error('[transcribeChunk] Error:', error);
    throw error;
  }
};

/**
 * Transcribe audio and store in ExtractedText model
 * Returns textId for the stored transcription
 */
export const transcribeAndStore = async (req, res) => {
  try {
    const audioFile = req.file;
    if (!audioFile) {
      return res.status(400).json({ error: 'Audio file is required.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    const { userId, email } = req.user || {};
    if (!userId || !email) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const {
      language = 'auto',
      sourceName,
      duration,
      meetingTitle,
      storeOnly = false, // If true, don't generate chat response
      threadId,
      scenario,
    } = req.body || {};

    // Convert language hint if provided
    let languageCode = null;
    if (language !== 'auto' && language) {
      const langKey = getLanguageKey(language);
      languageCode = languageMap[langKey] || null;
      console.log(`[transcribeAndStore] Language hint: ${language} -> ${languageCode || 'auto-detect'}`);
    }

    // If Spanish is explicitly requested, always use it
    if (language === 'es' || language === 'es-ES' || language === 'es-MX' || language === 'es-CO') {
      languageCode = 'es';
      console.log(`[transcribeAndStore] Forcing Spanish language`);
    }

    // Create File object for OpenAI API
    const file = new File(
      [audioFile.buffer],
      audioFile.originalname || 'recording.webm',
      { type: audioFile.mimetype || 'audio/webm' }
    );

    // Call OpenAI Whisper API
    const whisperOptions = {
      file: file,
      model: 'whisper-1',
      response_format: 'json',
      temperature: 0,
    };

    if (languageCode) {
      whisperOptions.language = languageCode;
      console.log(`[transcribeAndStore] Sending to Whisper with language: ${languageCode}`);
    } else {
      console.log(`[transcribeAndStore] Sending to Whisper with auto-detect`);
    }

    let transcription;
    try {
      transcription = await openai.audio.transcriptions.create(whisperOptions);
    } catch (whisperError) {
      console.error('[transcribeAndStore] Whisper API error:', whisperError);
      throw whisperError;
    }

    const transcript = transcription.text || '';

    if (!transcript.trim()) {
      return res.status(400).json({ error: 'No se pudo transcribir el audio. El audio puede estar vacío o no contener habla.' });
    }

    // Detect language from transcript
    const detectedLangKey = transcript
      ? getLanguageKey(detectLanguageFromText(transcript))
      : 'es';

    // Map back to locale format for frontend compatibility
    const resolvedLocale = languageProfiles[detectedLangKey]?.locale || 'es-ES';

    // Generate textId explicitly to avoid validation error (required field)
    const textId = `text-${crypto.randomUUID()}`;

    // Store transcription in ExtractedText model
    const extractedText = new ExtractedText({
      textId,
      userId: new mongoose.Types.ObjectId(userId),
      userEmail: email.toLowerCase(),
      source: 'voice',
      sourceName: sourceName || meetingTitle || `Voice Recording - ${new Date().toLocaleString()}`,
      extractedText: transcript.trim(),
      metadata: {
        duration: duration || null,
        wordCount: 0, // Will be calculated in pre-save hook
        language: detectedLangKey,
        meetingTitle: meetingTitle || null,
      },
      status: 'ready',
    });

    await extractedText.save();

    console.log(`[transcribeAndStore] Transcription stored with textId: ${extractedText.textId}`);

    // Track voice transcription usage
    if (userId && transcript) {
      const audioDuration = duration ? parseFloat(duration) : null;
      trackResourceUsage(userId, 'voiceTranscriptions', 1, {
        audioDuration,
        language: detectedLangKey,
      }).catch((err) => {
        console.error('[transcribeAndStore] Error tracking resource usage:', err);
        // Don't fail the request if tracking fails
      });
    }

    // If threadId and scenario provided, and storeOnly is false, also generate response
    let response = null;
    if (!storeOnly && threadId && scenario) {
      try {
        response = await generateResponseNonStreaming({
          threadId,
          text: transcript,
          scenario,
          userEmail: email,
          userId,
          userLang: detectedLangKey,
        });
      } catch (err) {
        console.error('[transcribeAndStore] generateResponseNonStreaming error', err);
        // Continue without response if generation fails
      }
    }

    return res.json({
      success: true,
      text: transcript,
      language: resolvedLocale,
      confidence: null,
      textId: extractedText.textId, // Return textId for frontend reference
      response: response, // Include generated response if available
      extractedText: {
        textId: extractedText.textId,
        source: extractedText.source,
        sourceName: extractedText.sourceName,
        wordCount: extractedText.metadata.wordCount,
        createdAt: extractedText.createdAt,
      },
    });
  } catch (error) {
    console.error('[transcribeAndStore] Error:', error);
    console.error('[transcribeAndStore] Error details:', {
      message: error.message,
      status: error.status,
      code: error.code,
      languageHint: req.body?.language,
    });

    // Handle OpenAI-specific errors
    if (error.status === 401) {
      return res.status(401).json({ error: 'OpenAI API key is invalid.' });
    }
    if (error.status === 429) {
      return res.status(429).json({
        error: 'OpenAI API rate limit exceeded. Please try again later.',
      });
    }
    if (error.status === 413) {
      return res.status(413).json({
        error: 'Audio file is too large. Maximum size is 25MB.',
      });
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Unable to connect to OpenAI API. Please try again later.',
      });
    }
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return res.status(504).json({
        error: 'Transcription request timed out. The audio may be too long or the service is slow. Please try again.',
      });
    }

    const errorMessage = error.message || 'No se pudo transcribir el audio.';
    return res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        languageHint: req.body?.language,
      } : undefined,
    });
  }
};

/**
 * Update existing transcription with additional chunk
 * Used for continuous/streaming transcription
 */
export const appendTranscriptionChunk = async (req, res) => {
  try {
    const { userId, email } = req.user || {};
    if (!userId || !email) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { textId, chunkText, language } = req.body || {};

    if (!textId) {
      return res.status(400).json({ error: 'textId requerido' });
    }

    if (!chunkText || typeof chunkText !== 'string' || !chunkText.trim()) {
      return res.status(400).json({ error: 'Texto del chunk requerido' });
    }

    // Find existing extracted text
    const extractedText = await ExtractedText.findOne({
      textId,
      userId: new mongoose.Types.ObjectId(userId),
      source: 'voice',
    });

    if (!extractedText) {
      return res.status(404).json({ error: 'Texto extraído no encontrado' });
    }

    // Append chunk text to existing text
    const separator = extractedText.extractedText.trim() ? '\n\n' : '';
    extractedText.extractedText = extractedText.extractedText.trim() + separator + chunkText.trim();

    // Update language if provided and different
    if (language && language !== extractedText.metadata.language) {
      extractedText.metadata.language = language;
    }

    // Update word count (will be recalculated in pre-save hook)
    extractedText.metadata.wordCount = 0;

    await extractedText.save();

    return res.json({
      success: true,
      textId: extractedText.textId,
      extractedText: {
        textId: extractedText.textId,
        source: extractedText.source,
        sourceName: extractedText.sourceName,
        wordCount: extractedText.metadata.wordCount,
        updatedAt: extractedText.updatedAt,
      },
    });
  } catch (error) {
    console.error('[appendTranscriptionChunk] Error:', error);
    return res.status(500).json({
      error: 'Error al actualizar la transcripción',
      message: error?.message || 'Error desconocido',
    });
  }
};

export const synthesizeSpeech = async (req, res) => {
  try {
    const { text, language = 'auto', speakingRate = 1.0, pitch = 0 } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Texto requerido para la síntesis.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }

    // Detect language
    const detectedLangKey =
      language === 'auto' ? getLanguageKey(detectLanguageFromText(text)) : getLanguageKey(language);

    // Map language to OpenAI voice
    // OpenAI has 6 voices: alloy, echo, fable, onyx, nova, shimmer
    // We'll choose based on language preference
    const voiceMap = {
      es: 'nova', // Spanish-friendly voice
      en: 'alloy', // English-friendly voice
      pt: 'nova', // Portuguese-friendly voice
    };
    const selectedVoice = voiceMap[detectedLangKey] || 'alloy';

    // OpenAI TTS API call
    // Note: OpenAI TTS doesn't support pitch control, only speed
    const response = await openai.audio.speech.create({
      model: 'tts-1', // Use 'tts-1-hd' for higher quality (more expensive)
      voice: selectedVoice,
      input: text,
      response_format: 'mp3',
      speed: Math.min(Math.max(speakingRate, 0.25), 4.0), // OpenAI range: 0.25-4.0
    });

    // Convert response to buffer and then base64
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64Audio = buffer.toString('base64');

    const profile = languageProfiles[detectedLangKey] || languageProfiles.es;

    return res.json({
      audioContent: base64Audio,
      contentType: 'audio/mpeg',
      language: profile.locale,
    });
  } catch (error) {
    console.error('synthesizeSpeech error', error);

    // Handle OpenAI-specific errors
    if (error.status === 401) {
      return res.status(401).json({ error: 'OpenAI API key is invalid.' });
    }
    if (error.status === 429) {
      return res.status(429).json({
        error: 'OpenAI API rate limit exceeded. Please try again later.',
      });
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Unable to connect to OpenAI API. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'No se pudo generar el audio.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


