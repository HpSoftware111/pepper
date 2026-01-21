/**
 * CPNU Web Scraping Service
 * Scrapes data from consultaprocesos.ramajudicial.gov.co
 * 
 * This service uses Puppeteer to interact with the Vue.js SPA
 * and extract case information from CPNU.
 */

// Lazy load Puppeteer to prevent crashes if not installed
let puppeteerInstance = null;
let puppeteerLoaded = false;

async function loadPuppeteer() {
  if (puppeteerLoaded && puppeteerInstance) {
    return puppeteerInstance;
  }

  try {
    // Ensure dynamic imports are properly awaited and errors are caught
    const puppeteerExtra = await import('puppeteer-extra').catch(err => {
      console.error('[CPNU] Failed to import puppeteer-extra:', err);
      throw new Error('Puppeteer-extra module not found. Please install: npm install puppeteer-extra');
    });

    const StealthPlugin = await import('puppeteer-extra-plugin-stealth').catch(err => {
      console.error('[CPNU] Failed to import puppeteer-extra-plugin-stealth:', err);
      throw new Error('Puppeteer stealth plugin not found. Please install: npm install puppeteer-extra-plugin-stealth');
    });

    if (!puppeteerExtra || !puppeteerExtra.default) {
      throw new Error('puppeteer-extra module is invalid or corrupted');
    }

    if (!StealthPlugin || !StealthPlugin.default) {
      throw new Error('puppeteer-extra-plugin-stealth module is invalid or corrupted');
    }

    puppeteerInstance = puppeteerExtra.default;
    puppeteerInstance.use(StealthPlugin.default());
    puppeteerLoaded = true;

    console.log('[CPNU] Puppeteer loaded successfully');
    return puppeteerInstance;
  } catch (error) {
    // Reset state on error so it can retry
    puppeteerLoaded = false;
    puppeteerInstance = null;

    console.error('[CPNU] Failed to load Puppeteer:', error);
    console.error('[CPNU] Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    });

    // Provide helpful error message
    if (error.message && error.message.includes('Cannot find module')) {
      throw new Error('Puppeteer dependencies not installed. Please run: npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth');
    }

    throw error;
  }
}

const CPNU_BASE_URL = 'https://consultaprocesos.ramajudicial.gov.co/Procesos/NumeroRadicacion';

/**
 * Find elements using XPath (replacement for page.$x)
 * @param {Page} page - Puppeteer page object
 * @param {string} xpath - XPath expression
 * @returns {Promise<ElementHandle[]>} Array of element handles
 */
async function findElementsByXPath(page, xpath) {
  // First, get the count of elements
  const count = await page.evaluate((xpathExpr) => {
    const result = document.evaluate(
      xpathExpr,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    return result.snapshotLength;
  }, xpath);

  if (count === 0) {
    return [];
  }

  // Get each element one by one using evaluateHandle
  const elementHandles = [];
  for (let i = 0; i < count; i++) {
    try {
      const handle = await page.evaluateHandle((xpathExpr, idx) => {
        const result = document.evaluate(
          xpathExpr,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        const node = result.snapshotItem(idx);
        return node;
      }, xpath, i);

      const element = handle.asElement();
      if (element) {
        elementHandles.push(element);
      } else {
        // If not an element, dispose the handle
        await handle.dispose();
      }
    } catch (error) {
      console.warn(`[CPNU] Could not get element at index ${i}:`, error.message);
    }
  }

  return elementHandles;
}

/**
 * Wait for an element using XPath (replacement for deprecated waitForXPath)
 * @param {Page} page - Puppeteer page object
 * @param {string} xpath - XPath expression
 * @param {Object} options - Options with timeout
 * @returns {Promise<ElementHandle[]>} Array of element handles
 */
async function waitForXPath(page, xpath, options = {}) {
  const timeout = options.timeout || 10000;
  const startTime = Date.now();

  // Helper function to delay execution
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  while (Date.now() - startTime < timeout) {
    try {
      const elements = await findElementsByXPath(page, xpath);
      if (elements.length > 0) {
        return elements;
      }
    } catch (error) {
      // If evaluation fails, continue retrying
      console.warn(`[CPNU] XPath evaluation warning: ${error.message}`);
    }

    await delay(100); // Wait 100ms before retrying
  }

  throw new Error(`Element with XPath "${xpath}" not found within ${timeout}ms`);
}

/**
 * Internal scraping function (wrapped with timeout)
 * @param {string} radicado - 23-digit numeric radicado
 * @returns {Promise<Object>} Complete CPNU data
 */
async function scrapeCPNUInternal(radicado) {
  // Validate radicado
  if (!/^\d{23}$/.test(radicado)) {
    throw new Error('Radicado must be exactly 23 digits');
  }

  let browser = null;
  let page = null;
  try {
    // Load Puppeteer with proper error handling
    const puppeteerInstance = await loadPuppeteer().catch(err => {
      console.error('[CPNU] Failed to load Puppeteer in scrapeCPNUInternal:', err);
      throw new Error(`Failed to initialize Puppeteer: ${err.message}`);
    });

    // Launch browser with additional error handling
    try {
      browser = await puppeteerInstance.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
        // Prevent automatic Chromium download on first launch
        // If Chromium is missing, it will fail fast instead of hanging
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });
    } catch (launchError) {
      console.error('[CPNU] Failed to launch browser:', launchError);
      // Check if it's a Chromium download issue
      if (launchError.message && (
        launchError.message.includes('Could not find Chromium') ||
        launchError.message.includes('Browser not found') ||
        launchError.message.includes('executablePath') ||
        launchError.message.includes('No usable sandbox')
      )) {
        throw new Error('Chromium not found. Please install Chromium or set PUPPETEER_EXECUTABLE_PATH environment variable. Install with: npm install puppeteer');
      }
      throw launchError;
    }

    page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to CPNU search page
    console.log(`[CPNU] Navigating to ${CPNU_BASE_URL}...`);
    await page.goto(CPNU_BASE_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait a bit longer for Vue.js to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 1: Enter radicado in input field
    console.log(`[CPNU] Entering radicado: ${radicado}`);

    // Try multiple input selectors
    const inputSelectors = [
      'input[id^="input-"]',
      'input[type="text"]',
      'input[placeholder*="23"]',
      'input[placeholder*="Radicación"]',
      'input[maxlength="23"]',
    ];

    let inputSelector = null;
    let inputElement = null;

    // Find the correct input field
    for (const selector of inputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        const input = await page.$(selector);
        if (input) {
          const placeholder = await page.evaluate(el => el.placeholder, input);
          const maxlength = await page.evaluate(el => el.maxLength, input);
          console.log(`[CPNU] Found input with selector: ${selector}, placeholder: ${placeholder}, maxlength: ${maxlength}`);

          // Verify it's the right input (has maxlength 23 or placeholder mentions radicación)
          if (maxlength === 23 || (placeholder && placeholder.toLowerCase().includes('radicación'))) {
            inputSelector = selector;
            inputElement = input;
            break;
          }
        }
      } catch (error) {
        console.log(`[CPNU] Selector ${selector} not found, trying next...`);
      }
    }

    if (!inputSelector || !inputElement) {
      // Debug: List all inputs on the page
      const allInputs = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(input => ({
          id: input.id,
          type: input.type,
          placeholder: input.placeholder,
          maxlength: input.maxLength,
          value: input.value,
          className: input.className,
        }));
      });
      console.log(`[CPNU] All inputs on page:`, JSON.stringify(allInputs, null, 2));
      throw new Error('Input field not found with any selector');
    }

    console.log(`[CPNU] Using input selector: ${inputSelector}`);

    // Method 1: Clear and set value using Vue.js compatible approach
    await page.evaluate((selector, value) => {
      const input = document.querySelector(selector);
      if (input) {
        // Focus first
        input.focus();

        // Clear any existing value
        input.value = '';

        // Set the value character by character to trigger Vue.js reactivity properly
        // This mimics actual typing which Vue.js handles better
        for (let i = 0; i < value.length; i++) {
          input.value += value[i];
          // Trigger input event for each character (Vue.js listens to this)
          const inputEvent = new Event('input', { bubbles: true, cancelable: true });
          Object.defineProperty(inputEvent, 'target', { value: input, enumerable: true });
          input.dispatchEvent(inputEvent);
        }

        // Also trigger change and blur events
        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
      }
    }, inputSelector, radicado);

    // Wait a bit for Vue.js to process
    await new Promise(resolve => setTimeout(resolve, 500));

    // Method 2: Also try Puppeteer's type method as fallback
    try {
      await inputElement.click({ clickCount: 3 }); // Select all
      await page.keyboard.press('Backspace'); // Clear
      await page.type(inputSelector, radicado, { delay: 30 });
    } catch (error) {
      console.log(`[CPNU] Puppeteer type method failed: ${error.message}`);
    }

    // Wait longer for Vue.js to process the input and enable the button
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify input value was set correctly
    const inputValue = await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      if (!input) return null;

      // Check both value and any Vue.js bound value
      return {
        value: input.value,
        defaultValue: input.defaultValue,
        // Check if Vue.js has bound the value differently
        vueValue: input._value || input.__vue__?.value || null,
      };
    }, inputSelector);

    console.log(`[CPNU] Input value after setting:`, JSON.stringify(inputValue, null, 2));

    // Check if value was set (try multiple ways)
    const actualValue = inputValue?.value || inputValue?.vueValue || inputValue?.defaultValue || '';

    if (actualValue !== radicado) {
      // Try one more time with a different approach
      console.log(`[CPNU] Value mismatch, trying alternative method...`);

      await page.evaluate((selector, value) => {
        const input = document.querySelector(selector);
        if (input) {
          // Remove the oninput handler temporarily if possible
          const originalOnInput = input.oninput;
          input.oninput = null;

          // Set value directly
          input.value = value;

          // Manually trigger the input event that Vue.js needs
          const event = new Event('input', { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'target', {
            value: input,
            enumerable: true,
            configurable: true
          });
          Object.defineProperty(event, 'currentTarget', {
            value: input,
            enumerable: true,
            configurable: true
          });

          // Dispatch with the value property
          input.dispatchEvent(event);

          // Also trigger change
          input.dispatchEvent(new Event('change', { bubbles: true }));

          // Restore oninput if it existed
          if (originalOnInput) {
            input.oninput = originalOnInput;
          }
        }
      }, inputSelector, radicado);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check again
      const retryValue = await page.evaluate((selector) => {
        const input = document.querySelector(selector);
        return input ? input.value : null;
      }, inputSelector);

      console.log(`[CPNU] Input value after retry: ${retryValue}`);

      if (retryValue !== radicado) {
        // Get more debug info
        const debugInfo = await page.evaluate((selector) => {
          const input = document.querySelector(selector);
          if (!input) return { error: 'Input not found' };

          return {
            id: input.id,
            value: input.value,
            defaultValue: input.defaultValue,
            maxLength: input.maxLength,
            placeholder: input.placeholder,
            hasOnInput: !!input.oninput,
            hasOnChange: !!input.onchange,
            className: input.className,
            attributes: Array.from(input.attributes).map(attr => ({
              name: attr.name,
              value: attr.value,
            })),
          };
        }, inputSelector);

        console.log(`[CPNU] Input debug info:`, JSON.stringify(debugInfo, null, 2));
        throw new Error(`Failed to set radicado in input field. Expected: ${radicado}, Got: ${retryValue || actualValue || 'empty'}. Debug: ${JSON.stringify(debugInfo)}`);
      }
    }

    // STEP 2: Select "Todos los procesos" radio button (required before clicking Consultar)
    console.log(`[CPNU] Selecting "Todos los procesos" radio button...`);

    // Find all radio buttons and identify which one needs to be selected
    const radioInfo = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const radioData = radios.map((radio, index) => {
        // Get the label or parent text to identify what this radio represents
        let labelText = '';
        let ariaLabel = '';

        // Check for label element
        const label = radio.closest('label');
        if (label) {
          labelText = label.textContent?.trim() || '';
        }

        // Check parent element
        if (!labelText && radio.parentElement) {
          labelText = radio.parentElement.textContent?.trim() || '';
        }

        // Check for aria-label
        ariaLabel = radio.getAttribute('aria-label') || '';

        // Check for nearby text elements
        let nearbyText = '';
        const parent = radio.parentElement;
        if (parent) {
          const walker = document.createTreeWalker(
            parent,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          let node;
          while (node = walker.nextNode()) {
            nearbyText += node.textContent + ' ';
          }
          nearbyText = nearbyText.trim();
        }

        const allText = (labelText + ' ' + ariaLabel + ' ' + nearbyText).toLowerCase();

        return {
          index,
          id: radio.id,
          name: radio.name,
          value: radio.value,
          checked: radio.checked,
          ariaChecked: radio.getAttribute('aria-checked'),
          role: radio.getAttribute('role'),
          labelText: labelText.substring(0, 100),
          ariaLabel: ariaLabel.substring(0, 100),
          nearbyText: nearbyText.substring(0, 100),
          allText: allText.substring(0, 200),
          isTodosProcesos: allText.includes('todos los procesos') ||
            (allText.includes('todos') && allText.includes('proceso') && !allText.includes('recientes')),
          isActuacionesRecientes: allText.includes('actuaciones recientes') ||
            allText.includes('recientes'),
        };
      });
      return radioData;
    });

    console.log(`[CPNU] Radio buttons found:`, JSON.stringify(radioInfo, null, 2));

    // Strategy 1: Find "Todos los procesos" by text
    let todosProcesosRadio = null;
    for (const radio of radioInfo) {
      if (radio.isTodosProcesos) {
        todosProcesosRadio = radio;
        console.log(`[CPNU] Found "Todos los procesos" radio button by text:`, radio);
        break;
      }
    }

    // Strategy 2: If not found, find the unchecked radio button in the same group
    if (!todosProcesosRadio) {
      console.log(`[CPNU] "Todos los procesos" not found by text, finding unchecked radio...`);

      // Group radios by name
      const radioGroups = {};
      radioInfo.forEach(radio => {
        if (radio.name) {
          if (!radioGroups[radio.name]) {
            radioGroups[radio.name] = [];
          }
          radioGroups[radio.name].push(radio);
        }
      });

      // For each group, find the unchecked one
      for (const [groupName, radios] of Object.entries(radioGroups)) {
        const checkedRadio = radios.find(r => r.ariaChecked === 'true' || r.checked);
        const uncheckedRadio = radios.find(r => r.ariaChecked === 'false' || !r.checked);

        if (checkedRadio && uncheckedRadio) {
          // If the checked one is "Actuaciones Recientes", select the unchecked one
          if (checkedRadio.isActuacionesRecientes) {
            todosProcesosRadio = uncheckedRadio;
            console.log(`[CPNU] Found unchecked radio button (group: ${groupName}):`, uncheckedRadio);
            console.log(`[CPNU] Currently checked is "Actuaciones Recientes", will select unchecked one`);
            break;
          }
        }
      }
    }

    // Strategy 3: If still not found, find any unchecked radio that is NOT "Actuaciones Recientes"
    if (!todosProcesosRadio) {
      console.log(`[CPNU] Trying to find any unchecked radio that is NOT "Actuaciones Recientes"...`);
      for (const radio of radioInfo) {
        if (!radio.isActuacionesRecientes && (radio.ariaChecked === 'false' || !radio.checked)) {
          todosProcesosRadio = radio;
          console.log(`[CPNU] Found unchecked radio button (not "Actuaciones Recientes"):`, radio);
          break;
        }
      }
    }

    // Strategy 4: Last resort - find any unchecked radio button
    if (!todosProcesosRadio) {
      console.log(`[CPNU] Last resort: finding any unchecked radio button...`);
      for (const radio of radioInfo) {
        if (radio.ariaChecked === 'false' || !radio.checked) {
          todosProcesosRadio = radio;
          console.log(`[CPNU] Found any unchecked radio button:`, radio);
          break;
        }
      }
    }

    // Select the "Todos los procesos" radio button
    if (todosProcesosRadio) {
      const radioSelector = `input[type="radio"][id="${todosProcesosRadio.id}"]`;
      try {
        await page.waitForSelector(radioSelector, { timeout: 3000 });

        // Use JavaScript to click and ensure Vue.js reactivity
        const clicked = await page.evaluate((selector) => {
          const radio = document.querySelector(selector);
          if (!radio) return false;

          // Uncheck all radios in the same group first
          const name = radio.name;
          if (name) {
            const groupRadios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
            groupRadios.forEach(r => {
              r.checked = false;
              r.setAttribute('aria-checked', 'false');
            });
          }

          // Check this radio
          radio.checked = true;
          radio.setAttribute('aria-checked', 'true');

          // Trigger events for Vue.js
          radio.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          radio.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          radio.click();

          return true;
        }, radioSelector);

        if (clicked) {
          console.log(`[CPNU] ✅ Clicked "Todos los procesos" radio button (id: ${todosProcesosRadio.id})`);
          // Wait for Vue.js to process
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Verify it was selected
          const verification = await page.evaluate((selector) => {
            const radio = document.querySelector(selector);
            if (!radio) return { found: false };
            return {
              found: true,
              checked: radio.checked,
              ariaChecked: radio.getAttribute('aria-checked'),
              name: radio.name,
            };
          }, radioSelector);
          console.log(`[CPNU] Radio button verification:`, verification);
        } else {
          console.log(`[CPNU] ⚠️ Failed to click radio button via JavaScript`);
        }
      } catch (error) {
        console.log(`[CPNU] Error selecting radio button: ${error.message}`);
      }
    } else {
      console.log(`[CPNU] ⚠️ "Todos los procesos" radio button not found, but continuing anyway...`);
    }

    // STEP 3: Click "Consultar" button
    console.log(`[CPNU] Looking for Consultar button...`);

    // Find button containing "Consultar" text using XPath
    // Try multiple XPath patterns to find the button
    const consultarButtonXPaths = [
      "//span[contains(@class, 'v-btn__content') and text()='Consultar']",
      "//button[contains(., 'Consultar')]",
      "//span[text()='Consultar']",
      "//button//span[text()='Consultar']",
    ];

    let button = null;
    let workingXPath = null;
    for (const xpath of consultarButtonXPaths) {
      try {
        const buttons = await waitForXPath(page, xpath, { timeout: 3000 });
        if (buttons && buttons.length > 0) {
          button = buttons[0];
          workingXPath = xpath;
          console.log(`[CPNU] Found Consultar button with XPath: ${xpath}`);
          break;
        }
      } catch (error) {
        console.log(`[CPNU] XPath ${xpath} did not find button, trying next...`);
      }
    }

    if (!button) {
      // Debug: Check what buttons are available
      const availableButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        return buttons.map(btn => ({
          text: btn.textContent?.trim(),
          class: btn.className,
          disabled: btn.disabled || btn.hasAttribute('disabled'),
          visible: btn.offsetParent !== null,
        })).slice(0, 10);
      });
      console.log(`[CPNU] Available buttons on page:`, availableButtons);
      throw new Error('Consultar button not found with any XPath pattern');
    }

    // Check if button is enabled
    const buttonInfo = await page.evaluate((xpath) => {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      const node = result.singleNodeValue;
      if (node) {
        const button = node.tagName === 'BUTTON' ? node : node.closest('button');
        return {
          disabled: button ? (button.disabled || button.hasAttribute('disabled')) : true,
          visible: node.offsetParent !== null,
          tagName: node.tagName,
        };
      }
      return null;
    }, workingXPath);

    console.log(`[CPNU] Button info:`, buttonInfo);

    if (buttonInfo && buttonInfo.disabled) {
      throw new Error('Consultar button is disabled. The input may not be valid or the form may not be ready.');
    }

    console.log(`[CPNU] Clicking Consultar button...`);

    // Try multiple click methods
    let clickSuccess = false;
    const buttonXPath = workingXPath || consultarButtonXPaths[0];

    // Method 1: Direct ElementHandle click
    try {
      await button.click();
      clickSuccess = true;
      console.log(`[CPNU] Direct click succeeded`);
    } catch (error) {
      console.log(`[CPNU] Direct click failed: ${error.message}`);
    }

    // Method 2: JavaScript click via XPath
    if (!clickSuccess) {
      try {
        const clicked = await page.evaluate((xpath) => {
          const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          const node = result.singleNodeValue;
          if (node) {
            // Try clicking the button element (not the span)
            let targetElement = node;
            if (node.tagName === 'SPAN') {
              targetElement = node.closest('button') || node.parentElement;
            }

            if (targetElement) {
              // Scroll into view first
              targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

              // Wait a bit for scroll
              return new Promise((resolve) => {
                setTimeout(() => {
                  // Try multiple click methods
                  if (targetElement.click) {
                    targetElement.click();
                  } else if (targetElement.dispatchEvent) {
                    targetElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    targetElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    targetElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                  }
                  resolve(true);
                }, 100);
              });
            }
            return false;
          }
          return false;
        }, buttonXPath);

        if (clicked) {
          clickSuccess = true;
          console.log(`[CPNU] JavaScript click succeeded`);
        }
      } catch (error) {
        console.log(`[CPNU] JavaScript click failed: ${error.message}`);
      }
    }

    if (!clickSuccess) {
      throw new Error('Failed to click Consultar button with any method');
    }

    console.log(`[CPNU] Consultar button clicked, waiting for response...`);

    // Wait longer for Vue.js to update the DOM
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Wait for either network response OR DOM changes
    let responseReceived = false;
    const responsePromise = page.waitForResponse(
      (response) => {
        const url = response.url();
        return (url.includes('ramajudicial') || url.includes('api') || url.includes('consultar')) &&
          response.status() === 200;
      },
      { timeout: 15000 }
    ).then(() => {
      responseReceived = true;
      console.log(`[CPNU] Network response received`);
    }).catch(() => {
      console.log(`[CPNU] No network response, waiting for DOM changes...`);
    });

    // Also wait for DOM mutations with more comprehensive checks
    const domPromise = page.waitForFunction(
      () => {
        // Check if results table or any content appeared
        const hasTable = document.querySelector('table tbody tr') !== null ||
          document.querySelector('.v-data-table') !== null ||
          document.querySelector('[role="table"]') !== null;

        const hasRadicadoText = document.body.textContent &&
          document.body.textContent.includes('Número de Radicación');

        // Check if URL changed (might navigate to results)
        const urlChanged = !window.location.href.includes('NumeroRadicacion') ||
          window.location.hash !== '';

        return hasTable || hasRadicadoText || urlChanged;
      },
      { timeout: 20000 }
    ).then(() => {
      console.log(`[CPNU] DOM changes detected`);
    }).catch(() => {
      console.log(`[CPNU] DOM wait timed out`);
    });

    // Wait for either response or DOM change
    await Promise.race([responsePromise, domPromise]);
    await new Promise(resolve => setTimeout(resolve, 3000)); // Extra buffer for Vue.js rendering

    // Check for error messages on the page
    const pageErrors = await page.evaluate(() => {
      const errorSelectors = [
        '.error',
        '.v-messages__message',
        '[role="alert"]',
        '.v-alert',
      ];

      const errors = [];
      errorSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 0) {
            errors.push(text);
          }
        });
      });

      return errors;
    });

    if (pageErrors.length > 0) {
      console.log(`[CPNU] Page errors detected:`, pageErrors);

      // Check if the error is about duplicate records
      const isDuplicateError = pageErrors.some(error => {
        const errorLower = error.toLowerCase();
        return (
          errorLower.includes('varios registros') ||
          errorLower.includes('mismo número') ||
          errorLower.includes('duplicado') ||
          errorLower.includes('duplicate') ||
          errorLower.includes('múltiples registros') ||
          errorLower.includes('multiple records') ||
          errorLower.includes('mismo número de radicación')
        );
      });

      if (isDuplicateError) {
        // Get the original error message from the website
        const duplicateMessage = pageErrors.find(error => {
          const errorLower = error.toLowerCase();
          return (
            errorLower.includes('varios registros') ||
            errorLower.includes('mismo número') ||
            errorLower.includes('duplicado') ||
            errorLower.includes('duplicate') ||
            errorLower.includes('múltiples registros') ||
            errorLower.includes('multiple records') ||
            errorLower.includes('mismo número de radicación')
          );
        }) || pageErrors[0]; // Fallback to first error if not found

        console.log(`[CPNU] ⚠️ Duplicate record detected: ${duplicateMessage}`);

        // Create error with original message (will be appended with suffix in frontend via i18n)
        const error = new Error(duplicateMessage);
        error.cpnuErrorCategory = 'validation';
        error.isDuplicateRecord = true;
        throw error;
      }

      // Check if the error is about "Procesos con Actuaciones Recientes" vs "Todos los procesos"
      const isActuacionesRecientesError = pageErrors.some(error =>
        error.toLowerCase().includes('actuaciones recientes') ||
        error.toLowerCase().includes('todos los procesos')
      );

      if (isActuacionesRecientesError) {
        console.log(`[CPNU] ⚠️ Error indicates wrong radio button selected. This may be old data or the radicado may not exist.`);
        throw new Error(`No results found. The search may require "Todos los procesos" option or the radicado may not exist. This may be old data.`);
      }

      throw new Error(`Page errors: ${pageErrors.join(', ')}`);
    }

    // Try multiple selectors for the results table (optimized - try all in parallel)
    console.log(`[CPNU] Looking for results table...`);

    // First, take a screenshot or get page state for debugging
    const pageState = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasTable: !!document.querySelector('table'),
        hasTbody: !!document.querySelector('tbody'),
        hasVDataTable: !!document.querySelector('.v-data-table'),
        tableCount: document.querySelectorAll('table').length,
        bodyText: document.body?.textContent?.substring(0, 1000),
        allTables: Array.from(document.querySelectorAll('table')).map(t => ({
          className: t.className,
          hasTbody: !!t.querySelector('tbody'),
          rowCount: t.querySelectorAll('tbody tr').length,
        })),
      };
    });

    console.log(`[CPNU] Page state after click:`, JSON.stringify(pageState, null, 2));

    let tableFound = false;
    const tableSelectors = [
      'table tbody tr',
      'table tbody',
      '.v-data-table tbody tr',
      '.v-data-table tbody',
      '[role="table"] tbody tr',
      'table.v-data-table tbody tr',
    ];

    // Try all selectors in parallel with longer timeout
    const selectorPromises = tableSelectors.map(async (selector) => {
      try {
        await page.waitForSelector(selector, { timeout: 8000 });
        const count = await page.evaluate((sel) => {
          return document.querySelectorAll(sel).length;
        }, selector);
        if (count > 0) {
          return { selector, count, found: true };
        }
      } catch (error) {
        // Selector not found, continue
      }
      return { selector, found: false };
    });

    const results = await Promise.all(selectorPromises);
    const foundResult = results.find(r => r.found);

    if (foundResult) {
      console.log(`[CPNU] Found results table with selector: ${foundResult.selector} (${foundResult.count} elements)`);
      tableFound = true;
    }

    // Check for "no results" message before checking for table
    const hasNoResults = await page.evaluate(() => {
      const bodyText = (document.body?.textContent || '').toLowerCase();
      return bodyText.includes('no se encontraron') ||
        bodyText.includes('no encontrado') ||
        bodyText.includes('sin resultados') ||
        bodyText.includes('no hay resultados') ||
        bodyText.includes('no existe');
    });

    if (hasNoResults) {
      throw new Error(`No se encontraron resultados para el radicado ${radicado}. Verifique que el radicado sea correcto.`);
    }

    if (!tableFound) {
      // Enhanced debug info
      const pageInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          hasTable: !!document.querySelector('table'),
          hasTbody: !!document.querySelector('tbody'),
          bodyText: document.body?.textContent?.substring(0, 1000),
          allInputs: Array.from(document.querySelectorAll('input')).map(i => ({
            value: i.value,
            id: i.id,
            placeholder: i.placeholder,
          })),
        };
      });
      console.log(`[CPNU] Page info after click:`, JSON.stringify(pageInfo, null, 2));

      throw new Error(`Results table not found after clicking Consultar. URL: ${pageInfo.url}. The page may not have loaded correctly, the radicado may not exist, or the selector may be wrong. Page state: ${JSON.stringify(pageState)}`);
    }

    // STEP 4: Click on the radicado number in results table
    console.log(`[CPNU] Clicking radicado number in results table...`);

    // First, find ALL buttons with this radicado (may be duplicates with different dates)
    const allRadicadoButtons = await page.evaluate((radicado) => {
      const buttons = Array.from(document.querySelectorAll('table button'));
      const matchingButtons = [];

      buttons.forEach((button, index) => {
        const span = button.querySelector('span.v-btn__content');
        const buttonText = span ? span.textContent?.trim() : button.textContent?.trim();

        if (buttonText === radicado || buttonText.includes(radicado)) {
          // Try to find the row this button is in to extract date
          const row = button.closest('tr');
          if (row) {
            const cells = Array.from(row.querySelectorAll('td'));
            // Date is typically in the first or second column (fecha_registro)
            let fechaRegistro = null;
            cells.forEach((cell) => {
              const cellText = cell.textContent?.trim();
              // Try to match date patterns (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, etc.)
              if (/^\d{4}-\d{2}-\d{2}$/.test(cellText) ||
                /^\d{2}\/\d{2}\/\d{4}$/.test(cellText) ||
                /^\d{2}-\d{2}-\d{4}$/.test(cellText)) {
                fechaRegistro = cellText;
              }
            });

            matchingButtons.push({
              index,
              fechaRegistro,
              rowIndex: Array.from(row.parentElement?.children || []).indexOf(row),
            });
          } else {
            matchingButtons.push({
              index,
              fechaRegistro: null,
              rowIndex: -1,
            });
          }
        }
      });

      return matchingButtons;
    }, radicado);

    let radicadoButton = null;

    // If multiple buttons found, sort by date (latest first) and use first row
    if (allRadicadoButtons.length > 1) {
      console.log(`[CPNU] ⚠️ Found ${allRadicadoButtons.length} duplicate records for radicado ${radicado}`);

      // Sort by fecha_registro (latest first), then by rowIndex (first row first)
      allRadicadoButtons.sort((a, b) => {
        if (a.fechaRegistro && b.fechaRegistro) {
          // Normalize dates for comparison
          const normalizeDate = (dateStr) => {
            if (!dateStr) return null;
            // Handle different formats
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              return new Date(dateStr);
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
              const [day, month, year] = dateStr.split('/').map(Number);
              return new Date(year, month - 1, day);
            } else if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
              const [day, month, year] = dateStr.split('-').map(Number);
              return new Date(year, month - 1, day);
            }
            return new Date(dateStr);
          };

          const dateA = normalizeDate(a.fechaRegistro);
          const dateB = normalizeDate(b.fechaRegistro);

          if (dateA && dateB && !isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
            const dateDiff = dateB.getTime() - dateA.getTime(); // Descending (latest first)
            if (dateDiff !== 0) return dateDiff;
          }
        }
        // If dates are equal or missing, prefer first row (lower rowIndex)
        return a.rowIndex - b.rowIndex;
      });

      const latestButton = allRadicadoButtons[0];
      console.log(`[CPNU] Using latest record (row ${latestButton.rowIndex}, fecha: ${latestButton.fechaRegistro || 'N/A'})`);

      // When multiple case IDs are detected, throw error with specific message
      // This happens when there are more than one radicado button (hyperlinks) found
      const error = new Error('There are multiple case IDs; it can\'t be synchronized automatically. Please review it and do it manually.');
      error.cpnuErrorCategory = 'validation';
      // Note: isDuplicateRecord is not set to true because the message is already complete
      // and we don't want the frontend to append the duplicateRecordSuffix
      throw error;

      // Get the actual button element using the index
      const buttons = await page.$$('table button');
      if (buttons[latestButton.index]) {
        radicadoButton = buttons[latestButton.index];
      }
    } else if (allRadicadoButtons.length === 1) {
      // Single button found, use it
      const buttons = await page.$$('table button');
      if (buttons[allRadicadoButtons[0].index]) {
        radicadoButton = buttons[allRadicadoButtons[0].index];
      }
    }

    // Fallback: If no button found via duplicate detection, try XPath patterns
    if (!radicadoButton) {
      console.log(`[CPNU] No button found via duplicate detection, trying XPath patterns...`);

      // Try multiple XPath patterns to find the button
      const radicadoButtonXPaths = [
        `//button//span[contains(@class, 'v-btn__content') and text()='${radicado}']`,
        `//button//span[contains(@class, 'v-btn__content') and contains(text(), '${radicado}')]`,
        `//button[contains(., '${radicado}')]`,
        `//span[contains(@class, 'v-btn__content') and text()='${radicado}']`,
      ];

      for (const xpath of radicadoButtonXPaths) {
        try {
          const buttons = await waitForXPath(page, xpath, { timeout: 5000 });
          if (buttons && buttons.length > 0) {
            radicadoButton = buttons[0];
            console.log(`[CPNU] Found radicado button with XPath: ${xpath}`);
            break;
          }
        } catch (error) {
          // Continue to next XPath pattern
          console.log(`[CPNU] XPath ${xpath} did not find button, trying next...`);
        }
      }
    }

    // If button still not found, check if it's because there are no results or the radicado doesn't exist
    if (!radicadoButton) {
      // Check for "no results" messages
      const hasNoResults = await page.evaluate(() => {
        const bodyText = (document.body?.textContent || '').toLowerCase();
        return bodyText.includes('no se encontraron') ||
          bodyText.includes('no encontrado') ||
          bodyText.includes('sin resultados') ||
          bodyText.includes('no hay resultados') ||
          bodyText.includes('no existe');
      });

      if (hasNoResults) {
        console.log(`[CPNU] ⚠️ No results found for radicado ${radicado}. This may be old data. Skipping...`);
        const error = new Error(`No results found for radicado ${radicado}. The case may not exist or may be old data.`);
        error.cpnuErrorCategory = 'not_found';
        throw error;
      }

      // Check if there are any buttons in the table at all
      const tableInfo = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table tbody'));
        const allButtons = Array.from(document.querySelectorAll('table button'));
        return {
          tableCount: tables.length,
          buttonCount: allButtons.length,
          buttonTexts: allButtons.slice(0, 10).map(b => {
            const span = b.querySelector('span.v-btn__content');
            return span ? span.textContent?.trim() : b.textContent?.trim();
          }),
        };
      });

      console.log(`[CPNU] ⚠️ Radicado ${radicado} not found in results table. Table info:`, JSON.stringify(tableInfo, null, 2));
      console.log(`[CPNU] ⚠️ This may be old data or the radicado may not exist. Skipping...`);
      const error = new Error(`Radicado ${radicado} not found in results table. This may be old data or the case may not exist.`);
      error.cpnuErrorCategory = 'not_found';
      throw error;
    }

    await radicadoButton.click();

    // Wait for case detail page to load
    await page.waitForSelector('th.text-left.subtitle-1.font-weight-bold', { timeout: 15000 });

    // STEP 5: Extract "Datos del proceso" (one-time, frozen data)
    console.log(`[CPNU] Extracting Datos del proceso...`);
    const datosProceso = await extractDatosProceso(page);

    // STEP 6: Click "Sujetos Procesales" tab
    console.log(`[CPNU] Clicking Sujetos Procesales tab...`);
    const sujetosTabXPath = "//div[contains(@class, 'v-tab') and contains(text(), 'Sujetos Procesales')]";
    const [sujetosTab] = await waitForXPath(page, sujetosTabXPath, { timeout: 10000 });

    if (!sujetosTab) {
      throw new Error('Sujetos Procesales tab not found');
    }

    await sujetosTab.click();

    // Wait for table to load - wait a bit for Vue.js to render
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.waitForSelector('table tbody tr td.text-left', { timeout: 10000 });

    // STEP 7: Extract "Sujetos Procesales" (one-time, frozen data)
    console.log(`[CPNU] Extracting Sujetos Procesales...`);
    const sujetosProcesales = await extractSujetosProcesales(page);

    // Log extracted data for debugging
    console.log(`[CPNU] Extracted sujetos procesales:`, JSON.stringify(sujetosProcesales, null, 2));

    // STEP 8: Click "Actuaciones" tab
    console.log(`[CPNU] Clicking Actuaciones tab...`);
    const actuacionesTabXPath = "//div[contains(@class, 'v-tab') and contains(text(), 'Actuaciones')]";
    const actuacionesTabs = await findElementsByXPath(page, actuacionesTabXPath);
    const actuacionesTab = actuacionesTabs[0];

    if (actuacionesTab) {
      await actuacionesTab.click();

      // Wait for table structure to appear
      await page.waitForSelector('table tbody', { timeout: 10000 });

      // Wait additional time for Vue.js to load data (similar to Sujetos Procesales)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // CRITICAL: Wait until loading text disappears and actual data appears
      console.log('[CPNU] Waiting for Actuaciones table to fully load with actual data...');
      try {
        await page.waitForFunction(() => {
          const tables = Array.from(document.querySelectorAll('table'));

          for (const table of tables) {
            const headerCells = Array.from(table.querySelectorAll('thead th, thead tr th, .v-data-table-header th'));
            const headerTexts = headerCells.map(th => (th.textContent || '').trim().toLowerCase());

            // Find table with "Fecha de Registro" header (Actuaciones table)
            if (headerTexts.some(text => text.includes('fecha de registro'))) {
              const rows = Array.from(table.querySelectorAll('tbody tr'));
              if (rows.length === 0) return false;

              // Find fecha_registro column index
              const idxFechaRegistro = headerTexts.findIndex(text => text.includes('fecha de registro'));
              if (idxFechaRegistro < 0) return false;

              // Check if at least one row has valid fecha_registro (not loading text)
              for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length <= idxFechaRegistro) continue;

                const fechaRegistroText = (cells[idxFechaRegistro].textContent || '').trim();
                const lowerText = fechaRegistroText.toLowerCase();

                // Skip loading text
                if (lowerText.includes('cargando') ||
                  lowerText.includes('por favor espere') ||
                  lowerText.includes('loading') ||
                  lowerText.includes('espere')) {
                  continue; // This row is still loading
                }

                // Check if it looks like a date (contains digits and date separators)
                if (fechaRegistroText &&
                  (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(fechaRegistroText) ||
                    /\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(fechaRegistroText))) {
                  return true; // Found valid fecha_registro!
                }
              }

              // If we get here, no valid fecha_registro found yet (still loading)
              return false;
            }
          }

          return false; // Table not found or still loading
        }, {
          timeout: 30000, // Wait up to 30 seconds
          polling: 500    // Check every 500ms
        });

        console.log('[CPNU] ✅ Actuaciones table fully loaded with actual data');
      } catch (waitError) {
        console.warn('[CPNU] ⚠️ Timeout waiting for Actuaciones table to fully load. Proceeding anyway...');
        // Continue execution - the extract function will filter out loading text
      }
    } else {
      console.log('[CPNU] Actuaciones tab not found, skipping...');
    }

    // STEP 9: Extract "Actuaciones" (for automatic sync)
    console.log(`[CPNU] Extracting Actuaciones...`);
    const actuaciones = await extractActuaciones(page);

    // Combine all data
    const result = {
      radicado,
      datosProceso,
      sujetosProcesales,
      actuaciones,
      scrapedAt: new Date().toISOString(),
    };

    console.log(`[CPNU] ✅ Successfully scraped data for radicado ${radicado}`);
    return result;

  } catch (error) {
    console.error(`[CPNU] ❌ Error scraping radicado ${radicado}:`, error);
    throw error;
  } finally {
    // Ensure browser is always closed, even on errors
    if (browser) {
      try {
        // Close all pages first
        const pages = await browser.pages();
        await Promise.all(pages.map(p => p.close().catch(() => {
          // Ignore errors when closing individual pages
        })));

        // Close browser
        await browser.close();
        console.log(`[CPNU] Browser closed successfully`);
      } catch (closeError) {
        console.error(`[CPNU] Error closing browser:`, closeError);
        // Force kill if normal close fails
        try {
          const process = browser.process();
          if (process) {
            process.kill('SIGKILL');
          }
        } catch (killError) {
          console.error(`[CPNU] Error killing browser process:`, killError);
        }
      }
    }
  }
}

