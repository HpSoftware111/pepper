/**
 * CPNU Automatic Sync Service
 * Automatically syncs Actuaciones from CPNU for linked cases
 * Runs at 12pm and 7pm daily
 */

import { scrapeCPNU, detectActuacionesChanges } from './cpnuService.js';
import { trackResourceUsage } from './resourceTrackingService.js';
import { getCaseFolder, getAllCaseFolders } from '../utils/caseFolderUtils.js';
import { syncCPNUActuacionesToCalendar } from './calendarSyncService.js';
import fs from 'fs';
import path from 'path';
import MasterCaseDocument from '../models/MasterCaseDocument.js';
import User from '../models/User.js';

// Dynamic provider selection for WhatsApp
import { sendWhatsAppMessage as sendMetaWhatsApp } from './whatsappService.js';
import { sendWhatsAppMessage as sendTwilioWhatsApp } from './twilioWhatsAppService.js';

const TWILIO_ENABLED = process.env.TWILIO_WHATSAPP_ENABLED === 'true';
const sendWhatsAppMessage = TWILIO_ENABLED ? sendTwilioWhatsApp : sendMetaWhatsApp;

/**
 * Process automatic CPNU sync for all linked cases
 * Runs at 12pm and 7pm daily
 */
export async function processCPNUAutoSync() {
  const result = {
    processed: 0,
    updated: 0,
    noChanges: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    // Find all file-based cases with CPNU linked
    const fileBasedCases = await findFileBasedCPNUCases();

    // Find all MCD cases with CPNU linked
    const mcdCases = await MasterCaseDocument.find({
      linked_cpnu: true,
      cpnu_bootstrap_done: true,
      is_deleted: { $ne: true },
    }).populate('user_id');

    console.log(`[CPNU Auto-Sync] Found ${fileBasedCases.length} file-based cases and ${mcdCases.length} MCD cases to process`);

    // Process file-based cases
    for (const caseInfo of fileBasedCases) {
      try {
        result.processed++;
        const syncResult = await syncFileBasedCase(caseInfo);
        if (syncResult.updated) result.updated++;
        else if (syncResult.noChanges) result.noChanges++;
      } catch (error) {
        result.errors++;
        result.errorDetails.push({ caseId: caseInfo.caseId, error: error.message });
        console.error(`[CPNU Auto-Sync] Error processing file-based case ${caseInfo.caseId}:`, error);
      }
    }

    // Process MCD cases
    for (const mcd of mcdCases) {
      try {
        result.processed++;
        const syncResult = await syncMCDCase(mcd);
        if (syncResult.updated) result.updated++;
        else if (syncResult.noChanges) result.noChanges++;
      } catch (error) {
        result.errors++;
        result.errorDetails.push({ caseId: mcd.case_id, error: error.message });
        console.error(`[CPNU Auto-Sync] Error processing MCD case ${mcd.case_id}:`, error);
      }
    }

    console.log(`[CPNU Auto-Sync] ✅ Completed: ${result.processed} processed, ${result.updated} updated, ${result.noChanges} no changes, ${result.errors} errors`);
    return result;

  } catch (error) {
    console.error('[CPNU Auto-Sync] Fatal error:', error);
    throw error;
  }
}

/**
 * Find all file-based cases with CPNU linked
 */
