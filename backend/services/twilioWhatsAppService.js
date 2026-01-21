/**
 * Twilio WhatsApp Notification Service
 * Sends messages via Twilio WhatsApp API
 */

import twilio from 'twilio';

// Initialize Twilio client (lazy initialization)
let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      const error = new Error('Twilio credentials not configured');
      console.error('[Twilio WhatsApp] ❌ Error initializing Twilio client:', error.message);
      throw error;
    }

    try {
      twilioClient = twilio(accountSid, authToken);
      console.log('[Twilio WhatsApp] ✅ Twilio client initialized successfully');
    } catch (error) {
      console.error('[Twilio WhatsApp] ❌ Error creating Twilio client:', error);
      throw error;
    }
  }
  return twilioClient;
}
/**
 * Send WhatsApp message via Twilio
 * @param {string} phoneNumber - Recipient phone number (E.164 format: +1234567890)
 * @param {string} message - Message text to send
 * @param {number} maxRetries - Maximum number of retry attempts (default: 2)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppMessage(phoneNumber, message, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

      // Validate configuration
      if (!accountSid) {
        console.error('[Twilio WhatsApp] ❌ TWILIO_ACCOUNT_SID not configured');
        return { success: false, error: 'Twilio Account SID not configured' };
      }

      if (!authToken) {
        console.error('[Twilio WhatsApp] ❌ TWILIO_AUTH_TOKEN not configured');
        return { success: false, error: 'Twilio Auth Token not configured' };
      }

      if (!fromNumber) {
        console.error('[Twilio WhatsApp] ❌ TWILIO_WHATSAPP_FROM not configured');
        return { success: false, error: 'Twilio WhatsApp From number not configured' };
      }

      // Validate phone number format (should be E.164: +1234567890)
      if (!phoneNumber || !phoneNumber.startsWith('+')) {
        console.error('[Twilio WhatsApp] ❌ Invalid phone number format. Must be E.164 format (e.g., +1234567890)');
        return { success: false, error: 'Invalid phone number format. Must be E.164 format (e.g., +1234567890)' };
      }

      // Format phone numbers for Twilio (ensure they start with whatsapp:)
      const toNumber = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`;
      const fromNumberFormatted = fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`;

      if (attempt > 0) {
        console.log(`[Twilio WhatsApp] 🔄 Retry attempt ${attempt}/${maxRetries} for ${phoneNumber}`);
      } else {
        console.log(`[Twilio WhatsApp] 📤 Sending message to ${phoneNumber}`);
      }
      console.log(`[Twilio WhatsApp] Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);

      const requestStartTime = Date.now();
      console.log(`[Twilio WhatsApp] 📋 Request Details:`, {
        from: fromNumberFormatted.replace(/(whatsapp:\+\d{1,3})\d+(\d{4})/, '$1****$2'),
        to: toNumber.replace(/(whatsapp:\+\d{1,3})\d+(\d{4})/, '$1****$2'),
        messageLength: message.length,
        messageType: 'text',
        timestamp: new Date().toISOString(),
      });

      // Get Twilio client
      const client = getTwilioClient();

      // Send message via Twilio
      const messageResponse = await client.messages.create({
        from: fromNumberFormatted,
        to: toNumber,
        body: message,
      });

      const requestDuration = Date.now() - requestStartTime;
      console.log(`[Twilio WhatsApp] ⏱️ Request completed in ${requestDuration}ms`);

      // Log full API response for diagnostics
      console.log(`[Twilio WhatsApp] 📋 Full API Response:`, {
        sid: messageResponse.sid,
        status: messageResponse.status,
        to: messageResponse.to,
        from: messageResponse.from,
        dateCreated: messageResponse.dateCreated,
        dateUpdated: messageResponse.dateUpdated,
        errorCode: messageResponse.errorCode,
        errorMessage: messageResponse.errorMessage,
      });

      // Log successful response
      console.log(`[Twilio WhatsApp] ✅ Message sent successfully`);
      console.log(`[Twilio WhatsApp] 📊 Message Details:`, {
        messageId: messageResponse.sid,
        status: messageResponse.status,
        recipient: messageResponse.to,
        from: messageResponse.from,
        responseTime: `${requestDuration}ms`,
      });

      return {
        success: true,
        messageId: messageResponse.sid,
        messageStatus: messageResponse.status,
        recipientWaId: messageResponse.to?.replace('whatsapp:', ''),
        response: messageResponse,
        diagnostics: {
          requestDuration: `${requestDuration}ms`,
        },
      };
    } catch (error) {
      lastError = error;

      // Log detailed error information
      console.error(`[Twilio WhatsApp] ⚠️ Error caught (attempt ${attempt + 1}/${maxRetries + 1}):`, {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.status,
        moreInfo: error.moreInfo,
      });

      // Check if this is a retryable error
      const isRetryable =
        error.code === 20003 || // Unreachable destination
        error.code === 20429 || // Too Many Requests
        error.code === 20404 || // Not Found (temporary)
        error.status >= 500;    // Server errors

      // Don't retry on validation errors or non-retryable errors
      if (!isRetryable || attempt >= maxRetries) {
        break;
      }

      // Exponential backoff before retrying
      const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
      console.log(`[Twilio WhatsApp] ⏳ Error occurred. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All attempts failed
  console.error('[Twilio WhatsApp] ❌ Error sending WhatsApp message after all retries');
  console.error('[Twilio WhatsApp] 📋 Final Error Summary:', {
    errorName: lastError?.name,
    errorMessage: lastError?.message,
    errorCode: lastError?.code,
    errorStatus: lastError?.status,
    attempts: maxRetries + 1,
    timestamp: new Date().toISOString(),
  });

  // Provide detailed error information
  let errorMessage = lastError?.message || 'Unknown error occurred while sending WhatsApp message';
  let diagnostics = '';

  if (lastError?.code) {
    if (lastError.code === 21211) {
      errorMessage = 'Invalid "To" phone number.';
      diagnostics = '\n\n🔍 Diagnosis: The recipient phone number is invalid.\n' +
        '✅ Solution: Verify the phone number is in E.164 format and has WhatsApp installed';
    } else if (lastError.code === 21212) {
      errorMessage = 'Invalid "From" phone number.';
      diagnostics = '\n\n🔍 Diagnosis: The Twilio WhatsApp number is invalid.\n' +
        '✅ Solution: Verify TWILIO_WHATSAPP_FROM is correct and WhatsApp-enabled\n' +
        '   Format: whatsapp:+1234567890';
    } else if (lastError.code === 21608) {
      errorMessage = 'Unsubscribed recipient.';
      diagnostics = '\n\n🔍 Diagnosis: Recipient has opted out of WhatsApp messages.\n' +
        '✅ Solution: Recipient must opt-in again to receive messages';
    } else if (lastError.code === 21610) {
      errorMessage = 'Message body exceeds 1600 characters.';
      diagnostics = '\n\n🔍 Diagnosis: WhatsApp message is too long.\n' +
        '✅ Solution: Truncate or split the message into multiple parts';
    } else if (lastError.code === 20003) {
      errorMessage = 'Unreachable destination handset.';
      diagnostics = '\n\n🔍 Diagnosis: Cannot reach the recipient phone.\n' +
        '✅ Solution: Verify recipient has WhatsApp installed and is online';
    } else if (lastError.code === 20001) {
      errorMessage = 'Unauthorized.';
      diagnostics = '\n\n🔍 Diagnosis: Twilio credentials are invalid.\n' +
        '✅ Solution: Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct';
    } else if (lastError.code === 20404) {
      errorMessage = 'Resource not found.';
      diagnostics = '\n\n🔍 Diagnosis: Twilio resource (number or account) not found.\n' +
        '✅ Solution: Verify Twilio account and phone number are active';
    } else if (lastError.code === 63007) {
      const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'NOT SET';
      const maskedFrom = fromNumber !== 'NOT SET'
        ? fromNumber.replace(/(whatsapp:\+\d{1,3})\d+(\d{4})/, '$1****$2')
        : 'NOT SET';

      errorMessage = 'WhatsApp Channel not found for From number.';
      diagnostics = '\n\n🔍 Diagnosis: The WhatsApp number specified in TWILIO_WHATSAPP_FROM does not exist or WhatsApp is not enabled for this number in your Twilio account.\n\n' +
        '📋 Current Configuration:\n' +
        `   TWILIO_WHATSAPP_FROM: ${maskedFrom}\n\n` +
        '✅ Solutions:\n' +
        '1. **Verify WhatsApp is Enabled in Twilio Console:**\n' +
        '   - Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/incoming\n' +
        '   - Find your number and click on it\n' +
        '   - Check "Messaging" section → Ensure WhatsApp is "Enabled" or "Active"\n' +
        '   - If not enabled, click "Enable WhatsApp" and complete setup\n\n' +
        '2. **If WhatsApp is Not Available for Your Number:**\n' +
        '   - You may need to complete WhatsApp Business verification\n' +
        '   - Go to: Messaging → Senders → WhatsApp\n' +
        '   - Complete business profile and wait for approval\n' +
        '   - Approval can take hours to days\n\n' +
        '3. **For Testing (Temporary Solution):**\n' +
        '   - Use Twilio Sandbox: whatsapp:+14155238886\n' +
        '   - Join sandbox at: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn\n' +
        '   - Send the join code to the provided number from your WhatsApp\n\n' +
        '4. **Verify Number Format:**\n' +
        '   - Must be: whatsapp:+[country code][number]\n' +
        '   - Example: whatsapp:+19012345678\n' +
        '   - No spaces, dashes, or parentheses\n' +
        '   - Must match exactly the number in your Twilio account\n\n' +
        '5. **Check Number Status:**\n' +
        '   - Ensure the number is active in your Twilio account\n' +
        '   - Verify the number has WhatsApp capability enabled\n' +
        '   - Check if number requires business verification';
    }
  }

  if (!diagnostics) {
    diagnostics = '\n\n🔍 General Troubleshooting:\n' +
      '1. Verify Twilio credentials are correct\n' +
      '2. Check phone number formats (E.164)\n' +
      '3. Ensure WhatsApp is enabled on Twilio account\n' +
      '4. Verify recipient has WhatsApp installed\n' +
      `5. Check Twilio error code: ${lastError?.code || 'N/A'}\n` +
      `6. Check Twilio status: ${lastError?.status || 'N/A'}`;
  }

  return {
    success: false,
    error: errorMessage + diagnostics,
    details: {
      error: lastError,
      code: lastError?.code,
      status: lastError?.status,
      moreInfo: lastError?.moreInfo,
      attempts: maxRetries + 1,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Format calendar event notification message
 * (Same format as Meta version for consistency)
 * @param {Object} event - Calendar event object
 * @param {string} notificationType - '24h' or '10min'
 * @returns {string} Formatted message
 */
export function formatCalendarNotificationMessage(event, notificationType) {
  const eventTitle = event.title || event.summary || 'Calendar Event';
  const eventDate = event.start ? new Date(event.start).toLocaleString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : 'Fecha no disponible';
  const eventDescription = event.description || '';
  const eventLocation = event.location || '';

  let timeMessage = '';
  if (notificationType === '24h') {
    timeMessage = 'mañana';
  } else if (notificationType === '10min') {
    timeMessage = 'en 10 minutos';
  }

  let message = `📅 Recordatorio de Pepper 2.0\n\n`;
  message += `Tienes un evento ${timeMessage}:\n\n`;
  message += `📌 ${eventTitle}\n`;
  message += `📆 Fecha: ${eventDate}\n`;

  if (eventLocation) {
    message += `📍 Ubicación: ${eventLocation}\n`;
  }

  if (eventDescription) {
    const maxDescriptionLength = 200;
    const truncatedDescription = eventDescription.length > maxDescriptionLength
      ? eventDescription.substring(0, maxDescriptionLength) + '...'
      : eventDescription;
    message += `\n📝 ${truncatedDescription}\n`;
  }

  message += `\n---\n`;
  message += `Este es un recordatorio automático de Pepper 2.0.`;

  return message;
}


