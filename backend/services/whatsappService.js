/**
 * WhatsApp Notification Service
 * Sends messages via Meta WhatsApp Cloud API
 */

import { Client } from 'undici';

// Create a reusable HTTP client with increased timeouts for WhatsApp API
// Increased timeouts to handle slow DNS resolution and network issues
const whatsappClient = new Client('https://graph.facebook.com', {
  connectTimeout: 60000, // 60 seconds connection timeout (handles slow DNS + connection)
  bodyTimeout: 30000,    // 30 seconds body timeout
  headersTimeout: 30000, // 30 seconds headers timeout
});

/**
 * Send WhatsApp message with retry logic
 * @param {string} phoneNumber - Recipient phone number (E.164 format: +1234567890)
 * @param {string} message - Message text to send
 * @param {number} maxRetries - Maximum number of retry attempts (default: 2)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppMessage(phoneNumber, message, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
      const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

      // Validate configuration
      if (!accessToken) {
        console.error('[WhatsApp] ❌ WHATSAPP_ACCESS_TOKEN not configured');
        return { success: false, error: 'WhatsApp access token not configured' };
      }

      if (!phoneNumberId) {
        console.error('[WhatsApp] ❌ WHATSAPP_PHONE_NUMBER_ID not configured');
        return { success: false, error: 'WhatsApp phone number ID not configured' };
      }

      // Validate phone number format (should be E.164: +1234567890)
      if (!phoneNumber || !phoneNumber.startsWith('+')) {
        console.error('[WhatsApp] ❌ Invalid phone number format. Must be E.164 format (e.g., +1234567890)');
        return { success: false, error: 'Invalid phone number format. Must be E.164 format (e.g., +1234567890)' };
      }

      // Prepare message body
      const body = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message,
        },
      };

      // API endpoint path
      const path = `/${version}/${phoneNumberId}/messages`;

      // Headers
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      if (attempt > 0) {
        console.log(`[WhatsApp] 🔄 Retry attempt ${attempt}/${maxRetries} for ${phoneNumber}`);
      } else {
        console.log(`[WhatsApp] 📤 Sending message to ${phoneNumber}`);
      }
      console.log(`[WhatsApp] Message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
      console.log(`[WhatsApp] 🔗 Connecting to graph.facebook.com (timeout: 60s)...`);

      // Log request details (sanitized)
      const requestStartTime = Date.now();
      console.log(`[WhatsApp] 📋 Request Details:`, {
        endpoint: `/${version}/${phoneNumberId}/messages`,
        phoneNumber: phoneNumber.replace(/(\+\d{1,3})\d+(\d{4})/, '$1****$2'), // Mask phone number
        messageLength: message.length,
        messageType: 'text',
        timestamp: new Date().toISOString(),
      });

      // Send request using undici Client with custom timeout configuration
      const { statusCode, body: responseBody } = await whatsappClient.request({
        path,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const requestDuration = Date.now() - requestStartTime;
      console.log(`[WhatsApp] ⏱️ Request completed in ${requestDuration}ms (HTTP ${statusCode})`);

      // Parse response body
      const responseData = await responseBody.json();

      // Log full API response for diagnostics
      console.log(`[WhatsApp] 📋 Full API Response:`, JSON.stringify(responseData, null, 2));

      // Check if request was successful (2xx status codes)
      if (statusCode < 200 || statusCode >= 300) {
        const errorDetails = responseData.error || {};
        console.error('[WhatsApp] ❌ API Error Response:', {
          statusCode,
          errorType: errorDetails.type,
          errorCode: errorDetails.code,
          errorMessage: errorDetails.message,
          errorSubcode: errorDetails.error_subcode,
          fbtraceId: errorDetails.fbtrace_id,
        });

        // Provide detailed error diagnostics
        let diagnosticMessage = errorDetails.message || `HTTP ${statusCode}: Failed to send WhatsApp message`;

        if (errorDetails.code === 133010) {
          diagnosticMessage = 'WhatsApp Business Account is not fully registered.\n\n' +
            '🔍 Diagnosis:\n' +
            '- The WhatsApp Business Account needs to complete registration\n' +
            '- Phone number may not be fully verified\n' +
            '- Business verification may be incomplete\n\n' +
            '✅ Solutions:\n' +
            '1. Complete Phone Number Verification:\n' +
            '   - Go to Meta Business Manager → WhatsApp → API Setup\n' +
            '   - Find your phone number\n' +
            '   - Enter the certificate code\n' +
            '   - Complete all verification steps\n\n' +
            '2. Verify Account Status:\n' +
            '   - Check that phone number status is "Active" or "Verified"\n' +
            '   - If status is "Pending", complete required steps\n\n' +
            '3. Complete Business Verification (if required):\n' +
            '   - Go to Business Settings → Security Center\n' +
            '   - Complete business verification if prompted';
        } else if (errorDetails.code === 100 && errorDetails.error_subcode === 33) {
          diagnosticMessage = 'Phone Number ID is invalid or access token lacks permissions.\n\n' +
            '🔍 Diagnosis:\n' +
            `- Phone Number ID "${phoneNumberId}" does not exist or is incorrect\n` +
            '- Access token may not have permissions to access this phone number\n' +
            '- Phone number may not be properly verified/set up\n\n' +
            '✅ Solutions:\n' +
            '1. Verify Phone Number ID in Meta Business Manager:\n' +
            '   - Go to WhatsApp → API Setup\n' +
            '   - Find your phone number\n' +
            '   - Copy the correct Phone Number ID\n' +
            '   - Update WHATSAPP_PHONE_NUMBER_ID in .env file\n\n' +
            '2. Verify Access Token Permissions:\n' +
            '   - Go to System Users → Your System User\n' +
            '   - Ensure WhatsApp permissions are granted\n' +
            '   - Regenerate token if needed';
        } else if (errorDetails.code === 131047) {
          diagnosticMessage += '\n\n🔍 Diagnosis: Phone number not registered in WhatsApp Business API test mode.\n' +
            '✅ Solution: Add this phone number as a test number in Meta Business Manager → WhatsApp → API Setup';
        } else if (errorDetails.code === 131026) {
          diagnosticMessage += '\n\n🔍 Diagnosis: Message sent outside 24-hour messaging window.\n' +
            '✅ Solution: Use approved message templates instead of free-form text messages';
        } else if (errorDetails.code === 131031) {
          diagnosticMessage += '\n\n🔍 Diagnosis: Recipient phone number is not a valid WhatsApp number.\n' +
            '✅ Solution: Verify the phone number has WhatsApp installed and is active';
        } else if (errorDetails.code === 190) {
          diagnosticMessage += '\n\n🔍 Diagnosis: Access token expired or invalid.\n' +
            '✅ Solution: Generate a new permanent access token in Meta Business Manager';
        } else if (errorDetails.error_subcode) {
          diagnosticMessage += `\n\n🔍 Error Subcode: ${errorDetails.error_subcode}`;
        }

        return {
          success: false,
          error: diagnosticMessage,
          details: {
            statusCode,
            error: errorDetails,
            response: responseData,
          },
        };
      }

      // Extract message information
      const messageInfo = responseData.messages?.[0];
      const messageId = messageInfo?.id;
      const messageStatus = messageInfo?.message_status;
      const contacts = responseData.contacts?.[0];
      const contactWaId = contacts?.wa_id;
      const contactInput = contacts?.input;

      // Log successful response details
      console.log(`[WhatsApp] ✅ Message accepted by API`);
      console.log(`[WhatsApp] 📊 Message Details:`, {
        messageId,
        messageStatus: messageStatus || 'accepted',
        recipientWaId: contactWaId || phoneNumber,
        recipientInput: contactInput || phoneNumber,
        responseTime: `${requestDuration}ms`,
      });

      // Check for warnings in the response
      if (responseData.messages?.[0]?.warnings) {
        console.warn(`[WhatsApp] ⚠️ API Warnings:`, responseData.messages[0].warnings);
        responseData.messages[0].warnings.forEach((warning, index) => {
          console.warn(`[WhatsApp] ⚠️ Warning ${index + 1}:`, {
            code: warning.code,
            title: warning.title,
            message: warning.message,
            details: warning.details,
          });
        });
      }

      // Check for contact information
      if (contacts) {
        console.log(`[WhatsApp] 👤 Contact Info:`, {
          waId: contacts.wa_id,
          input: contacts.input,
          profileName: contacts.profile?.name || 'Not available',
        });
      }

      // Diagnostic information for delivery issues
      if (messageId) {
        console.log(`[WhatsApp] 🔍 Delivery Diagnostics:`, {
          messageId,
          note: 'Message accepted by WhatsApp API. Delivery status will be updated via webhooks.',
          troubleshooting: 'If message not received, check:\n' +
            '1. Phone number is registered in test mode (if account is in test mode)\n' +
            '2. Recipient has WhatsApp installed and active\n' +
            '3. Message is within 24-hour window (or using approved template)\n' +
            '4. Check webhook delivery status updates',
        });
      }

      return {
        success: true,
        messageId,
        messageStatus: messageStatus || 'accepted',
        recipientWaId: contactWaId,
        response: responseData,
        diagnostics: {
          requestDuration: `${requestDuration}ms`,
          hasWarnings: !!(responseData.messages?.[0]?.warnings?.length),
          warnings: responseData.messages?.[0]?.warnings || [],
        },
      };
    } catch (error) {
      lastError = error;

      // Log detailed error information
      console.error(`[WhatsApp] ⚠️ Error caught (attempt ${attempt + 1}/${maxRetries + 1}):`, {
        name: error.name,
        message: error.message,
        code: error.code,
        cause: error.cause ? {
          code: error.cause.code,
          message: error.cause.message,
        } : null,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });

      // Check if this is a retryable error
      const isRetryable =
        error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error.name === 'ConnectTimeoutError';

      // Don't retry on validation errors or non-network errors
      if (!isRetryable || attempt >= maxRetries) {
        break;
      }

      // Exponential backoff before retrying
      const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
      console.log(`[WhatsApp] ⏳ Connection timeout. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All attempts failed
  console.error('[WhatsApp] ❌ Error sending WhatsApp message after all retries');
  console.error('[WhatsApp] 📋 Final Error Summary:', {
    errorName: lastError?.name,
    errorMessage: lastError?.message,
    errorCode: lastError?.code,
    causeCode: lastError?.cause?.code,
    attempts: maxRetries + 1,
    timestamp: new Date().toISOString(),
  });

  // Provide detailed error information with diagnostics
  let errorMessage = lastError?.message || 'Unknown error occurred while sending WhatsApp message';
  let diagnostics = '';

  if (lastError?.cause) {
    if (lastError.cause.code === 'UND_ERR_CONNECT_TIMEOUT') {
      errorMessage = 'Connection timeout: Unable to establish connection to WhatsApp API.';
      diagnostics = '\n\n🔍 Network Diagnostics:\n' +
        '- DNS resolution: Working (graph.facebook.com resolves)\n' +
        '- Connection: Hanging at TCP handshake\n' +
        '- This indicates firewall/network filtering is blocking the connection\n\n' +
        '✅ Solutions:\n' +
        '1. Firewall Configuration:\n' +
        '   - Windows Firewall → Allow Node.js outbound HTTPS\n' +
        '   - Allow outbound connections to graph.facebook.com:443\n' +
        '   - Check corporate firewall rules\n\n' +
        '2. Network/Proxy Settings:\n' +
        '   - If behind corporate proxy, set HTTPS_PROXY environment variable\n' +
        '   - Example: set HTTPS_PROXY=http://proxy.company.com:8080\n\n' +
        '3. Network Administrator:\n' +
        '   - Request whitelist for graph.facebook.com:443\n' +
        '   - Verify outbound HTTPS is not blocked\n\n' +
        '4. Test Connectivity:\n' +
        '   - curl -v --connect-timeout 30 https://graph.facebook.com\n' +
        '   - If curl also hangs, it confirms firewall blocking';
    } else if (lastError.cause.code === 'UND_ERR_SOCKET') {
      errorMessage = 'Network error: Unable to establish connection to WhatsApp API.';
      diagnostics = '\n\n🔍 Network Diagnostics:\n' +
        '- Socket connection failed\n' +
        '- Check network connectivity and firewall settings\n' +
        '- Verify DNS resolution is working';
    } else {
      errorMessage = `${errorMessage} (${lastError.cause.code || 'network error'})`;
    }
  }

  if (lastError?.name === 'AbortError' || lastError?.name === 'TimeoutError') {
    errorMessage = 'Request timeout: The connection attempt is being blocked or filtered.';
    diagnostics = '\n\n🔍 Timeout Diagnostics:\n' +
      '- Request exceeded maximum timeout period\n' +
      '- Check firewall rules and network settings\n' +
      '- Verify network connectivity to graph.facebook.com';
  }

  // Add general troubleshooting if no specific diagnostics
  if (!diagnostics) {
    diagnostics = '\n\n🔍 General Troubleshooting:\n' +
      '1. Check network connectivity\n' +
      '2. Verify firewall allows outbound HTTPS\n' +
      '3. Check WhatsApp API credentials are valid\n' +
      '4. Review error logs for specific error codes';
  }

  return {
    success: false,
    error: errorMessage + diagnostics,
    details: {
      error: lastError,
      cause: lastError?.cause,
      attempts: maxRetries + 1,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * IMPORTANT – WhatsApp Calendar Notifications
 *
 * All calendar reminders (10-minute, 24-hour, etc.) MUST be sent using
 * an approved WhatsApp TEMPLATE message.
 *
 * Reason:
 * - WhatsApp only allows free-form text messages inside an active
 *   24-hour customer service window.
 * - Calendar reminders are system-initiated messages and are usually
 *   sent OUTSIDE that window.
 * - If a non-template ("text") message is used, the API may return HTTP 200
 *   with status "accepted", BUT the message will be silently dropped
 *   and never delivered to the user.
 *
 * Using "type": "template":
 * - Works in production without prior user interaction
 * - Complies with Meta WhatsApp messaging policies
 * - Guarantees delivery eligibility for reminders and alerts
 *
 * DO NOT change this notification to "type": "text".
 * Always use an approved reminder template (e.g. event_details_reminder_1).
 */