/**
 * Main function to scrape CPNU data by radicado (with overall timeout)
 * @param {string} radicado - 23-digit numeric radicado
 * @param {number} timeoutMs - Overall timeout in milliseconds (default: 90000 = 90 seconds)
 * @returns {Promise<Object>} Complete CPNU data
 */
/**
 * Categorize CPNU error for user-friendly messaging
 * @param {Error} error - The error object
 * @returns {string} Error category: 'timeout', 'connection', 'not_found', 'validation', or 'other'
 */
function categorizeCPNUError(error) {
  if (!error || !error.message) {
    return 'other';
  }

  const message = error.message.toLowerCase();

  // Timeout errors
  if (message.includes('timed out') || message.includes('timeout')) {
    return 'timeout';
  }

  // Connection/Network errors
  if (
    message.includes('puppeteer') ||
    message.includes('chromium') ||
    message.includes('browser') ||
    message.includes('connection') ||
    message.includes('network') ||
    message.includes('failed to initialize') ||
    message.includes('could not find chromium') ||
    message.includes('fetch failed') ||
    message.includes('econnrefused') ||
    message.includes('enotfound')
  ) {
    return 'connection';
  }

  // Not found errors
  if (
    message.includes('not found') ||
    message.includes('no results found') ||
    message.includes('may not exist') ||
    message.includes('old data')
  ) {
    return 'not_found';
  }

  // Validation errors
  if (
    message.includes('radicado must be') ||
    message.includes('invalid') ||
    message.includes('validation') ||
    message.includes('varios registros') ||
    message.includes('mismo número') ||
    message.includes('duplicado') ||
    message.includes('duplicate') ||
    message.includes('múltiples registros') ||
    message.includes('multiple records') ||
    message.includes('mismo número de radicación') ||
    message.includes('must be registered manually')
  ) {
    return 'validation';
  }

  // Default to other
  return 'other';
}

