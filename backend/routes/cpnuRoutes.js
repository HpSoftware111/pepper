/**
 * CPNU Routes
 * Handles manual and automatic synchronization with CPNU (Rama Judicial)
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middleware/requireAuth.js';
import { scrapeCPNU } from '../services/cpnuService.js';
import { getCaseFolder } from '../utils/caseFolderUtils.js';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import { trackResourceUsage } from '../services/resourceTrackingService.js';

const router = express.Router();

/**
 * POST /api/cpnu/preview
 * Preview CPNU data for a radicado (used before creating a case)
 * 
 * Body: { radicado: string }
 * 
 * Returns scraped CPNU data without requiring an existing case.
 * Used in the new case modal to auto-populate form fields.
 */
router.post('/preview', requireAuth, async (req, res) => {
  // Set overall timeout (2 minutes) to prevent hanging requests
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('CPNU preview request timed out after 120 seconds. The operation took too long.'));
    }, 120000); // 2 minutes
  });

  try {
    const { userId } = req.user || {};
    if (!userId) {
      clearTimeout(timeoutId);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { radicado } = req.body;

    // Validate radicado
    if (!radicado || !/^\d{23}$/.test(radicado)) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        error: 'Radicado must be exactly 23 digits (numeric only)',
      });
    }

    // Scrape CPNU data (with timeout protection)
    console.log(`[CPNU Preview] Starting preview for radicado ${radicado}...`);
    const cpnuData = await Promise.race([
      scrapeCPNU(radicado, 90000), // 90 seconds timeout
      timeoutPromise,
    ]);

    console.log(`[CPNU Preview] ✅ Successfully scraped data for radicado ${radicado}`);

    // Track CPNU scraping usage
    if (userId) {
      trackResourceUsage(userId, 'cpnuScrapes', 1, {
        radicado,
        success: true,
      }).catch((err) => {
        console.error('[CPNU Preview] Error tracking resource usage:', err);
        // Don't fail if tracking fails
      });
    }

    // Clear timeout on success
    clearTimeout(timeoutId);

    return res.json({
      success: true,
      message: 'CPNU data retrieved successfully',
      data: {
        radicado,
        datosProceso: cpnuData.datosProceso,
        sujetosProcesales: cpnuData.sujetosProcesales,
        actuacionesCount: cpnuData.actuaciones?.length || 0,
        // Include all actuaciones for calendar events (including past dates)
        actuaciones: cpnuData.actuaciones || [],
        // Include latest actuacion for last_action field (backward compatibility)
        latestActuacion: cpnuData.actuaciones && cpnuData.actuaciones.length > 0
          ? cpnuData.actuaciones[0]
          : null,
      },
    });

  } catch (error) {
    // Clear timeout on error
    clearTimeout(timeoutId);

    console.error('[CPNU Preview] Error:', error);

    // Determine error category
    const errorCategory = error.cpnuErrorCategory || 'other';
    let userMessage = '';
    let statusCode = 500;

    switch (errorCategory) {
      case 'timeout':
        userMessage = 'La conexión con la rama judicial tardó demasiado, intenta nuevamente';
        statusCode = 504;
        break;
      case 'connection':
        userMessage = 'No se pudo conectar a la informacion de la rama judicial, intenta nuevamente';
        statusCode = 503;
        break;
      case 'not_found':
        userMessage = 'No se encontró el radicado en la información de la rama judicial';
        statusCode = 404;
        break;
      case 'validation':
        userMessage = error.message || 'El radicado ingresado no es válido';
        statusCode = 400;
        break;
      default:
        userMessage = 'No se pudo conectar a la informacion de la rama judicial, intenta nuevamente';
        statusCode = 500;
        break;
    }

    return res.status(statusCode).json({
      success: false,
      error: userMessage,
      errorCategory: errorCategory,
      isDuplicateRecord: error.isDuplicateRecord || false,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

/**
 * POST /api/cpnu/sync/:caseId
 * Manual one-time sync with CPNU
 * 
 * Body: { radicado: string }
 * 
 * Rules:
 * - Can only be executed once per case
 * - Validates 23-digit numeric radicado
 * - Extracts and stores frozen data (Datos del proceso, Sujetos procesales)
 * - Stores initial Actuaciones
 */
router.post('/sync/:caseId', requireAuth, async (req, res) => {
  // Set overall timeout (2 minutes) to prevent hanging requests
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('CPNU sync request timed out after 120 seconds. The operation took too long.'));
    }, 120000); // 2 minutes
  });

  try {
    const { userId } = req.user || {};
    if (!userId) {
      clearTimeout(timeoutId);
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { caseId } = req.params;
    const { radicado } = req.body;

    // Validate radicado
    if (!radicado || !/^\d{23}$/.test(radicado)) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        error: 'Radicado must be exactly 23 digits (numeric only)',
      });
    }

    const userIdStr = userId.toString();

    // Check if case exists (file-based or MCD)
    let caseData = null;
    let caseSource = null;
    let casePath = null;

    // Try file-based case first
    const caseFolder = getCaseFolder(userIdStr, caseId);
    const filePath = path.join(caseFolder, 'case.json');

    if (fs.existsSync(filePath)) {
      caseData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      caseSource = 'file';
      casePath = filePath;
    } else {
      // Try MCD
      const mcd = await MasterCaseDocument.findOne({
        case_id: caseId,
        user_id: userId,
      });

      if (mcd) {
        caseData = mcd.toObject();
        caseSource = 'mcd';
      }
    }

    if (!caseData) {
      clearTimeout(timeoutId);
      return res.status(404).json({
        success: false,
        error: 'Case not found',
      });
    }

    // Check if case is deleted
    if (caseData.is_deleted === true) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        error: 'Cannot sync deleted case',
      });
    }

    // Check if bootstrap already done
    if (caseData.cpnu_bootstrap_done === true) {
      clearTimeout(timeoutId);
      return res.status(400).json({
        success: false,
        error: 'CPNU sync already executed for this case. Manual sync can only be run once per case.',
      });
    }

    // Scrape CPNU data (with timeout protection)
    console.log(`[CPNU Sync] Starting manual sync for case ${caseId} with radicado ${radicado}...`);
    const cpnuData = await Promise.race([
      scrapeCPNU(radicado, 90000), // 90 seconds timeout
      timeoutPromise,
    ]);

    // Update case data with frozen fields (one-time only)
    // Exclude attorney from caseData spread to avoid overwriting with null
    const { attorney: _, ...caseDataWithoutAttorney } = caseData;
    const updatedData = {
      ...caseDataWithoutAttorney,
      radicado_cpnu: radicado,
      linked_cpnu: true,
      cpnu_bootstrap_done: true,
      cpnu_bootstrap_at: new Date().toISOString(),
      cpnu_bootstrap_by: userIdStr,
    };

    // Update "Datos del proceso" (frozen)
    if (cpnuData.datosProceso.despacho) {
      updatedData.court = cpnuData.datosProceso.despacho;
    }
    if (cpnuData.datosProceso.claseProceso) {
      // Store in placeholder field
      updatedData.cpnu_clase_proceso = cpnuData.datosProceso.claseProceso;
    }

    // Update "Sujetos Procesales" (frozen)
    if (cpnuData.sujetosProcesales.demandante) {
      updatedData.plaintiff = cpnuData.sujetosProcesales.demandante;
    }
    if (cpnuData.sujetosProcesales.demandado) {
      updatedData.defendant = cpnuData.sujetosProcesales.demandado;
    }
    // Priority: defensorPrivado > defensorPublico
    // Always set attorney field (even if null) to ensure it's updated in database
    // Check for non-empty strings to avoid setting empty strings
    if (cpnuData.sujetosProcesales.defensorPrivado &&
      typeof cpnuData.sujetosProcesales.defensorPrivado === 'string' &&
      cpnuData.sujetosProcesales.defensorPrivado.trim().length > 0) {
      updatedData.attorney = cpnuData.sujetosProcesales.defensorPrivado.trim();
      console.log(`[CPNU Sync] ✅ Set attorney from defensorPrivado: "${updatedData.attorney}"`);
    } else if (cpnuData.sujetosProcesales.defensorPublico &&
      typeof cpnuData.sujetosProcesales.defensorPublico === 'string' &&
      cpnuData.sujetosProcesales.defensorPublico.trim().length > 0) {
      updatedData.attorney = cpnuData.sujetosProcesales.defensorPublico.trim();
      console.log(`[CPNU Sync] ✅ Set attorney from defensorPublico: "${updatedData.attorney}"`);
    } else {
      // Both are null or empty - explicitly set attorney to null
      updatedData.attorney = null;
      console.log(`[CPNU Sync] ⚠️ No attorney found in CPNU data, setting attorney to null`);
      console.log(`[CPNU Sync] CPNU data - defensorPrivado: "${cpnuData.sujetosProcesales.defensorPrivado}", defensorPublico: "${cpnuData.sujetosProcesales.defensorPublico}"`);
    }

    // Log final attorney value for debugging
    console.log(`[CPNU Sync] Attorney value after assignment: "${updatedData.attorney}" (type: ${typeof updatedData.attorney}, truthy: ${!!updatedData.attorney})`);

    // Store initial Actuaciones
    if (cpnuData.actuaciones && cpnuData.actuaciones.length > 0) {
      updatedData.cpnu_actuaciones = cpnuData.actuaciones;
      const latestActuacion = cpnuData.actuaciones[0];
      // Use fecha_registro for change detection (cpnu_last_fecha_registro)
      updatedData.cpnu_last_fecha_registro = latestActuacion.fecha_registro;

      // Update last_action with latest Actuacion as object with title (Actuacion) and date (Fecha de actuacion)
      // Format: { title: "Actuacion", date: Date }
      const descripcion = latestActuacion.descripcion || '';
      const fechaActuacion = latestActuacion.fecha_actuacion || latestActuacion.fecha_registro || '';

      let lastActionDate = null;
      if (fechaActuacion) {
        // Parse date string to Date object
        // Handle different formats: YYYY-MM-DD, DD/MM/YYYY, etc.
        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaActuacion)) {
          // YYYY-MM-DD format
          const [year, month, day] = fechaActuacion.split('-').map(Number);
          lastActionDate = new Date(year, month - 1, day);
        } else if (fechaActuacion.includes('/')) {
          // DD/MM/YYYY format
          const parts = fechaActuacion.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts.map(Number);
            lastActionDate = new Date(year, month - 1, day);
          }
        } else {
          // Try parsing as ISO string or other format
          const parsed = new Date(fechaActuacion);
          if (!isNaN(parsed.getTime())) {
            lastActionDate = parsed;
          }
        }
      }

      // Set last_action as object with title and date
      if (descripcion || lastActionDate) {
        updatedData.last_action = {
          title: descripcion || '',
          date: lastActionDate,
        };
      }
    }

    // Add recent_activity entry
    if (!updatedData.recent_activity) {
      updatedData.recent_activity = [];
    }
    updatedData.recent_activity.push({
      id: `cpnu-sync-${Date.now()}`,
      message: `Case synchronized with CPNU (Radicado: ${radicado})`,
      time: new Date().toISOString(),
    });

    // Save updated case
    if (caseSource === 'file') {
      // Save to file
      fs.writeFileSync(casePath, JSON.stringify(updatedData, null, 2), 'utf8');
    } else if (caseSource === 'mcd') {
      // Update MCD in MongoDB
      // Build $set object conditionally to only include attorney if it has a value
      const mcdUpdateData = {
        radicado_cpnu: updatedData.radicado_cpnu,
        linked_cpnu: updatedData.linked_cpnu,
        cpnu_bootstrap_done: updatedData.cpnu_bootstrap_done,
        cpnu_bootstrap_at: new Date(updatedData.cpnu_bootstrap_at),
        cpnu_bootstrap_by: userId,
        court: updatedData.court,
        'parties.plaintiff': updatedData.plaintiff,
        'parties.defendant': updatedData.defendant,
        cpnu_clase_proceso: updatedData.cpnu_clase_proceso,
        cpnu_actuaciones: updatedData.cpnu_actuaciones,
        cpnu_last_fecha_registro: updatedData.cpnu_last_fecha_registro,
        last_action: updatedData.last_action,
        recent_activity: updatedData.recent_activity,
      };

      // Always include attorney in MongoDB update (even if null) to ensure it's updated
      if (updatedData.attorney !== undefined) {
        // Trim if it's a string, otherwise use as-is (null)
        if (typeof updatedData.attorney === 'string' && updatedData.attorney.trim) {
          mcdUpdateData.attorney = updatedData.attorney.trim();
        } else {
          mcdUpdateData.attorney = updatedData.attorney; // null or other value
        }
        console.log(`[CPNU Sync] Including attorney in MongoDB update: ${mcdUpdateData.attorney === null ? 'null' : `"${mcdUpdateData.attorney}"`}`);
      } else {
        console.log(`[CPNU Sync] ⚠️ Attorney is undefined, this should not happen`);
      }

      const updatedMCD = await MasterCaseDocument.findOneAndUpdate(
        { case_id: caseId, user_id: userId },
        {
          $set: mcdUpdateData,
        },
        { new: true }
      );

      console.log(`[CPNU Sync] ✅ MongoDB update completed. Attorney in DB: "${updatedMCD?.attorney}" (type: ${typeof updatedMCD?.attorney})`);
      console.log(`[CPNU Sync] Full mcdUpdateData.attorney: "${mcdUpdateData.attorney}"`);
    }

    console.log(`[CPNU Sync] ✅ Successfully synced case ${caseId} with CPNU`);

    // Track CPNU scraping usage
    if (userId) {
      trackResourceUsage(userId, 'cpnuScrapes', 1, {
        radicado,
        success: true,
      }).catch((err) => {
        console.error('[CPNU Sync] Error tracking resource usage:', err);
        // Don't fail if tracking fails
      });
    }

    // Clear timeout on success
    clearTimeout(timeoutId);

    return res.json({
      success: true,
      message: 'Case successfully synchronized with CPNU',
      data: {
        radicado,
        datosProceso: cpnuData.datosProceso,
        sujetosProcesales: cpnuData.sujetosProcesales,
        actuacionesCount: cpnuData.actuaciones?.length || 0,
      },
    });

  } catch (error) {
    // Clear timeout on error
    clearTimeout(timeoutId);

    console.error('[CPNU Sync] Error:', error);

    // Determine error category
    const errorCategory = error.cpnuErrorCategory || 'other';
    let userMessage = '';
    let statusCode = 500;

    switch (errorCategory) {
      case 'timeout':
        userMessage = 'La conexión con la rama judicial tardó demasiado, intenta nuevamente';
        statusCode = 504;
        break;
      case 'connection':
        userMessage = 'No se pudo conectar a la informacion de la rama judicial, intenta nuevamente';
        statusCode = 503;
        break;
      case 'not_found':
        userMessage = 'No se encontró el radicado en la información de la rama judicial';
        statusCode = 404;
        break;
      case 'validation':
        userMessage = error.message || 'El radicado ingresado no es válido';
        statusCode = 400;
        break;
      default:
        userMessage = 'No se pudo conectar a la informacion de la rama judicial, intenta nuevamente';
        statusCode = 500;
        break;
    }

    return res.status(statusCode).json({
      success: false,
      error: userMessage,
      errorCategory: errorCategory,
      isDuplicateRecord: error.isDuplicateRecord || false,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

export default router;