/**
 * Send WhatsApp template message for calendar notifications
 * @param {string} phoneNumber - Recipient phone number (E.164 format: +1234567890)
 * @param {Object} event - Calendar event object
 * @param {string} notificationType - '24h' or '10min'
 * @param {number} maxRetries - Maximum number of retry attempts (default: 2)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppTemplateMessage(phoneNumber, event, notificationType, maxRetries = 2) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
      const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      // Default to pepper_event_reminder as documented, fallback to event_details_reminder_1 for backward compatibility
      const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'event_details_reminder_1';

      // Validate configuration
      if (!accessToken) {
        console.error('[WhatsApp] ❌ WHATSAPP_ACCESS_TOKEN not configured');
        return { success: false, error: 'WhatsApp access token not configured' };
      }

      if (!phoneNumberId) {
        console.error('[WhatsApp] ❌ WHATSAPP_PHONE_NUMBER_ID not configured');
        return { success: false, error: 'WhatsApp phone number ID not configured' };
      }

      // Validate phone number format (should be E.164: +1234567890)
      if (!phoneNumber || !phoneNumber.startsWith('+')) {
        console.error('[WhatsApp] ❌ Invalid phone number format. Must be E.164 format (e.g., +1234567890)');
        return { success: false, error: 'Invalid phone number format. Must be E.164 format (e.g., +1234567890)' };
      }

      // Format event data
      const eventTitle = event.title || event.summary || 'Calendar Event';
      const eventDate = event.start ? new Date(event.start).toLocaleString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) : 'Fecha no disponible';
      const eventLocation = event.location || 'No especificada';
      const timeMessage = notificationType === '24h' ? 'mañana' : 'en 10 minutos';

      // Get logo URL for header image (if template uses dynamic header image)
      // Template: event_details_reminder_1 (may include header image)
      // If template has static header image (uploaded in Meta), this will be ignored
      // If template has dynamic header image parameter, provide URL via WHATSAPP_LOGO_URL env var
      const logoUrl = process.env.WHATSAPP_LOGO_URL || process.env.WHATSAPP_TEMPLATE_LOGO_URL;

      // Prepare template message components
      // Template structure must match Meta Business Manager template: event_details_reminder_1
      // Expected template structure:
      // - Header: Image (optional, if dynamic header parameter exists)
      // - Body: 4 text parameters:
      //   1. Timing (mañana/en 10 minutos)
      //   2. Event title
      //   3. Event date/time
      //   4. Event location
      const components = [];

      // Add header component if template uses dynamic header image parameter
      // Note: Only include if template has a header image parameter (dynamic)
      // If your template uses a static header image (uploaded in Meta), omit this header component
      if (logoUrl) {
        components.push({
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: logoUrl, // Publicly accessible HTTPS URL to logo image
              },
            },
          ],
        });
      }

      // Add body component with event parameters
      components.push({
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: timeMessage, // Parameter 1: Timing (mañana/en 10 minutos)
          },
          {
            type: 'text',
            text: eventTitle, // Parameter 2: Event title
          },
          {
            type: 'text',
            text: eventDate, // Parameter 3: Event date/time (formatted in Spanish)
          },
          {
            type: 'text',
            text: eventLocation, // Parameter 4: Location (or "No especificada")
          },
        ],
      });

      // Prepare template message body
      const body = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: templateName, // Default: event_details_reminder_1
          language: {
            code: 'es', // Spanish language code
          },
          components: components,
        },
      };

      // API endpoint path
      const path = `/${version}/${phoneNumberId}/messages`;

      // Headers
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };

      if (attempt > 0) {
        console.log(`[WhatsApp] 🔄 Retry attempt ${attempt}/${maxRetries} for ${phoneNumber}`);
      } else {
        console.log(`[WhatsApp] 📤 Sending template message to ${phoneNumber}`);
      }
      console.log(`[WhatsApp] Template: ${templateName}, Event: ${eventTitle}`);
      console.log(`[WhatsApp] Language: es (Spanish)`);
      console.log(`[WhatsApp] ⚠️  Note: Template must have Spanish (es) translation in Meta Business Manager`);
      console.log(`[WhatsApp] 🔗 Connecting to graph.facebook.com (timeout: 60s)...`);

      // Log request details (sanitized)
      const requestStartTime = Date.now();
      console.log(`[WhatsApp] 📋 Request Details:`, {
        endpoint: `/${version}/${phoneNumberId}/messages`,
        phoneNumber: phoneNumber.replace(/(\+\d{1,3})\d+(\d{4})/, '$1****$2'), // Mask phone number
        templateName,
        messageType: 'template',
        timestamp: new Date().toISOString(),
      });

      // Send request using undici Client with custom timeout configuration
      const { statusCode, body: responseBody } = await whatsappClient.request({
        path,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const requestDuration = Date.now() - requestStartTime;
      console.log(`[WhatsApp] ⏱️ Request completed in ${requestDuration}ms (HTTP ${statusCode})`);

      // Parse response body
      const responseData = await responseBody.json();

      // Log full API response for diagnostics
      console.log(`[WhatsApp] 📋 Full API Response:`, JSON.stringify(responseData, null, 2));

      // Check if request was successful (2xx status codes)
      if (statusCode < 200 || statusCode >= 300) {
        const errorDetails = responseData.error || {};
        console.error('[WhatsApp] ❌ API Error Response:', {
          statusCode,
          errorType: errorDetails.type,
          errorCode: errorDetails.code,
          errorMessage: errorDetails.message,
          errorSubcode: errorDetails.error_subcode,
          fbtraceId: errorDetails.fbtrace_id,
        });

        // Provide detailed error diagnostics
        let diagnosticMessage = errorDetails.message || `HTTP ${statusCode}: Failed to send WhatsApp template message`;

        if (errorDetails.code === 132001) {
          // Template exists but missing translation for the specified language
          diagnosticMessage = `Template "${templateName}" exists but does not have a Spanish (es) translation.\n\n` +
            '🔍 Diagnosis:\n' +
            `- Template "${templateName}" exists in Meta Business Manager\n` +
            `- Template does NOT have a Spanish (es) translation\n` +
            `- Code is trying to use language code: "es"\n\n` +
            '✅ Solutions:\n' +
            '1. Add Spanish Translation to Existing Template:\n' +
            '   - Go to Meta Business Manager → WhatsApp → Message Templates\n' +
            `   - Find template "${templateName}"\n` +
            '   - Click "Add Language" or "Edit" → Add Spanish (es) translation\n' +
            '   - Use the same structure with 4 body parameters:\n' +
            '     {{1}} = Timing (mañana/en 10 minutos)\n' +
            '     {{2}} = Event Title\n' +
            '     {{3}} = Date/Time\n' +
            '     {{4}} = Location\n' +
            '   - Submit for approval and wait 24-48 hours\n\n' +
            '2. Use a Different Template with Spanish Translation:\n' +
            '   - Check Meta Business Manager for templates with Spanish (es) translation\n' +
            '   - Update WHATSAPP_TEMPLATE_NAME in .env file to match an approved Spanish template\n' +
            '   - Recommended: Use "pepper_event_reminder" (create it following the docs)\n\n' +
            '3. Create New Template with Spanish Translation:\n' +
            '   - Follow the guide in docs/WHATSAPP_TEMPLATE_SETUP.md\n' +
            '   - Create template "pepper_event_reminder" with Spanish (es) as primary language\n' +
            '   - Ensure it has 4 body parameters matching the code structure';
        } else if (errorDetails.code === 132000) {
          diagnosticMessage = 'Template not found or not approved.\n\n' +
            '🔍 Diagnosis:\n' +
            `- Template "${templateName}" does not exist or is not approved\n` +
            '- Template may be pending approval in Meta Business Manager\n' +
            '- Template name may be incorrect\n\n' +
            '✅ Solutions:\n' +
            '1. Verify Template Name:\n' +
            '   - Go to Meta Business Manager → WhatsApp → Message Templates\n' +
            '   - Find your template and verify the exact name\n' +
            '   - Update WHATSAPP_TEMPLATE_NAME in .env file\n\n' +
            '2. Check Template Status:\n' +
            '   - Template must be "Approved" (not "Pending" or "Rejected")\n' +
            '   - Wait for Meta approval if template is pending\n\n' +
            '3. Verify Template Structure:\n' +
            '   - Template must have 4 body parameters matching the code\n' +
            '   - Parameters: Timing, Event Title, Date/Time, Location';
        } else if (errorDetails.code === 131026) {
          diagnosticMessage += '\n\n🔍 Diagnosis: Template parameters do not match template structure.\n' +
            '✅ Solution: Verify template has exactly 4 body parameters in Meta Business Manager';
        } else if (errorDetails.code === 100 && errorDetails.error_subcode === 33) {
          diagnosticMessage = 'Phone Number ID is invalid or access token lacks permissions.\n\n' +
            '🔍 Diagnosis:\n' +
            `- Phone Number ID "${phoneNumberId}" does not exist or is incorrect\n` +
            '- Access token may not have permissions to access this phone number\n\n' +
            '✅ Solutions:\n' +
            '1. Verify Phone Number ID in Meta Business Manager\n' +
            '2. Verify Access Token Permissions';
        } else if (errorDetails.error_subcode) {
          diagnosticMessage += `\n\n🔍 Error Subcode: ${errorDetails.error_subcode}`;
        }

        return {
          success: false,
          error: diagnosticMessage,
          details: {
            statusCode,
            error: errorDetails,
            response: responseData,
          },
        };
      }

      // Extract message information
      const messageInfo = responseData.messages?.[0];
      const messageId = messageInfo?.id;
      const messageStatus = messageInfo?.message_status;
      const contacts = responseData.contacts?.[0];
      const contactWaId = contacts?.wa_id;
      const contactInput = contacts?.input;

      // Log successful response details
      console.log(`[WhatsApp] ✅ Template message accepted by API`);
      console.log(`[WhatsApp] 📊 Message Details:`, {
        messageId,
        messageStatus: messageStatus || 'accepted',
        recipientWaId: contactWaId || phoneNumber,
        recipientInput: contactInput || phoneNumber,
        templateName,
        responseTime: `${requestDuration}ms`,
      });

      // Check for warnings in the response
      if (responseData.messages?.[0]?.warnings) {
        console.warn(`[WhatsApp] ⚠️ API Warnings:`, responseData.messages[0].warnings);
        responseData.messages[0].warnings.forEach((warning, index) => {
          console.warn(`[WhatsApp] ⚠️ Warning ${index + 1}:`, {
            code: warning.code,
            title: warning.title,
            message: warning.message,
            details: warning.details,
          });
        });
      }

      // Check for contact information
      if (contacts) {
        console.log(`[WhatsApp] 👤 Contact Info:`, {
          waId: contacts.wa_id,
          input: contacts.input,
          profileName: contacts.profile?.name || 'Not available',
        });
      }

      return {
        success: true,
        messageId,
        messageStatus: messageStatus || 'accepted',
        recipientWaId: contactWaId,
        response: responseData,
        diagnostics: {
          requestDuration: `${requestDuration}ms`,
          hasWarnings: !!(responseData.messages?.[0]?.warnings?.length),
          warnings: responseData.messages?.[0]?.warnings || [],
        },
      };
    } catch (error) {
      lastError = error;

      // Log detailed error information
      console.error(`[WhatsApp] ⚠️ Error caught (attempt ${attempt + 1}/${maxRetries + 1}):`, {
        name: error.name,
        message: error.message,
        code: error.code,
        cause: error.cause ? {
          code: error.cause.code,
          message: error.cause.message,
        } : null,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });

      // Check if this is a retryable error
      const isRetryable =
        error.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
        error.name === 'ConnectTimeoutError';

      // Don't retry on validation errors or non-network errors
      if (!isRetryable || attempt >= maxRetries) {
        break;
      }

      // Exponential backoff before retrying
      const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
      console.log(`[WhatsApp] ⏳ Connection timeout. Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All attempts failed
  console.error('[WhatsApp] ❌ Error sending WhatsApp template message after all retries');
  console.error('[WhatsApp] 📋 Final Error Summary:', {
    errorName: lastError?.name,
    errorMessage: lastError?.message,
    errorCode: lastError?.code,
    causeCode: lastError?.cause?.code,
    attempts: maxRetries + 1,
    timestamp: new Date().toISOString(),
  });

  return {
    success: false,
    error: lastError?.message || 'Unknown error occurred while sending WhatsApp template message',
    details: {
      error: lastError,
      cause: lastError?.cause,
      attempts: maxRetries + 1,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Format calendar event notification message
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
    // Truncate description if too long
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