/**
 * Attach error category to error object for route handling
 * @param {Error} error - The error object
 */
function enrichErrorWithCategory(error) {
  if (error && typeof error === 'object') {
    error.cpnuErrorCategory = categorizeCPNUError(error);
  }
  return error;
}

export async function scrapeCPNU(radicado, timeoutMs = 90000) {
  try {
    return await Promise.race([
      scrapeCPNUInternal(radicado).catch(err => {
        // Ensure errors are properly caught and re-thrown with context
        console.error('[CPNU] Error in scrapeCPNUInternal:', err);
        // Enrich error with category for better error handling
        enrichErrorWithCategory(err);
        // Don't wrap the error to preserve original error type and stack
        throw err;
      }),
      new Promise((_, reject) => {
        const timeoutError = new Error(`CPNU scraping timed out after ${timeoutMs / 1000} seconds. The operation took too long.`);
        enrichErrorWithCategory(timeoutError);
        setTimeout(() => reject(timeoutError), timeoutMs);
      })
    ]).catch(err => {
      // Ensure all errors from Promise.race are caught
      console.error('[CPNU] Error in scrapeCPNU Promise.race:', err);
      enrichErrorWithCategory(err);
      throw err;
    });
  } catch (error) {
    // Final catch to ensure all errors are properly handled
    console.error('[CPNU] Error in scrapeCPNU:', error);
    enrichErrorWithCategory(error);
    throw error;
  }
}

