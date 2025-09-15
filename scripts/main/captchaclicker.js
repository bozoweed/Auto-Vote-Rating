// ============================
// Global state flags
// ============================
window.dontSolve = false;
window.solvedCaptcha = false;
window.loadedCaptcha = false;

chrome.runtime.onMessage.addListener(function (request/*, sender, sendResponse*/) {
    console.log('Captchaclicker received message', request);
    if (request.sendProject) {
        if (!window.loadedCaptcha) {
            window.loadedCaptcha = true;
            if (request.settings?.disabledClickCaptcha) {
                window.dontSolve = true;
            }
            run();
        } else if (window.solvedCaptcha) {
            chrome.runtime.sendMessage({ captchaPassed: 'double' });
        }
    }
});

function run() {
    if (window.portAlert) {
        window.portAlert.addEventListener('state', event => {
            chrome.runtime.sendMessage({
                message: event.detail.message,
                ignoreReport: true
            });
        });
    }

    const url = window.location.href;

    const isRecaptchaAnchor = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api\d|enterprise)\/anchor/.test(url);
    const isRecaptchaBFrame = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api\d|enterprise)\/bframe/.test(url);
    const isMTCaptcha = /https?:\/\/service\.mtcaptcha\.com\/mtcv1/.test(url);
    const isHCaptcha = url.includes('.hcaptcha.com/captcha.v');
    const isSmartCaptcha = url.includes('smartcaptcha.yandexcloud.net');
    const isCloudflareChallengePage = url.startsWith('https://challenges.cloudflare.com');
    const hasTurnstileWidget = document.querySelector('.cf-turnstile, [name="cf-turnstile-response"], iframe[src*="challenges.cloudflare.com/turnstile"]') !== null;

    console.log(`[DEBUG] Recaptcha Anchor: ${isRecaptchaAnchor}`);
    console.log(`[DEBUG] Recaptcha BFrame: ${isRecaptchaBFrame}`);
    console.log(`[DEBUG] HCaptcha: ${isHCaptcha}`);
    console.log(`[DEBUG] SmartCaptcha: ${isSmartCaptcha}`);
    console.log(`[DEBUG] MTCaptcha: ${isMTCaptcha}`);
    console.log(`[DEBUG] Cloudflare Challenge Page: ${isCloudflareChallengePage}`);
    console.log(`[DEBUG] Has Turnstile Widget: ${hasTurnstileWidget}`);


    if (isSmartCaptcha) {
        handleSmartCaptcha();
    } else if (isMTCaptcha) {
        handleMTCaptcha();
    } else if (isRecaptchaAnchor) {
        handleReCaptchaAnchor();
    } else if (isRecaptchaBFrame && !document.querySelector('head > yandex-captcha-solver')) {
        handleReCaptchaBFrame();
    } else if (isRecaptchaFallback) {
        handleReCaptchaFallback();
    } else if (isHCaptcha) {
        handleHCaptcha();
    } else if (isCloudflareChallengePage) {
        console.log(`[Cloudflare DEBUG] ➡️ Detected Cloudflare challenge page. Assuming Turnstile.`);

        let handled = false;
        handled = handleTurnstileInIframe();
        if (!handled) {
            console.log(`[Turnstile DEBUG] 🔄 No iframe found. Trying direct Shadow DOM search with chrome.dom.openOrClosedShadowRoot...`);
            handled = handleTurnstileInShadowDOM();
        }

        if (!handled) {
            console.log(`[Turnstile DEBUG] 🔄 Setting up aggressive observer + retries for both iframe and Shadow DOM...`);
            if (!window.turnstileObserverActive) {
                window.turnstileObserverActive = true;
                const observer = new MutationObserver((mutations) => {
                    for (let mutation of mutations) {
                        for (let node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const turnstileIframe = node.querySelector?.('iframe[src*="challenges.cloudflare.com/turnstile"]') ||
                                    (node.tagName === 'IFRAME' && node.src.includes('challenges.cloudflare.com') && node.src.includes('/turnstile/'));
                                if (turnstileIframe) {
                                    console.log(`[Turnstile DEBUG] ➕ Turnstile iframe detected via MutationObserver.`);
                                    setTimeout(() => handleTurnstileInIframe(), 500);
                                    return;
                                }
                                if (node.shadowRoot || node.querySelector?.('*')) {
                                    const hasTurnstileClass = node.classList?.contains('cf-turnstile') ||
                                        node.hasAttribute?.('data-widget-id') ||
                                        node.querySelector?.('.cb-lb-t');
                                    if (hasTurnstileClass) {
                                        console.log(`[Turnstile DEBUG] ➕ Turnstile container detected in Shadow DOM via MutationObserver.`);
                                        setTimeout(() => handleTurnstileInShadowDOM(), 500);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                console.log(`[Turnstile DEBUG] 👁️ MutationObserver activated for both iframe and Shadow DOM.`);
                let retryCount = 0;
                const maxRetries = 8;
                const retryInterval = setInterval(() => {
                    if (retryCount >= maxRetries) {
                        clearInterval(retryInterval);
                        console.log(`[Turnstile DEBUG] ❌ Gave up after ${maxRetries} retries.`);
                        return;
                    }
                    retryCount++;
                    console.log(`[Turnstile DEBUG] ♻️ Retry ${retryCount}/${maxRetries}...`);
                    if (!handled) handled = handleTurnstileInIframe();
                    if (!handled) handled = handleTurnstileInShadowDOM();
                }, 2000);
            }
        }
    } else if (hasTurnstileWidget) {
        console.log(`[Turnstile DEBUG] ⚙️ Turnstile widget detected. Attempting to handle now...`);
        if (!handleTurnstileInIframe()) {
            console.log(`[Turnstile DEBUG] 🔄 Initial attempt failed or iframe not ready. Setting up observer for dynamic injection...`);
            if (!window.turnstileObserverActive) {
                window.turnstileObserverActive = true;
                const observer = new MutationObserver((mutations) => {
                    for (let mutation of mutations) {
                        for (let node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                const turnstileIframe = node.querySelector?.('iframe[src*="challenges.cloudflare.com/turnstile"]') ||
                                    (node.tagName === 'IFRAME' && node.src.includes('challenges.cloudflare.com') && node.src.includes('/turnstile/'));
                                if (turnstileIframe) {
                                    console.log(`[Turnstile DEBUG] ➕ Dynamically added Turnstile iframe detected via MutationObserver.`);
                                    setTimeout(() => {
                                        handleTurnstileInIframe();
                                    }, 1000);
                                    return;
                                }
                            }
                        }
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                console.log(`[Turnstile DEBUG] 👁️ MutationObserver activated.`);
            }
        } else {
            console.log(`[Turnstile DEBUG] 🎯 Successfully handled Turnstile on first attempt.`);
        }
    } else {
        console.log(`[DEBUG] No known CAPTCHA type detected on this page.`);
    }
}
  function neutralizePlay(media) {
  if (media.__autoplayPatched) return; // évite les doubles patchs
  media.__autoplayPatched = true;

  media.muted = true;
  media.volume = 0;
  media.setAttribute('muted', '');
  media.setAttribute('playsinline', '');
  media.preload = 'auto';

  media.addEventListener('play', () => media.pause(), { once: true });

  const nativePlay = media.play.bind(media);
  media.play = (...args) => {
    media.muted = true;
    media.volume = 0;
    try {
      const p = nativePlay(...args);
      if (p && typeof p.catch === 'function') p.catch(() => {}); // avale NotAllowedError
      return p || Promise.resolve();
    } catch {
      return Promise.resolve();
    }
  };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function setNativeValue(el, value) {
  // Makes React/Vue/etc pick up the change
  const proto = el.constructor.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
}

function keyDataForChar(ch) {
  if (ch === '\n') return { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 13, shiftKey: false };
  if (ch === '\b') return { key: 'Backspace', code: 'Backspace', keyCode: 8, which: 8, charCode: 8, shiftKey: false };
  const isSpace = ch === ' ';
  const key = isSpace ? ' ' : ch;
  const keyCode = isSpace ? 32 : ch.toUpperCase().charCodeAt(0) || 0;
  const which = keyCode;
  const charCode = ch.charCodeAt(0) || 0;
  const shiftKey = ch.toUpperCase() === ch && ch.toLowerCase() !== ch;
  const code = /^[a-z]$/i.test(ch) ? `Key${ch.toUpperCase()}` : (isSpace ? 'Space' : '');
  return { key, code, keyCode, which, charCode, shiftKey };
}

function fire(el, type, init = {}) {
  let ev;
  if (type === 'input' || type === 'beforeinput') {
    ev = new InputEvent(type, {
      bubbles: true,
      cancelable: type === 'beforeinput',
      data: init.data ?? null,
      inputType: init.inputType ?? 'insertText'
    });
  } else if (type === 'keypress' || type === 'keydown' || type === 'keyup') {
    ev = new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: init.key,
      code: init.code,
      keyCode: init.keyCode,
      which: init.which,
      charCode: init.charCode,
      shiftKey: init.shiftKey
    });
    // Legacy getters some libs check
    Object.defineProperty(ev, 'keyCode', { get: () => init.keyCode });
    Object.defineProperty(ev, 'which', { get: () => init.which });
    Object.defineProperty(ev, 'charCode', { get: () => init.charCode });
  } else if (type === 'change') {
    ev = new Event('change', { bubbles: true });
  } else {
    ev = new Event(type, { bubbles: type.endsWith('in') || type.endsWith('out') || type === 'focus', cancelable: false });
  }
  el.dispatchEvent(ev);
  return ev;
}

async function typeText(el, text, { delay = 50, focus = true, blur = false, react = true } = {}) {
  if (focus) el.focus(); // will fire focus/focusin naturally

  for (const ch of text) {
    const kd = keyDataForChar(ch);

    fire(el, 'keydown', kd);
    fire(el, 'keypress', kd);
    fire(el, 'beforeinput', { inputType: 'insertText', data: ch });

    // Insert at caret
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newVal = el.value.slice(0, start) + ch + el.value.slice(end);

    if (react) setNativeValue(el, newVal);
    else el.value = newVal;

    if (el.setSelectionRange) el.setSelectionRange(start + ch.length, start + ch.length);

    fire(el, 'input', { inputType: 'insertText', data: ch });
    fire(el, 'keyup', kd);

    if (delay) await sleep(delay);
  }

  if (blur) {
    el.blur();          // fires blur/focusout
    fire(el, 'change'); // some frameworks expect change after blur
  }
}

async function handleMTCaptcha() {

    const client = new window.LettersASRClient({ baseUrl: "https://bozoweed.ddns.net/api/ocr" });
    while (!document.querySelector('#mtcap-audio-1')) await new Promise(resolve => setTimeout(resolve, 1000));
    neutralizePlay(document.querySelector('#mtcap-audio-1'));
    await new Promise(resolve => setTimeout(resolve, 1000));
    document.querySelector('#mtcap-audioctrl-1').click();
    await new Promise(resolve => setTimeout(resolve, 1000));
    const filename = 'audio.webm';
    do {
        const res = await client.transcribe(document.querySelector('#mtcap-audio-1').src, {
            language: 'fr',       // 'fr' | 'en' | 'auto'
            attachTo: '#mtcap-main-1',    // attach animated status widget to the dropzone
            stream: true,        // non-streaming endpoint returns full JSON
            filename
        });
        if (res.letters_array.length < 4) {
            document.querySelector('#mtcap-statusbutton-1').click();
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {

            let input = document.querySelector('#mtcap-inputtext-1');
            const inputField = input;
            await typeText(inputField, res.letters, { delay: 50, focus: true, blur: true, react: true });
            document.body.focus();
            await new Promise(resolve => setTimeout(resolve, 7000));

            window.solvedCaptcha = document.querySelector("#mtcap-statusimg-1[style*='color: rgb(0, 238, 0)']");
            if (!window.solvedCaptcha) {                
                document.querySelector('#mtcap-statusbutton-1').click();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } while (!window.solvedCaptcha);


    chrome.runtime.sendMessage({ captchaPassed: true });
}




async function handleSmartCaptcha() {
    try {
        // Wait for the captcha checkbox to appear in the DOM
        while (!document.querySelector('.CheckboxCaptcha-Checkbox')) await new Promise(resolve => setTimeout(resolve, 1000));
        document.querySelector('.CheckboxCaptcha-Checkbox').setAttribute("data-checked", true);

        // Wait for the button to appear in the DOM
        const voteButton = document.querySelector('#js-button');
        voteButton.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
        window.solvedCaptcha = true;
        chrome.runtime.sendMessage({ captchaPassed: true });

    } catch (error) {
        // If an element isn't found after the timeout, send an error message and stop.
        console.error("Error during voting interaction:", error);
        chrome.runtime.sendMessage({ message: error.message });
        return;
    }
}

function handleReCaptchaAnchor() {
    const timer1 = setInterval(() => {
        if (window.dontSolve || document.querySelector('head > captcha-widgets')) {
            clearInterval(timer1);
            return;
        }

        const checkboxBorder = document.querySelector('#recaptcha-anchor > div.recaptcha-checkbox-border');
        if (!checkboxBorder || !isScrolledIntoView(checkboxBorder) || checkboxBorder.style.display === 'none') return;

        const errorMsg = document.querySelector('.rc-anchor-error-msg-container');
        if (errorMsg && errorMsg.style.display !== 'none' && errorMsg.textContent.trim().length > 0) {
            return; // Don't click if error present
        }

        checkboxBorder.click();
        clearInterval(timer1);

        const timer2 = setInterval(() => {
            const isChecked = document.querySelector('.recaptcha-checkbox-checked');
            const responseField = document.getElementById('g-recaptcha-response');
            if (isChecked || (responseField && responseField.value.length > 0)) {
                clearInterval(timer2);
                window.solvedCaptcha = true;
                chrome.runtime.sendMessage({ captchaPassed: true });
                return;
            }

            if (errorMsg && errorMsg.style.display !== 'none' && errorMsg.textContent.trim().length > 0) {
                const text = errorMsg.textContent.trim();
                if (text.includes('Try reloading the page')) {
                    location.reload();
                } else if (!/время проверки истекло|Verification (challenge )?expired|La validation a expiré|Platnost výzvy ověření vypršела|verificación caducó/i.test(text)) {
                    chrome.runtime.sendMessage({ errorCaptcha: text });
                    clearInterval(timer2);
                }
            }
        }, 1000);
    }, 1000);
}

function handleReCaptchaBFrame() {
    let count = 0;
    let repeat = 2;

    const timer7 = setInterval(() => {
        const solverButton = document.getElementById('solver-button');
        const verifyButton = document.getElementById('recaptcha-verify-button');

        if (solverButton && !solverButton.classList.contains('working') && verifyButton && !verifyButton.disabled) {
            const audioError = document.querySelector('.rc-audiochallenge-error-message');
            if (audioError && audioError.style.display !== 'none' && audioError.textContent.trim().length > 0) {
                repeat = 3;
            }

            if (count >= repeat) {
                chrome.runtime.sendMessage({ reloadCaptcha: true });
                clearInterval(timer7);
                return;
            }

            solverButton.click();
            count++;
        }

        const dosText = document.querySelector('.rc-doscaptcha-body-text');
        if (dosText && dosText.style.display !== 'none' && dosText.textContent.trim().length > 0) {
            chrome.runtime.sendMessage({ errorCaptcha: dosText.textContent.trim() });
            clearInterval(timer7);
        }

        // Temporary fix for NopeCHA + Speech method
        const audioResponse = document.querySelector("#audio-response");
        if (audioResponse && audioResponse.value.length > 3) {
            clearInterval(timer7);
            document.querySelector("#recaptcha-verify-button")?.click();
        }
    }, 2000);

    const timer3 = setInterval(() => {
        if (!document.getElementById("solver-button") && document.getElementById("rc-imageselect")) {
            chrome.runtime.sendMessage({ captcha: true });
            clearInterval(timer3);
        }
    }, 1000);
}

function handleReCaptchaFallback() {
    chrome.runtime.sendMessage({
        errorCaptcha: document.body.innerText.trim(),
        restartVote: true
    });
}

function handleHCaptcha() {
    const timer4 = setInterval(() => {
        if (window.dontSolve || document.querySelector('head > captcha-widgets')) {
            clearInterval(timer4);
            return;
        }

        const checkbox = document.getElementById('checkbox');
        if (!checkbox || !isScrolledIntoView(checkbox) || checkbox.style.display === 'none') return;

        checkbox.click();
        clearInterval(timer4);

        const timer5 = setInterval(() => {
            if (checkbox.getAttribute('aria-checked') === 'true') {
                clearInterval(timer5);
                window.solvedCaptcha = true;
                chrome.runtime.sendMessage({ captchaPassed: true });
            }
        }, 1000);

        const timer6 = setInterval(() => {
            const bodyNoSel = document.querySelector('body.no-selection');
            if (bodyNoSel && bodyNoSel.getAttribute('aria-hidden') == null && bodyNoSel.style.display === '') {
                if (!document.querySelector('head > yandex-captcha-solver')) {
                    chrome.runtime.sendMessage({ captcha: true });
                }
                clearInterval(timer6);
            }

            const yandexError = document.querySelector('div[style*="color: rgb(218, 94, 94)"]');
            if (yandexError) {
                chrome.runtime.sendMessage({ errorCaptcha: yandexError.textContent });
                clearInterval(timer5); // Stop success checker too
            }
        }, 1000);

        const timer9 = setInterval(() => {
            const status = document.querySelector('#status');
            if (status && status.style.display !== 'none' && status.innerText.trim().length > 3) {
                chrome.runtime.sendMessage({ errorCaptcha: status.innerText.trim() });
                clearInterval(timer9);
            }
        }, 1000);
    }, 1000);
}


function findAllElementsInShadowDOM(selector, root = document) {
    const result = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
    let node;
    while (node = walker.nextNode()) {
        if (node.shadowRoot) {
            const matches = node.shadowRoot.querySelectorAll(selector);
            result.push(...matches);
            result.push(...findAllElementsInShadowDOM(selector, node.shadowRoot));
        }
    }
    const directMatches = root.querySelectorAll(selector);
    result.push(...directMatches);
    return result;
}

// >>> REPLACED: Ultra-Human Click Simulator with ALL Enhancements
function simulateUltraHumanClick(element, callback, options = {}) {
    if (!element || !element.getBoundingClientRect) {
        console.warn('[Ultra-Human Click] Element invalid or not visible.');
        if (callback) callback(false);
        return;
    }

    const startTime = performance.now();
    const rect = element.getBoundingClientRect();

    // Validate element is interactable
    if (rect.width <= 0 || rect.height <= 0) {
        console.warn('[Ultra-Human Click] Element has no size.');
        if (callback) callback(false);
        return;
    }

    // >>> NEW: Scroll element into view first <<<
    console.log(`[Ultra-Human Click] 📜 Scrolling element into view...`);
    try {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
        });
    } catch (e) {
        console.warn('[Ultra-Human Click] Scroll failed:', e.message);
    }

    // >>> NEW: Wait for scroll to complete and element to be properly positioned <<<
    setTimeout(() => {
        // Get fresh bounding rect after scroll
        const updatedRect = element.getBoundingClientRect();

        // Double-check element is now in view
        if (updatedRect.top < 0 || updatedRect.bottom > window.innerHeight) {
            console.warn('[Ultra-Human Click] Element still not fully in view after scroll.');
            // We'll proceed anyway but log warning
        }

        // Target with micro-jitter (±3px) - NOW USING UPDATED POSITION
        const targetX = updatedRect.left + updatedRect.width / 2 + (Math.random() * 6 - 3);
        const targetY = updatedRect.top + updatedRect.height / 2 + (Math.random() * 6 - 3);

        // Start from natural offset near the element (like human hand approaching)
        // Make sure start position is within reasonable bounds
        const startX = Math.max(0, Math.min(window.innerWidth, targetX + (Math.random() * 200 - 100)));
        const startY = Math.max(0, Math.min(window.innerHeight, targetY + (Math.random() * 200 - 100)));

        console.log(`[Ultra-Human Click] 🐭 Starting mouse journey from (${Math.round(startX)}, ${Math.round(startY)}) to (${Math.round(targetX)}, ${Math.round(targetY)})`);

        // Dispatch initial mouseenter at start position
        safelyDispatchEvent(element, 'mouseenter', { clientX: startX, clientY: startY });

        // Generate smooth Bézier path
        const steps = 8 + Math.floor(Math.random() * 5); // 8-12 steps
        let currentStep = 0;
        const pathPoints = generateBezierPath(startX, startY, targetX, targetY, steps);

        const moveStep = () => {
            if (currentStep >= steps) {
                // Simulate human visual focus
                safelyDispatchEvent(element, 'focus');

                // Hover delay (0.3s - 1.2s)
                const hoverDelay = 300 + Math.random() * 900;
                console.log(`[Ultra-Human Click] 😌 Natural hover/pause for ${Math.round(hoverDelay)}ms...`);

                setTimeout(() => {
                    // Mousedown with pressure simulation
                    safelyDispatchEvent(element, 'mousedown', {
                        clientX: targetX,
                        clientY: targetY,
                        button: 0
                    });
                    console.log(`[Ultra-Human Click] ⬇️ Mouse down (natural finger press)`);

                    // Hold duration (50ms - 150ms)
                    const holdDuration = 50 + Math.random() * 100;
                    setTimeout(() => {
                        safelyDispatchEvent(element, 'mouseup', {
                            clientX: targetX,
                            clientY: targetY,
                            button: 0
                        });
                        console.log(`[Ultra-Human Click] ⬆️ Mouse up`);

                        safelyDispatchEvent(element, 'click', {
                            clientX: targetX,
                            clientY: targetY,
                            button: 0
                        });
                        console.log(`[Ultra-Human Click] ✅ Click completed`);

                        // Simulate blur after interaction
                        setTimeout(() => safelyDispatchEvent(element, 'blur'), 100);

                        const endTime = performance.now();
                        console.log(`[Ultra-Human Click] 📊 Total interaction time: ${Math.round(endTime - startTime)}ms`);

                        if (callback) callback(true);

                    }, holdDuration);
                }, hoverDelay);
                return;
            }

            const point = pathPoints[currentStep];

            // Add micro-tremor during movement (±1.5px)
            const tremorX = currentStep < steps - 1 ? (Math.random() * 3 - 1.5) : 0;
            const tremorY = currentStep < steps - 1 ? (Math.random() * 3 - 1.5) : 0;

            // Ensure coordinates stay within viewport bounds
            const finalX = Math.max(0, Math.min(window.innerWidth, point.x + tremorX));
            const finalY = Math.max(0, Math.min(window.innerHeight, point.y + tremorY));

            safelyDispatchEvent(element, 'mousemove', { clientX: finalX, clientY: finalY });

            const progressPercent = Math.round((currentStep / (steps - 1)) * 100);
            console.log(`[Ultra-Human Click] 🌀 Step ${currentStep + 1}/${steps} (${progressPercent}%): (${Math.round(finalX)}, ${Math.round(finalY)})`);

            currentStep++;

            // Variable step delay (50ms - 150ms)
            const stepDelay = 50 + Math.random() * 100;
            setTimeout(moveStep, stepDelay);
        };

        // Start with cognitive delay (0.8s - 3s "reading time")
        const cognitiveDelay = 800 + Math.floor(Math.random() * 2200);
        console.log(`[Ultra-Human Click] 🧠 Simulating human cognitive delay: waiting ${cognitiveDelay}ms...`);

        setTimeout(() => {
            console.log(`[Ultra-Human Click] ▶️ Starting mouse movement animation...`);
            moveStep();
        }, cognitiveDelay);

    }, 800); // Wait 800ms for scroll animation to complete
}

// Helper: Safe event dispatcher (avoids cross-origin/frame errors)
function safelyDispatchEvent(element, type, props = {}) {
    try {
        const event = new MouseEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true,
            ...props
        });
        element.dispatchEvent(event);
    } catch (e) {
        console.warn(`[Ultra-Human Click] Failed to dispatch ${type}:`, e.message);
    }
}

// Helper: Generate smooth Bézier curve path
function generateBezierPath(x0, y0, x1, y1, steps) {
    const points = [];
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        // Ease in-out cubic for natural acceleration/deceleration
        const easeT = t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

        // Add slight curvature (like natural hand movement)
        const controlX = (x0 + x1) / 2 + (Math.random() * 100 - 50);
        const controlY = Math.min(y0, y1) - 50 - Math.random() * 50;

        // Quadratic Bézier
        const x = (1 - easeT) * (1 - easeT) * x0 + 2 * (1 - easeT) * easeT * controlX + easeT * easeT * x1;
        const y = (1 - easeT) * (1 - easeT) * y0 + 2 * (1 - easeT) * easeT * controlY + easeT * easeT * y1;

        points.push({ x, y });
    }
    return points;
}

// >>> OPTIONAL: Keyboard Fallback for Accessibility/Redundancy
function simulateKeyboardInteraction(element, callback) {
    console.log(`[Keyboard Fallback] ⌨️ Attempting SPACE/ENTER key simulation...`);

    const keyEvents = [
        { key: ' ', code: 'Space', which: 32 },   // SPACE (common for checkboxes)
        { key: 'Enter', code: 'Enter', which: 13 } // ENTER
    ];

    let success = false;

    const tryKey = (index) => {
        if (index >= keyEvents.length) {
            if (callback) callback(success);
            return;
        }

        const keyConfig = keyEvents[index];

        // Focus element first
        try { element.focus(); } catch (e) { }

        const eventProps = {
            key: keyConfig.key,
            code: keyConfig.code,
            which: keyConfig.which,
            bubbles: true,
            cancelable: true
        };

        // KeyDown
        safelyDispatchEvent(element, 'keydown', eventProps);
        console.log(`[Keyboard Fallback] 🔽 KeyDown: ${keyConfig.key}`);

        setTimeout(() => {
            // KeyUp
            safelyDispatchEvent(element, 'keyup', eventProps);
            console.log(`[Keyboard Fallback] 🔼 KeyUp: ${keyConfig.key}`);

            // Check if it worked by looking for response token
            const checkSuccess = () => {
                const responseField = document.querySelector(`[name="cf-turnstile-response"]`);
                return responseField && responseField.value.trim().length > 0;
            };

            if (checkSuccess()) {
                success = true;
                console.log(`[Keyboard Fallback] 🎉 Success with ${keyConfig.key} key!`);
                if (callback) callback(true);
            } else {
                console.log(`[Keyboard Fallback] ❌ ${keyConfig.key} didn't work. Trying next...`);
                setTimeout(() => tryKey(index + 1), 300);
            }
        }, 100 + Math.random() * 200);
    };

    tryKey(0);
}

// >>> ENHANCED: Turnstile Handlers with Ultra-Human Click + Keyboard Fallback

function handleTurnstileInShadowDOM() {
    console.log(`[Turnstile DEBUG] 🔍 Searching for Turnstile directly in Shadow DOM (no iframe)...`);

    if (chrome?.dom?.openOrClosedShadowRoot) {
        console.log(`[Turnstile DEBUG] 🧭 Using chrome.dom.openOrClosedShadowRoot for initial traversal...`);
        const resolvedBody = chrome.dom.openOrClosedShadowRoot(document.body);
        if (resolvedBody) {
            const selectors = ['.cf-turnstile', '[data-widget-id]', '.cb-c', '.cb-lb-t'];
            for (let selector of selectors) {
                const elements = resolvedBody.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`[Turnstile DEBUG] 🎯 Found ${elements.length} element(s) matching "${selector}" via chrome.dom.openOrClosedShadowRoot.`);
                    for (let container of elements) {
                        if (container.hasAttribute('data-turnstile-handled')) continue;
                        container.setAttribute('data-turnstile-handled', 'true');

                        const humanLabel = container.querySelector?.('.cb-lb-t') ||
                            (container.classList?.contains('cb-lb-t') ? container : null);
                        if (!humanLabel) {
                            console.log(`[Turnstile DEBUG] ❓ Human label not found in container. Skipping.`);
                            continue;
                        }

                        console.log(`[Turnstile DEBUG] ✅ Found human label:`, humanLabel.textContent?.trim());

                        const checkboxContainer = humanLabel.closest?.('.cb-c') || container;
                        const checkboxInput = checkboxContainer.querySelector('input[type="checkbox"]');

                        if (!checkboxInput) {
                            console.warn(`[Turnstile DEBUG] ❌ Checkbox input not found.`);
                            continue;
                        }

                        const proceedToClick = () => {
                            console.log(`[Turnstile DEBUG] 🖱️ Initiating ultra-human interaction sequence...`);

                            simulateUltraHumanClick(checkboxInput, (success) => {
                                console.log(`[Turnstile DEBUG] ${success ? '✅ Ultra-human click succeeded' : '❌ Click failed - trying keyboard fallback'}`);

                                if (!success) {
                                    // Fallback to keyboard interaction
                                    simulateKeyboardInteraction(checkboxInput, (kbdSuccess) => {
                                        if (!kbdSuccess) {
                                            console.warn(`[Turnstile DEBUG] ❌ Both mouse and keyboard interactions failed.`);
                                        }
                                    });
                                }

                                // Success detection (unchanged)
                                const checkSuccess = () => {
                                    const successEl = checkboxInput.getRootNode().querySelector('#success');
                                    if (successEl && getComputedStyle(successEl).display !== 'none') return true;
                                    const responseField = document.querySelector(`[name="cf-turnstile-response"]`);
                                    if (responseField && responseField.value.trim().length > 0) return true;
                                    return false;
                                };

                                const timerSuccess = setInterval(() => {
                                    if (checkSuccess()) {
                                        clearInterval(timerSuccess);
                                        window.solvedCaptcha = true;
                                        chrome.runtime.sendMessage({ captchaPassed: true });
                                        console.log(`[Turnstile DEBUG] 🟢 CAPTCHA solved successfully.`);
                                    }
                                }, 1000);

                                setTimeout(() => clearInterval(timerSuccess), 30000);
                            });
                        };

                        if (checkboxInput.disabled) {
                            console.warn(`[Turnstile DEBUG] ⏳ Checkbox is disabled. Waiting for enable...`);
                            const waitInterval = setInterval(() => {
                                if (!checkboxInput.disabled) {
                                    clearInterval(waitInterval);
                                    proceedToClick();
                                }
                            }, 200);
                            setTimeout(() => clearInterval(waitInterval), 5000);
                            continue;
                        }

                        // Always scroll to ensure element is in view (even if technically "in view" already)
                        console.log(`[Turnstile DEBUG] 📜 Ensuring element is scrolled into view...`);
                        checkboxInput.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

                        // Wait for scroll to complete before proceeding
                        setTimeout(() => {
                            // Verify element is now properly positioned
                            const rect = checkboxInput.getBoundingClientRect();
                            if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                                console.log(`[Turnstile DEBUG] ✅ Element is now properly positioned in viewport.`);
                            } else {
                                console.warn(`[Turnstile DEBUG] ⚠️ Element may still be partially out of view.`);
                            }

                            proceedToClick();
                        }, 1000 + Math.random() * 500); // Wait 1-1.5 seconds for scroll + render
                        return true;
                    }
                }
            }
        }
    }

    console.log(`[Turnstile DEBUG] 🔄 Falling back to recursive Shadow DOM search...`);
    const turnstileContainers = findAllElementsInShadowDOM('.cf-turnstile, [data-widget-id], .cb-c, .cb-lb-t');
    if (turnstileContainers.length === 0) {
        console.log(`[Turnstile DEBUG] ❌ No Turnstile containers found in Shadow DOM.`);
        return false;
    }

    console.log(`[Turnstile DEBUG] 🎯 Found ${turnstileContainers.length} potential Turnstile container(s) via recursive search.`);
    for (let container of turnstileContainers) {
        if (container.hasAttribute('data-turnstile-handled')) continue;
        container.setAttribute('data-turnstile-handled', 'true');

        const humanLabel = container.querySelector?.('.cb-lb-t') ||
            (container.classList?.contains('cb-lb-t') ? container : null);
        if (!humanLabel) {
            console.log(`[Turnstile DEBUG] ❓ Human label not found in container. Skipping.`);
            continue;
        }

        console.log(`[Turnstile DEBUG] ✅ Found human label:`, humanLabel.textContent?.trim());
        const checkboxContainer = humanLabel.closest?.('.cb-c') || container;
        const checkboxInput = checkboxContainer.querySelector('input[type="checkbox"]');
        if (!checkboxInput) {
            console.warn(`[Turnstile DEBUG] ❌ Checkbox input not found.`);
            continue;
        }

        const proceedToClick = () => {
            console.log(`[Turnstile DEBUG] 🖱️ Initiating ultra-human interaction sequence...`);
            simulateUltraHumanClick(checkboxInput, (success) => {
                console.log(`[Turnstile DEBUG] ${success ? '✅ Ultra-human click succeeded' : '❌ Click failed - trying keyboard fallback'}`);
                if (!success) {
                    simulateKeyboardInteraction(checkboxInput, (kbdSuccess) => {
                        if (!kbdSuccess) {
                            console.warn(`[Turnstile DEBUG] ❌ Both mouse and keyboard interactions failed.`);
                        }
                    });
                }

                const checkSuccess = () => {
                    const successEl = checkboxInput.getRootNode().querySelector('#success');
                    if (successEl && getComputedStyle(successEl).display !== 'none') return true;
                    const responseField = document.querySelector(`[name="cf-turnstile-response"]`);
                    if (responseField && responseField.value.trim().length > 0) return true;
                    return false;
                };

                const timerSuccess = setInterval(() => {
                    if (checkSuccess()) {
                        clearInterval(timerSuccess);
                        window.solvedCaptcha = true;
                        chrome.runtime.sendMessage({ captchaPassed: true });
                        console.log(`[Turnstile DEBUG] 🟢 CAPTCHA solved successfully.`);
                    }
                }, 1000);

                setTimeout(() => clearInterval(timerSuccess), 30000);
            });
        };

        if (checkboxInput.disabled) {
            console.warn(`[Turnstile DEBUG] ⏳ Checkbox is disabled. Waiting for enable...`);
            const waitInterval = setInterval(() => {
                if (!checkboxInput.disabled) {
                    clearInterval(waitInterval);
                    proceedToClick();
                }
            }, 200);
            setTimeout(() => clearInterval(waitInterval), 5000);
            continue;
        }

        // Always scroll to ensure element is in view (even if technically "in view" already)
        console.log(`[Turnstile DEBUG] 📜 Ensuring element is scrolled into view...`);
        checkboxInput.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        // Wait for scroll to complete before proceeding
        setTimeout(() => {
            // Verify element is now properly positioned
            const rect = checkboxInput.getBoundingClientRect();
            if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                console.log(`[Turnstile DEBUG] ✅ Element is now properly positioned in viewport.`);
            } else {
                console.warn(`[Turnstile DEBUG] ⚠️ Element may still be partially out of view.`);
            }

            proceedToClick();
        }, 1000 + Math.random() * 500); // Wait 1-1.5 seconds for scroll + render
        return true;
    }
    return false;
}