async function findFileBasedCPNUCases() {
  const cases = [];

  try {
    // Get all user case directories
    const casesBaseDir = path.join(process.cwd(), 'cases');
    if (!fs.existsSync(casesBaseDir)) {
      return cases;
    }

    const userDirs = fs.readdirSync(casesBaseDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const userId of userDirs) {
      const userCasesDir = path.join(casesBaseDir, userId);
      const caseDirs = fs.readdirSync(userCasesDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

      for (const caseDir of caseDirs) {
        const caseJsonPath = path.join(userCasesDir, caseDir, 'case.json');
        if (fs.existsSync(caseJsonPath)) {
          try {
            const caseData = JSON.parse(fs.readFileSync(caseJsonPath, 'utf8'));
            if (caseData.linked_cpnu === true &&
              caseData.cpnu_bootstrap_done === true &&
              caseData.is_deleted !== true &&
              caseData.radicado_cpnu) {
              cases.push({
                userId,
                caseId: caseData.case_id,
                casePath: caseJsonPath,
                caseData,
              });
            }
          } catch (error) {
            console.error(`[CPNU Auto-Sync] Error reading case file ${caseJsonPath}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error('[CPNU Auto-Sync] Error finding file-based cases:', error);
  }

  return cases;
}

/**
 * Sync a file-based case
 */
async function syncFileBasedCase(caseInfo) {
  const { userId, caseId, casePath, caseData } = caseInfo;

  if (!caseData.radicado_cpnu) {
    throw new Error('Radicado CPNU not found');
  }

  console.log(`[CPNU Auto-Sync] Processing file-based case ${caseId} (radicado: ${caseData.radicado_cpnu})`);

  // Scrape only Actuaciones tab
  const cpnuData = await scrapeCPNU(caseData.radicado_cpnu);

  // Track CPNU scraping usage
  if (userId) {
    trackResourceUsage(userId, 'cpnuScrapes', 1, {
      radicado: caseData.radicado_cpnu,
      success: true,
    }).catch((err) => {
      console.error('[CPNU Auto-Sync] Error tracking resource usage:', err);
      // Don't fail if tracking fails
    });
  }

  // Detect changes
  const changeDetection = detectActuacionesChanges(
    caseData.cpnu_last_fecha_registro,
    cpnuData.actuaciones
  );

  // Update sync timestamps
  const updatedData = { ...caseData };
  updatedData.cpnu_last_sync_at = new Date().toISOString();

  if (changeDetection.hasChanges) {
    // Merge new Actuaciones (avoid duplicates)
    const existingFechas = new Set(
      (caseData.cpnu_actuaciones || []).map(a => a.fecha_registro)
    );
    const newActuaciones = changeDetection.newActuaciones.filter(
      a => !existingFechas.has(a.fecha_registro)
    );

    updatedData.cpnu_actuaciones = [
      ...newActuaciones,
      ...(caseData.cpnu_actuaciones || []),
    ].sort((a, b) => {
      if (!a.fecha_registro || !b.fecha_registro) {
        if (!a.fecha_registro && !b.fecha_registro) return 0;
        return !a.fecha_registro ? 1 : -1; // Items without fecha_registro go to end
      }
      try {
        const dateA = new Date(a.fecha_registro);
        const dateB = new Date(b.fecha_registro);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
          return isNaN(dateA.getTime()) ? 1 : -1; // Invalid dates go to end
        }
        return dateB - dateA; // Descending (newest first)
      } catch (error) {
        console.warn(`[CPNU Auto-Sync] Error sorting actuaciones for case ${caseId}:`, error);
        return 0;
      }
    });

    updatedData.cpnu_last_fecha_registro = changeDetection.latestFechaRegistro;
    updatedData.cpnu_last_sync_status = 'success';

    // Update last_action as object with title (Actuacion) and date (Fecha de actuacion)
    // Format: { title: "Actuacion", date: Date }
    if (newActuaciones.length > 0) {
      const latestActuacion = newActuaciones[0];
      const descripcion = latestActuacion.descripcion || '';
      const fechaActuacion = latestActuacion.fecha_actuacion || latestActuacion.fecha_registro || '';
      
      let lastActionDate = null;
      if (fechaActuacion) {
        // Parse date string to Date object
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

    // Add recent_activity
    if (!updatedData.recent_activity) {
      updatedData.recent_activity = [];
    }
    updatedData.recent_activity.push({
      id: `cpnu-auto-${Date.now()}`,
      message: `New Actuaciones detected from CPNU (${newActuaciones.length} new)`,
      time: new Date().toISOString(),
    });

    // Save updated case
    fs.writeFileSync(casePath, JSON.stringify(updatedData, null, 2), 'utf8');

    // Create calendar events from new Actuaciones (fecha_registro) for WhatsApp notifications
    const caseName = updatedData.client || `${updatedData.plaintiff || ''} vs. ${updatedData.defendant || ''}`.trim() || caseId;
    try {
      const calendarResult = await syncCPNUActuacionesToCalendar(userId, caseId, caseName, newActuaciones);
      console.log(`[CPNU Auto-Sync] ✅ Created ${calendarResult.created || 0} calendar event(s) for case ${caseId}`);
    } catch (calendarError) {
      console.error(`[CPNU Auto-Sync] ⚠️ Error creating calendar events for case ${caseId}:`, calendarError);
      // Don't fail the sync if calendar creation fails
    }

    // Send WhatsApp notification
    await sendCPNUWhatsAppNotification(userId, updatedData, newActuaciones);

    console.log(`[CPNU Auto-Sync] ✅ Updated case ${caseId} with ${newActuaciones.length} new Actuaciones`);
    return { updated: true };
  } else {
    updatedData.cpnu_last_sync_status = 'no_changes';
    fs.writeFileSync(casePath, JSON.stringify(updatedData, null, 2), 'utf8');
    console.log(`[CPNU Auto-Sync] ⏭️  No changes for case ${caseId}`);
    return { noChanges: true };
  }
}

/**
 * Sync an MCD case
 */
async function syncMCDCase(mcd) {
  if (!mcd.radicado_cpnu) {
    throw new Error('Radicado CPNU not found');
  }

  console.log(`[CPNU Auto-Sync] Processing MCD case ${mcd.case_id} (radicado: ${mcd.radicado_cpnu})`);

  // Get userId from MCD
  const userId = mcd.user_id?.toString ? mcd.user_id.toString() : mcd.user_id;

  // Scrape only Actuaciones tab
  const cpnuData = await scrapeCPNU(mcd.radicado_cpnu);

  // Track CPNU scraping usage
  if (userId) {
    trackResourceUsage(userId, 'cpnuScrapes', 1, {
      radicado: mcd.radicado_cpnu,
      success: true,
    }).catch((err) => {
      console.error('[CPNU Auto-Sync] Error tracking resource usage:', err);
      // Don't fail if tracking fails
    });
  }

  // Detect changes
  const changeDetection = detectActuacionesChanges(
    mcd.cpnu_last_fecha_registro,
    cpnuData.actuaciones
  );

  // Update sync timestamps
  const updateData = {
    cpnu_last_sync_at: new Date(),
  };

  if (changeDetection.hasChanges) {
    // Merge new Actuaciones
    const existingFechas = new Set(
      (mcd.cpnu_actuaciones || []).map(a => a.fecha_registro)
    );
    const newActuaciones = changeDetection.newActuaciones.filter(
      a => !existingFechas.has(a.fecha_registro)
    );

    updateData.cpnu_actuaciones = [
      ...newActuaciones,
      ...(mcd.cpnu_actuaciones || []),
    ].sort((a, b) => {
      if (!a.fecha_registro || !b.fecha_registro) {
        if (!a.fecha_registro && !b.fecha_registro) return 0;
        return !a.fecha_registro ? 1 : -1; // Items without fecha_registro go to end
      }
      try {
        const dateA = new Date(a.fecha_registro);
        const dateB = new Date(b.fecha_registro);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
          return isNaN(dateA.getTime()) ? 1 : -1; // Invalid dates go to end
        }
        return dateB - dateA; // Descending (newest first)
      } catch (error) {
        console.warn(`[CPNU Auto-Sync] Error sorting actuaciones for MCD case ${mcd.case_id}:`, error);
        return 0;
      }
    });

    updateData.cpnu_last_fecha_registro = changeDetection.latestFechaRegistro;
    updateData.cpnu_last_sync_status = 'success';

    // Update last_action as object with title (Actuacion) and date (Fecha de actuacion)
    // Format: { title: "Actuacion", date: Date }
    if (newActuaciones.length > 0) {
      const latestActuacion = newActuaciones[0];
      const descripcion = latestActuacion.descripcion || '';
      const fechaActuacion = latestActuacion.fecha_actuacion || latestActuacion.fecha_registro || '';
      
      let lastActionDate = null;
      if (fechaActuacion) {
        // Parse date string to Date object
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
        updateData.last_action = {
          title: descripcion || '',
          date: lastActionDate,
        };
      }
    }

    // Add recent_activity
    const recentActivity = mcd.recent_activity || [];
    recentActivity.push({
      id: `cpnu-auto-${Date.now()}`,
      message: `New Actuaciones detected from CPNU (${newActuaciones.length} new)`,
      time: new Date().toISOString(),
    });
    updateData.recent_activity = recentActivity;

    // Update MCD
    await MasterCaseDocument.findByIdAndUpdate(mcd._id, { $set: updateData });

    // Create calendar events from new Actuaciones (fecha_registro) for WhatsApp notifications
    const mcdObj = mcd.toObject ? mcd.toObject() : mcd;
    const caseName = mcdObj.parties?.plaintiff || mcdObj.parties?.defendant || mcd.case_id;
    const userIdStr = mcd.user_id?._id ? mcd.user_id._id.toString() : (mcd.user_id?.toString() || mcd.user_id);
    try {
      const calendarResult = await syncCPNUActuacionesToCalendar(userIdStr, mcd.case_id, caseName, newActuaciones);
      console.log(`[CPNU Auto-Sync] ✅ Created ${calendarResult.created || 0} calendar event(s) for MCD case ${mcd.case_id}`);
    } catch (calendarError) {
      console.error(`[CPNU Auto-Sync] ⚠️ Error creating calendar events for MCD case ${mcd.case_id}:`, calendarError);
      // Don't fail the sync if calendar creation fails
    }

    // Send WhatsApp notification
    await sendCPNUWhatsAppNotification(mcd.user_id, mcdObj, newActuaciones);

    console.log(`[CPNU Auto-Sync] ✅ Updated MCD case ${mcd.case_id} with ${newActuaciones.length} new Actuaciones`);
    return { updated: true };
  } else {
    updateData.cpnu_last_sync_status = 'no_changes';
    await MasterCaseDocument.findByIdAndUpdate(mcd._id, { $set: updateData });
    console.log(`[CPNU Auto-Sync] ⏭️  No changes for MCD case ${mcd.case_id}`);
    return { noChanges: true };
  }
}

/**
 * Send WhatsApp notification for CPNU updates
 */
async function sendCPNUWhatsAppNotification(userId, caseData, newActuaciones) {
  try {
    // Handle both ObjectId and populated User object
    const userIdStr = userId?._id ? userId._id.toString() : (userId?.toString() || userId);

    // Get user phone number
    const user = await User.findById(userIdStr);
    if (!user || !user.phone) {
      console.log(`[CPNU Auto-Sync] User ${userIdStr} has no phone number, skipping WhatsApp notification`);
      return;
    }

    // Format message with URLs
    const frontendUrl = process.env.FRONTEND_URL || 'https://pepper.app';
    const pepperCaseUrl = `${frontendUrl}/cases?case=${caseData.case_id}`;
    const cpnuUrl = `https://consultaprocesos.ramajudicial.gov.co/Procesos/NumeroRadicacion?numeroRadicacion=${caseData.radicado_cpnu}`;

    let message = `🔔 Actualización de Caso CPNU\n\n`;
    message += `📌 Caso: ${caseData.case_id}\n`;
    message += `📋 Nueva actuación detectada:\n\n`;

    // Show latest Actuacion
    const latest = newActuaciones[0];
    message += `📅 Fecha: ${latest.fecha_registro}\n`;
    message += `📝 ${latest.descripcion}\n\n`;

    message += `🔗 Ver caso en Pepper:\n${pepperCaseUrl}\n\n`;
    message += `🔗 Consultar en CPNU:\n${cpnuUrl}\n\n`;
    message += `---\n`;
    message += `Este es un aviso automático de Pepper 2.0.`;

    // Send WhatsApp
    const result = await sendWhatsAppMessage(user.phone, message);
    if (result.success) {
      console.log(`[CPNU Auto-Sync] ✅ WhatsApp notification sent to ${user.phone}`);
    } else {
      console.error(`[CPNU Auto-Sync] ❌ Failed to send WhatsApp: ${result.error}`);
    }
  } catch (error) {
    console.error(`[CPNU Auto-Sync] Error sending WhatsApp notification:`, error);
  }
}