/**
 * Extract "Datos del proceso" from case detail page
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Object>} Datos del proceso data
 */
async function extractDatosProceso(page) {
  try {
    // Wait for the data table to be visible
    await page.waitForSelector('th.text-left.subtitle-1.font-weight-bold', { timeout: 10000 });

    // Extract data using XPath
    const data = {};

    // Extract "Despacho"
    const despachoXPath = "//th[contains(text(), 'Despacho:')]/following-sibling::td[1]";
    const despachoElements = await findElementsByXPath(page, despachoXPath);
    if (despachoElements.length > 0) {
      const despachoText = await page.evaluate(el => el.textContent.trim(), despachoElements[0]);
      data.despacho = despachoText;
    }

    // Extract "Clase de Proceso"
    const claseXPath = "//th[contains(text(), 'Clase de Proceso:')]/following-sibling::td[1]";
    const claseElements = await findElementsByXPath(page, claseXPath);
    if (claseElements.length > 0) {
      const claseText = await page.evaluate(el => el.textContent.trim(), claseElements[0]);
      data.claseProceso = claseText;
    }

    // Extract "Fecha de Radicación" (optional, for reference)
    const fechaRadicacionXPath = "//th[contains(text(), 'Fecha de Radicación:')]/following-sibling::td[1]";
    const fechaElements = await findElementsByXPath(page, fechaRadicacionXPath);
    if (fechaElements.length > 0) {
      const fechaText = await page.evaluate(el => el.textContent.trim(), fechaElements[0]);
      data.fechaRadicacion = fechaText;
    }

    // Extract "Tipo de Proceso" (optional)
    const tipoXPath = "//th[contains(text(), 'Tipo de Proceso:')]/following-sibling::td[1]";
    const tipoElements = await findElementsByXPath(page, tipoXPath);
    if (tipoElements.length > 0) {
      const tipoText = await page.evaluate(el => el.textContent.trim(), tipoElements[0]);
      data.tipoProceso = tipoText;
    }

    return data;
  } catch (error) {
    console.error('[CPNU] Error extracting Datos del proceso:', error);
    throw error;
  }
}