function handleTurnstileInIframe() {
    console.log(`[Turnstile DEBUG] 🔍 Starting Turnstile handler...`);

    if (!chrome?.dom?.openOrClosedShadowRoot) {
        console.warn('[Turnstile DEBUG] ❌ chrome.dom.openOrClosedShadowRoot not available');
        return false;
    }

    const turnstileIframes = Array.from(document.querySelectorAll('iframe'))
        .filter(iframe => {
            const match = iframe.src.includes('challenges.cloudflare.com') && iframe.src.includes('/turnstile/');
            if (match) console.log(`[Turnstile DEBUG] 🎯 Found potential Turnstile iframe:`, iframe.src);
            return match;
        });

    if (turnstileIframes.length === 0) {
        console.log(`[Turnstile DEBUG] ❌ No Turnstile iframe found.`);
        return false;
    }

    let handled = false;
    turnstileIframes.forEach(iframe => {
        if (iframe.hasAttribute('data-turnstile-handled')) {
            console.log(`[Turnstile DEBUG] 🔄 Skipping already handled iframe:`, iframe.src);
            return;
        }
        iframe.setAttribute('data-turnstile-handled', 'true');
        console.log(`[Turnstile DEBUG] 🧭 Processing iframe:`, iframe.src);

        const onLoadHandler = () => {
            console.log(`[Turnstile DEBUG] 🚀 iframe 'load' event fired. Checking contentDocument...`);
            try {
                if (!iframe.contentDocument) {
                    console.warn(`[Turnstile DEBUG] ❌ iframe.contentDocument is null or inaccessible.`);
                    return;
                }
                if (iframe.contentDocument.location.href === 'about:blank') {
                    console.warn(`[Turnstile DEBUG] ⚠️ iframe still points to 'about:blank'. Waiting...`);
                    setTimeout(onLoadHandler, 500);
                    return;
                }

                const resolveShadow = (root) => chrome.dom.openOrClosedShadowRoot(root) || root;
                const iframeDoc = resolveShadow(iframe.contentDocument);
                console.log(`[Turnstile DEBUG] 🔮 Shadow root resolved?`, iframeDoc !== iframe.contentDocument ? 'Yes' : 'No');

                const waitForElement = (selector, callback, maxRetries = 15, delay = 500) => {
                    const check = (retries) => {
                        const el = iframeDoc.querySelector(selector);
                        if (el) callback(el);
                        else if (retries > 0) setTimeout(() => check(retries - 1), delay);
                        else console.warn(`[Turnstile DEBUG] ❌ Element ${selector} not found after ${maxRetries} retries.`);
                    };
                    check(maxRetries);
                };

                waitForElement('.cb-lb-t', (humanLabel) => {
                    console.log(`[Turnstile DEBUG] ✅ Found human label:`, humanLabel.textContent.trim());
                    const checkboxContainer = humanLabel.closest('.cb-c');
                    if (!checkboxContainer) {
                        console.warn(`[Turnstile DEBUG] ❌ Could not find container (.cb-c) for label.`);
                        return;
                    }
                    const checkboxInput = checkboxContainer.querySelector('input[type="checkbox"]');
                    if (!checkboxInput) {
                        console.warn(`[Turnstile DEBUG] ❌ Checkbox input not found inside container.`);
                        return;
                    }

                    const proceedToClick = () => {
                        console.log(`[Turnstile DEBUG] ✅ All conditions met. Initiating ultra-human interaction...`);

                        // Scroll within iframe
                        checkboxInput.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        setTimeout(() => {
                            simulateUltraHumanClick(checkboxInput, (success) => {
                                console.log(`[Turnstile DEBUG] ${success ? '✅ Ultra-human click succeeded' : '❌ Click failed - trying keyboard fallback'}`);

                                if (!success) {
                                    simulateKeyboardInteraction(checkboxInput, (kbdSuccess) => {
                                        if (!kbdSuccess) {
                                            console.warn(`[Turnstile DEBUG] ❌ Both mouse and keyboard interactions failed.`);
                                        }
                                    });
                                }

                                const checkSuccess = () => {
                                    const successEl = iframeDoc.querySelector('#success');
                                    if (successEl && getComputedStyle(successEl).display !== 'none') return true;
                                    const responseField = document.querySelector(`[name="cf-turnstile-response"]`);
                                    if (responseField && responseField.value.trim().length > 0) return true;
                                    return false;
                                };

                                const timerSuccess = setInterval(() => {
                                    if (checkSuccess()) {
                                        clearInterval(timerSuccess);
                                        window.solvedCaptcha = true;
                                        chrome.runtime.sendMessage({ captchaPassed: true });
                                        console.log(`[Turnstile DEBUG] 🟢 CAPTCHA solved successfully.`);
                                        handled = true;
                                    }
                                }, 1000);

                                setTimeout(() => clearInterval(timerSuccess), 30000);
                            });
                        }, 500 + Math.random() * 500);
                    };

                    if (checkboxInput.disabled) {
                        console.warn(`[Turnstile DEBUG] ❌ Checkbox is disabled. Waiting...`);
                        const enableCheck = setInterval(() => {
                            if (!checkboxInput.disabled) {
                                clearInterval(enableCheck);
                                proceedToClick();
                            }
                        }, 200);
                        setTimeout(() => clearInterval(enableCheck), 5000);
                        return;
                    }

                    // Always scroll to ensure element is in view (even if technically "in view" already)
                    console.log(`[Turnstile DEBUG] 📜 Ensuring element is scrolled into view...`);
                    checkboxInput.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

                    // Wait for scroll to complete before proceeding
                    setTimeout(() => {
                        // Verify element is now properly positioned
                        const rect = checkboxInput.getBoundingClientRect();
                        if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                            console.log(`[Turnstile DEBUG] ✅ Element is now properly positioned in viewport.`);
                        } else {
                            console.warn(`[Turnstile DEBUG] ⚠️ Element may still be partially out of view.`);
                        }

                        proceedToClick();
                    }, 1000 + Math.random() * 500); // Wait 1-1.5 seconds for scroll + render
                }, 15);
            } catch (e) {
                console.error(`[Turnstile DEBUG] 💥 Error during iframe handling:`, e.message);
            }
        };

        if (iframe.complete || iframe.contentDocument?.readyState === 'complete') {
            console.log(`[Turnstile DEBUG] 🟡 iframe appears pre-loaded. Processing immediately...`);
            onLoadHandler();
        } else {
            console.log(`[Turnstile DEBUG] ⏳ Adding 'load' listener to iframe...`);
            iframe.addEventListener('load', onLoadHandler, { once: true });
        }
    });
    return handled;
}

// Keep your original helper functions
function isScrolledIntoView(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom >= 0;
}

true;