/**
 * Extract "Sujetos Procesales" from the table
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Object>} Sujetos procesales data
 */
async function extractSujetosProcesales(page) {
  try {
    // Wait for the table to be visible - be more specific to find the Sujetos Procesales table
    await page.waitForSelector('table tbody tr td.text-left', { timeout: 10000 });

    // Extract all rows from the Sujetos Procesales table
    const sujetos = await page.evaluate(() => {
      // Find the table that contains "Tipo" and "Nombre o Razón Social" headers
      // This should be the Sujetos Procesales table
      const tables = Array.from(document.querySelectorAll('table'));
      let targetTable = null;

      // Find the table with the correct headers
      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll('thead th, th'));
        const headerTexts = headers.map(h => h.textContent.trim().toLowerCase());

        if (headerTexts.some(text => text.includes('tipo')) &&
          headerTexts.some(text => text.includes('nombre') || text.includes('razón'))) {
          targetTable = table;
          break;
        }
      }

      // If no specific table found, use the first table with tbody rows
      if (!targetTable) {
        targetTable = document.querySelector('table tbody')?.closest('table') || tables[0];
      }

      // Helper function to normalize text (remove accents/tildes) for robust comparison
      // This makes the extraction robust against title changes and accent variations
      const normalizeText = (text) => {
        if (!text) return '';
        const accentMap = {
          'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
          'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
          'ñ': 'n', 'Ñ': 'N',
          'ü': 'u', 'Ü': 'U'
        };
        let normalized = text.toLowerCase();
        for (const [accented, unaccented] of Object.entries(accentMap)) {
          normalized = normalized.replace(new RegExp(accented, 'g'), unaccented);
        }
        return normalized;
      };

      if (!targetTable) {
        console.log('[CPNU] No table found for Sujetos Procesales');
        return {
          demandante: null,
          demandado: null,
          defensorPrivado: null,
          defensorPublico: null,
        };
      }

      const rows = Array.from(targetTable.querySelectorAll('tbody tr'));
      const data = {
        demandante: null,
        demandado: null,
        defensorPrivado: null,
        defensorPublico: null, // Add defensorPublico field to extract public defender
      };

      console.log(`[CPNU] Found ${rows.length} rows in Sujetos Procesales table`);

      rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const tipo = cells[0].textContent.trim();
          const nombre = cells[1].textContent.trim().replace(/\s+/g, ' '); // Normalize whitespace

          console.log(`[CPNU] Row ${index}: tipo="${tipo}", nombre="${nombre}"`);

          // Use accent normalization for robust matching against title variations
          const tipoNormalized = normalizeText(tipo);
          const tipoLower = tipo.toLowerCase();

          if (tipoNormalized.includes('demandante') || tipoNormalized.includes('accionante')) {
            data.demandante = nombre;
            console.log(`[CPNU] Set demandante: ${nombre}`);
          } else if (tipoNormalized.includes('demandado') || tipoNormalized.includes('indiciado') || tipoNormalized.includes('causante')) {
            data.demandado = nombre;
            console.log(`[CPNU] Set demandado: ${nombre}`);
          } else if (tipoNormalized.includes('defensor')) {
            // Extract both types of defenders with priority: privado > público
            if (tipoNormalized.includes('privado')) {
              data.defensorPrivado = nombre;
              console.log(`[CPNU] Set defensorPrivado: ${nombre}`);
            } else if (tipoNormalized.includes('publico') || tipoLower.includes('público')) {
              // Only set defensorPublico if defensorPrivado is not already set
              // (privado takes priority when both exist)
              if (!data.defensorPrivado) {
                data.defensorPublico = nombre;
                console.log(`[CPNU] Set defensorPublico: ${nombre}`);
              } else {
                console.log(`[CPNU] Skipping defensorPublico (defensorPrivado already set): ${nombre}`);
              }
            } else {
              // Generic "defensor" without type specified - treat as privado (most common case)
              if (!data.defensorPrivado && !data.defensorPublico) {
                data.defensorPrivado = nombre;
                console.log(`[CPNU] Set defensorPrivado (generic defensor): ${nombre}`);
              }
            }
          }
        }
      });

      console.log(`[CPNU] Extracted Sujetos Procesales:`, JSON.stringify(data, null, 2));
      return data;
    });

    return sujetos;
  } catch (error) {
    console.error('[CPNU] Error extracting Sujetos Procesales:', error);
    throw error;
  }
}

/**
 * Extract "Actuaciones" from the table
 * @param {Page} page - Puppeteer page object
 * @returns {Promise<Array>} Array of Actuaciones
 */
async function extractActuaciones(page) {
  try {
    // Check if Actuaciones tab exists and is loaded using XPath
    const actuacionesTabXPath = "//div[contains(@class, 'v-tab') and contains(text(), 'Actuaciones')]";
    const actuacionesTabs = await findElementsByXPath(page, actuacionesTabXPath);
    const actuacionesExist = actuacionesTabs && actuacionesTabs.length > 0;

    if (!actuacionesExist) {
      console.log('[CPNU] Actuaciones tab not found, returning empty array');
      return [];
    }

    // Wait for Actuaciones table (already done above, but verify)
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Extract Actuaciones data using header-based column detection
    const actuaciones = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      let targetTable = null;

      // Find the table that has a header "Fecha de Registro"
      for (const table of tables) {
        const headerCells = Array.from(table.querySelectorAll('thead th, thead tr th, .v-data-table-header th'));
        const headerTexts = headerCells.map(th => (th.textContent || '').trim().toLowerCase());

        if (headerTexts.some(text => text.includes('fecha de registro'))) {
          targetTable = table;
          break;
        }
      }

      if (!targetTable) {
        console.log('[CPNU] No Actuaciones table with "Fecha de Registro" header found');
        return [];
      }

      // Build a header index map
      const headerCells = Array.from(targetTable.querySelectorAll('thead th, thead tr th, .v-data-table-header th'));
      const headerTexts = headerCells.map(th => (th.textContent || '').trim().toLowerCase());

      // Log headers for debugging
      console.log('[CPNU] Found headers:', headerTexts);

      // Helper function to normalize text (remove accents/tildes) for comparison
      // Handles both "Actuación" and "Actuacion" by removing diacritical marks
      const normalizeText = (text) => {
        if (!text) return '';
        // Map common Spanish accented characters to their non-accented equivalents
        const accentMap = {
          'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
          'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
          'ñ': 'n', 'Ñ': 'N',
          'ü': 'u', 'Ü': 'U'
        };
        // Replace accented characters with non-accented equivalents
        let normalized = text.toLowerCase();
        for (const [accented, unaccented] of Object.entries(accentMap)) {
          normalized = normalized.replace(new RegExp(accented, 'g'), unaccented);
        }
        return normalized;
      };

      const idxFechaRegistro = headerTexts.findIndex(text => text.includes('fecha de registro'));

      // Find Fecha de actuación with accent normalization
      const idxFechaActuacion = headerTexts.findIndex(text => {
        const normalized = normalizeText(text);
        return text.includes('fecha de actuación') ||
          text.includes('fecha de actuaci') ||
          text.includes('fecha actuacion') ||
          normalized.includes('fecha de actuacion'); // Normalized check (handles both "Actuación" and "Actuacion")
      });

      // Make Actuación column detection more flexible - try multiple variations with accent normalization
      let idxActuacion = headerTexts.findIndex(text => {
        const normalized = normalizeText(text);
        return text === 'actuación' ||
          text === 'actuacion' ||
          normalized === 'actuacion' || // Normalized check (handles both "Actuación" and "Actuacion")
          text.includes('actuación') ||
          text.includes('actuacion') ||
          normalized.includes('actuacion') || // Normalized check
          text === 'descripción' ||
          text === 'descripcion' ||
          normalized === 'descripcion' || // Normalized check (handles both "Descripción" and "Descripcion")
          text.includes('descripción') ||
          text.includes('descripcion') ||
          normalized.includes('descripcion'); // Normalized check
      });

      // If still not found, try looking for common description column names with accent normalization
      if (idxActuacion < 0) {
        idxActuacion = headerTexts.findIndex(text => {
          const normalized = normalizeText(text);
          return text.includes('actu') ||
            normalized.includes('actu') || // Normalized check
            text.includes('descrip') ||
            normalized.includes('descrip') || // Normalized check
            text.includes('motivo') ||
            normalized.includes('motivo') || // Normalized check
            text.includes('observación') ||
            text.includes('observacion') ||
            normalized.includes('observacion'); // Normalized check (handles both "Observación" and "Observacion")
        });
      }

      // Find Anotación column with accent normalization
      const idxAnotacion = headerTexts.findIndex(text => {
        const normalized = normalizeText(text);
        return text.includes('anotación') ||
          text.includes('anotacion') ||
          normalized.includes('anotacion'); // Normalized check (handles both "Anotación" and "Anotacion")
      });

      // Log column indices for debugging
      console.log('[CPNU] Column indices:', {
        fechaRegistro: idxFechaRegistro,
        fechaActuacion: idxFechaActuacion,
        actuacion: idxActuacion,
        anotacion: idxAnotacion,
        headerCount: headerTexts.length,
        headers: headerTexts
      });

      const rows = Array.from(targetTable.querySelectorAll('tbody tr'));
      const actuacionesList = [];

      const getCellText = (cells, i) =>
        i >= 0 && i < cells.length ? (cells[i].textContent || '').trim() : '';

      // Helper to check if text is loading text
      const isLoadingText = (text) => {
        if (!text) return true;
        const lowerText = text.toLowerCase();
        return lowerText.includes('cargando') ||
          lowerText.includes('por favor espere') ||
          lowerText.includes('loading') ||
          lowerText.includes('espere');
      };

      // Helper to check if fecha_registro is valid (contains date-like pattern)
      const isValidFechaRegistro = (text) => {
        if (!text || isLoadingText(text)) return false;
        // Check if it contains date-like patterns (digits with separators)
        // Patterns: DD/MM/YYYY, DD-MM-YYYY, YYYY/MM/DD, YYYY-MM-DD, DD.MM.YYYY, YYYY.MM.DD
        const datePattern = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$|^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/;
        return datePattern.test(text.trim());
      };

      // Helper to check if text is a date (more strict - must be ONLY a date, not text containing a date)
      const isDateOnly = (text) => {
        if (!text) return false;
        const trimmed = text.trim();
        // Must match date pattern exactly (only date, no other text)
        return /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$|^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(trimmed);
      };

      rows.forEach((row, index) => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length === 0) return;

        const fechaRegistro = getCellText(cells, idxFechaRegistro) || null;
        const fechaActuacion = getCellText(cells, idxFechaActuacion) || null;

        // PRIORITY STRATEGY: CPNU pattern detection (MOST RELIABLE)
        // HTML structure: <td>fecha_registro (col 0)</td><td>Actuación (col 1)</td><td>...</td><td>fecha_actuacion (col 5)</td>
        // If fecha_registro is in column 0, column 1 MUST be Actuación - this is the CPNU standard structure
        let actuacionText = '';

        // Strategy 1 (HIGHEST PRIORITY): CPNU standard pattern - fecha_registro at column 0, Actuación at column 1
        if (idxFechaRegistro === 0 && cells.length > 1) {
          const cell1Text = getCellText(cells, 1);
          console.log(`[CPNU] CPNU pattern detected (fecha_registro is col 0), checking col 1: "${cell1Text.substring(0, 50) || '(empty)'}..."`);
          if (cell1Text && !isLoadingText(cell1Text) && !isDateOnly(cell1Text) && cell1Text.trim() !== (fechaRegistro || '').trim()) {
            actuacionText = cell1Text;
            console.log(`[CPNU] ✅ Using column 1 as descripcion (CPNU pattern - HIGHEST PRIORITY): "${actuacionText.substring(0, 50)}..."`);
          }
        }

        // Strategy 2: Use header-detected column index (if available and Strategy 1 didn't work)
        if (!actuacionText && idxActuacion >= 0) {
          const headerBasedText = getCellText(cells, idxActuacion);
          console.log(`[CPNU] Trying header-detected Actuación column (index ${idxActuacion}): "${headerBasedText.substring(0, 50) || '(empty)'}..."`);
          if (headerBasedText && !isLoadingText(headerBasedText) && !isDateOnly(headerBasedText) &&
            headerBasedText.trim() !== (fechaRegistro || '').trim() &&
            headerBasedText.trim() !== (fechaActuacion || '').trim()) {
            actuacionText = headerBasedText;
            console.log(`[CPNU] ✅ Using header-detected column ${idxActuacion} as descripcion: "${actuacionText.substring(0, 50)}..."`);
          }
        }

        // Strategy 3: Try column index 1 as fallback (if fecha_registro is not at column 0)
        if (!actuacionText && cells.length > 1 && idxFechaRegistro !== 1 && idxFechaActuacion !== 1) {
          const cell1Text = getCellText(cells, 1);
          console.log(`[CPNU] Checking column 1 (fallback - fecha_registro is not at col 0): "${cell1Text.substring(0, 50) || '(empty)'}..."`);
          if (cell1Text &&
            !isLoadingText(cell1Text) &&
            !isDateOnly(cell1Text) &&
            cell1Text.trim() !== (fechaRegistro || '').trim() &&
            cell1Text.trim() !== (fechaActuacion || '').trim()) {
            actuacionText = cell1Text;
            console.log(`[CPNU] ✅ Found descripcion in column 1 (fallback): "${actuacionText.substring(0, 50)}..."`);
          }
        }

        // Strategy 4: Scan all columns (last resort)
        if (!actuacionText) {
          console.log(`[CPNU] All previous strategies failed, scanning all columns (skipping ${idxFechaRegistro}, ${idxFechaActuacion})`);
          for (let i = 0; i < cells.length; i++) {
            // Skip fecha_registro and fecha_actuacion columns
            if (i !== idxFechaRegistro && i !== idxFechaActuacion) {
              const cellText = getCellText(cells, i);
              // If it's not empty, not loading text, not a date, and not a button/icon, it might be descripcion
              if (cellText &&
                !isLoadingText(cellText) &&
                !isDateOnly(cellText) &&
                cellText.trim() !== (fechaRegistro || '').trim() &&
                cellText.trim() !== (fechaActuacion || '').trim() &&
                !cellText.includes('button') &&
                !cellText.includes('fa-') &&
                cellText.trim().length > 0) { // Skip button cells and empty strings
                actuacionText = cellText;
                console.log(`[CPNU] ✅ Found potential descripcion in column ${i} (scan all): "${actuacionText.substring(0, 50)}..."`);
                break;
              }
            }
          }
        }

        // Final check: Log warning if still not found
        if (!actuacionText) {
          console.warn(`[CPNU] ⚠️ Could not find descripcion in row ${index}. Cell count: ${cells.length}`);
          console.warn(`[CPNU]   idxFechaRegistro: ${idxFechaRegistro}, fecha_registro: "${fechaRegistro}"`);
          console.warn(`[CPNU]   idxFechaActuacion: ${idxFechaActuacion}, fecha_actuacion: "${fechaActuacion}"`);
          console.warn(`[CPNU]   idxActuacion (header): ${idxActuacion}`);
          // Log all cell contents for debugging
          console.warn(`[CPNU]   All cell contents:`);
          cells.forEach((cell, i) => {
            const cellText = getCellText(cells, i);
            console.warn(`[CPNU]     Cell ${i}: "${cellText.substring(0, 100) || '(empty)'}"`);
          });
        }

        const anotacionText = idxAnotacion >= 0 ? getCellText(cells, idxAnotacion) : '';

        let descripcion = actuacionText;
        if (anotacionText) {
          descripcion = descripcion
            ? `${descripcion} - ${anotacionText}`
            : anotacionText;
        }
        descripcion = descripcion || null;

        // Add validation: descripcion should not be the same as fecha_registro
        if (descripcion && fechaRegistro) {
          const descTrimmed = descripcion.trim();
          const fechaTrimmed = fechaRegistro.trim();
          if (descTrimmed === fechaTrimmed) {
            console.warn(`[CPNU] ⚠️ descripcion "${descTrimmed}" is same as fecha_registro, setting descripcion to null`);
            descripcion = null;
          }
        }

        // Additional validation: descripcion should not be a date pattern (use stricter check)
        if (descripcion && isDateOnly(descripcion)) {
          console.warn(`[CPNU] ⚠️ descripcion "${descripcion}" is a date-only value, setting descripcion to null`);
          descripcion = null;
        }

        // Additional validation: descripcion should not match fecha_registro exactly
        if (descripcion && fechaRegistro && descripcion.trim() === fechaRegistro.trim()) {
          console.warn(`[CPNU] ⚠️ descripcion "${descripcion}" matches fecha_registro exactly, setting descripcion to null`);
          descripcion = null;
        }

        // CRITICAL: Filter out rows with loading text
        // "Fecha de registro" is the TARGET (most important) - prioritize it
        const hasValidFechaRegistro = isValidFechaRegistro(fechaRegistro);
        // Ensure descripcion is not empty, not loading text, not a date, and not equal to fecha_registro
        const hasValidDescripcion = descripcion &&
          !isLoadingText(descripcion) &&
          !isDateOnly(descripcion) &&
          descripcion.trim() !== (fechaRegistro || '').trim();
        const hasValidFechaActuacion = fechaActuacion && !isLoadingText(fechaActuacion);

        // Debug logging for first row (ENHANCED)
        if (index === 0) {
          console.log('[CPNU] 🔍 First row extraction (DETAILED):', {
            idxFechaRegistro,
            idxFechaActuacion,
            idxActuacion,
            idxAnotacion,
            fechaRegistro,
            fechaActuacion,
            actuacionText: actuacionText || '(EMPTY - NOT FOUND!)',
            anotacionText,
            descripcionBeforeValidation: actuacionText || null,
            descripcionAfterValidation: descripcion || '(NULL)',
            hasValidFechaRegistro,
            hasValidDescripcion,
            cellCount: cells.length,
            allCells: cells.map((cell, i) => {
              const text = getCellText(cells, i);
              return { index: i, text: text.substring(0, 50) || '(empty)' };
            })
          });
        }

        // Only include rows where fecha_registro is valid (TARGET field)
        // OR if descripcion is valid (but fecha_registro must not be loading text)
        if (hasValidFechaRegistro || (hasValidDescripcion && fechaRegistro !== null && !isLoadingText(fechaRegistro))) {
          // If fecha_registro has loading text, set it to null instead of including loading text
          const finalFechaRegistro = hasValidFechaRegistro ? fechaRegistro : null;
          const finalFechaActuacion = hasValidFechaActuacion ? fechaActuacion : null;
          const finalDescripcion = hasValidDescripcion ? descripcion : null;

          actuacionesList.push({
            fecha_registro: finalFechaRegistro,
            fecha_actuacion: finalFechaActuacion,
            descripcion: finalDescripcion,
            index,
          });
        }
      });

      // Sort by fecha_registro (newest first) - prioritize rows with valid fecha_registro
      actuacionesList.sort((a, b) => {
        // Prioritize rows with valid fecha_registro
        if (!a.fecha_registro && !b.fecha_registro) return 0;
        if (!a.fecha_registro) return 1; // a goes to end
        if (!b.fecha_registro) return -1; // b goes to beginning

        try {
          const dateA = new Date(a.fecha_registro);
          const dateB = new Date(b.fecha_registro);
          if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
            // If one is invalid, prioritize the valid one
            if (isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) return 1;
            if (!isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return -1;
            return 0;
          }
          return dateB.getTime() - dateA.getTime(); // Descending (newest first)
        } catch {
          return 0;
        }
      });

      return actuacionesList;
    });

    // Final safety filter: Remove any remaining loading entries
    const validActuaciones = actuaciones.filter(act => {
      // fecha_registro is TARGET - must be valid
      if (act.fecha_registro) {
        const lowerFecha = act.fecha_registro.toLowerCase();
        if (lowerFecha.includes('cargando') ||
          lowerFecha.includes('por favor espere') ||
          lowerFecha.includes('loading')) {
          return false; // Filter out loading text
        }
      }

      // Filter out descripcion with loading text
      if (act.descripcion) {
        const lowerDesc = act.descripcion.toLowerCase();
        if (lowerDesc.includes('cargando') ||
          lowerDesc.includes('por favor espere') ||
          lowerDesc.includes('loading')) {
          return false; // Filter out loading text
        }
      }

      // Filter out fecha_actuacion with loading text
      if (act.fecha_actuacion) {
        const lowerFechaAct = act.fecha_actuacion.toLowerCase();
        if (lowerFechaAct.includes('cargando') ||
          lowerFechaAct.includes('por favor espere') ||
          lowerFechaAct.includes('loading')) {
          return false; // Filter out loading text
        }
      }

      // At least one field must be valid
      return act.fecha_registro || act.descripcion;
    });

    if (validActuaciones.length === 0) {
      console.warn('[CPNU] ⚠️ No valid Actuaciones found after filtering loading text');
      return [];
    }

    // Log the first row (most important - TARGET)
    console.log('[CPNU] Extracted Actuaciones (first row as latest - TARGET):', {
      fecha_registro: validActuaciones[0].fecha_registro,
      fecha_actuacion: validActuaciones[0].fecha_actuacion,
      descripcion: validActuaciones[0].descripcion ?
        (validActuaciones[0].descripcion.length > 100
          ? validActuaciones[0].descripcion.substring(0, 100) + '...'
          : validActuaciones[0].descripcion) : null,
      totalCount: validActuaciones.length
    });

    return validActuaciones;
  } catch (error) {
    console.error('[CPNU] Error extracting Actuaciones:', error);
    // Return empty array instead of throwing, as Actuaciones might not always be available
    return [];
  }
}

/**
 * Compare fecha_registro to detect changes
 * @param {string} currentFechaRegistro - Current stored fecha_registro
 * @param {Array} scrapedActuaciones - Newly scraped Actuaciones
 * @returns {Object} { hasChanges: boolean, latestFechaRegistro: string, newActuaciones: Array }
 */
export function detectActuacionesChanges(currentFechaRegistro, scrapedActuaciones) {
  if (!scrapedActuaciones || scrapedActuaciones.length === 0) {
    return {
      hasChanges: false,
      latestFechaRegistro: currentFechaRegistro,
      newActuaciones: [],
    };
  }

  // Get latest fecha_registro from scraped data
  const latestActuacion = scrapedActuaciones[0]; // Already sorted newest first
  const latestFechaRegistro = latestActuacion.fecha_registro;

  // Normalize dates for comparison (handles different formats)
  const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr; // Invalid date, return as-is
      return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    } catch {
      return dateStr; // If parsing fails, return original
    }
  };

  // Compare with current
  if (!currentFechaRegistro) {
    // First time, all are new
    return {
      hasChanges: true,
      latestFechaRegistro,
      newActuaciones: scrapedActuaciones,
    };
  }

  // Normalize both dates for comparison
  const normalizedLatest = normalizeDate(latestFechaRegistro);
  const normalizedCurrent = normalizeDate(currentFechaRegistro);

  if (normalizedLatest === normalizedCurrent) {
    // No changes
    return {
      hasChanges: false,
      latestFechaRegistro: currentFechaRegistro,
      newActuaciones: [],
    };
  }

  // Find new Actuaciones (those with fecha_registro > currentFechaRegistro)
  try {
    const currentDate = new Date(currentFechaRegistro);
    if (isNaN(currentDate.getTime())) {
      // Invalid current date, treat all as new
      console.warn(`[CPNU] Invalid currentFechaRegistro format: ${currentFechaRegistro}, treating all as new`);
      return {
        hasChanges: true,
        latestFechaRegistro,
        newActuaciones: scrapedActuaciones,
      };
    }

    const newActuaciones = scrapedActuaciones.filter(act => {
      if (!act.fecha_registro) return false;
      try {
        const actDate = new Date(act.fecha_registro);
        if (isNaN(actDate.getTime())) return false; // Skip invalid dates
        return actDate > currentDate;
      } catch {
        return false;
      }
    });

    return {
      hasChanges: newActuaciones.length > 0,
      latestFechaRegistro,
      newActuaciones,
    };
  } catch (error) {
    console.error('[CPNU] Error comparing fecha_registro:', error);
    // If comparison fails, assume no changes to be safe
    return {
      hasChanges: false,
      latestFechaRegistro: currentFechaRegistro,
      newActuaciones: [],
    };
  }
}

