// Namespace to avoid polluting window
window.__captchaExt = window.__captchaExt || {
    loadedCaptcha: false,
    solvedCaptcha: false,
    dontSolve: false
};

// Configurable intervals
const CHECK_INTERVAL = 1000;      // General check interval
const BUSTER_INTERVAL = 2000;     // Buster-specific check interval
const MAX_WAIT_TIME = 30000;      // Max 30s per challenge type before timeout

chrome.runtime.onMessage.addListener(function(request) {
    if (request.sendProject) {
        if (!window.__captchaExt.loadedCaptcha) {
            window.__captchaExt.loadedCaptcha = true;
            if (request.settings?.disabledClickCaptcha) {
                window.__captchaExt.dontSolve = true;
            }
            run();
        } else if (window.__captchaExt.solvedCaptcha) {
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

    // URL pattern helpers
    const isRecaptchaAnchor = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api\d|enterprise)\/anchor/.test(url);
    const isRecaptchaBFrame = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api\d|enterprise)\/bframe/.test(url);
    const isRecaptchaFallback = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api|enterprise)\/fallback/.test(url);
    const isHCaptcha = url.includes('.hcaptcha.com/captcha.v');
    const isCloudflare = url.startsWith('https://challenges.cloudflare.com') || 
                         /.*cloudflare\.com.*__cf_chl.*/.test(url);
    const isTurnstile = document.querySelector('.cf-turnstile, [name="cf-turnstile-response"], iframe[src*="challenges.cloudflare.com"]') !== null;

    if (isRecaptchaAnchor) {
        handleReCaptchaAnchor();
    } else if (isRecaptchaBFrame && !document.querySelector('head > yandex-captcha-solver')) {
        handleReCaptchaBFrame();
    } else if (isRecaptchaFallback) {
        handleReCaptchaFallback();
    } else if (isHCaptcha) {
        handleHCaptcha();
    } else if (isCloudflare || isTurnstile) {
        handleCloudflareOrTurnstile();
    }
}

function handleReCaptchaAnchor() {
    const timer1 = setInterval(() => {
        if (window.__captchaExt.dontSolve || document.querySelector('head > captcha-widgets')) {
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
                window.__captchaExt.solvedCaptcha = true;
                chrome.runtime.sendMessage({ captchaPassed: true });
                return;
            }

            if (errorMsg && errorMsg.style.display !== 'none' && errorMsg.textContent.trim().length > 0) {
                const text = errorMsg.textContent.trim();
                if (text.includes('Try reloading the page')) {
                    location.reload();
                } else if (!/время проверки истекло|Verification (challenge )?expired|La validation a expiré|Platnost výzvy ověření vypršela|verificación caducó/i.test(text)) {
                    chrome.runtime.sendMessage({ errorCaptcha: text });
                    clearInterval(timer2);
                }
            }
        }, CHECK_INTERVAL);
    }, CHECK_INTERVAL);
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
    }, BUSTER_INTERVAL);

    const timer3 = setInterval(() => {
        if (!document.getElementById("solver-button") && document.getElementById("rc-imageselect")) {
            chrome.runtime.sendMessage({ captcha: true });
            clearInterval(timer3);
        }
    }, CHECK_INTERVAL);
}

function handleReCaptchaFallback() {
    chrome.runtime.sendMessage({
        errorCaptcha: document.body.innerText.trim(),
        restartVote: true
    });
}

function handleHCaptcha() {
    const timer4 = setInterval(() => {
        if (window.__captchaExt.dontSolve || document.querySelector('head > captcha-widgets')) {
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
                window.__captchaExt.solvedCaptcha = true;
                chrome.runtime.sendMessage({ captchaPassed: true });
            }
        }, CHECK_INTERVAL);

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
        }, CHECK_INTERVAL);

        const timer9 = setInterval(() => {
            const status = document.querySelector('#status');
            if (status && status.style.display !== 'none' && status.innerText.trim().length > 3) {
                chrome.runtime.sendMessage({ errorCaptcha: status.innerText.trim() });
                clearInterval(timer9);
            }
        }, CHECK_INTERVAL);
    }, CHECK_INTERVAL);
}

function handleCloudflareOrTurnstile() {
    // Handle Cloudflare Turnstile (modern)
    if (handleTurnstile()) {
        return;
    }

    // Handle legacy Cloudflare challenges
    handleLegacyCloudflare();
}

function handleTurnstile() {
    // Check if already solved
    const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
    if (turnstileResponse && turnstileResponse.value && turnstileResponse.value.length > 0) {
        console.log("[TURNSTILE] Response field already populated");
        markTurnstileAsSolved();
        return true;
    }

    // Look for Turnstile widget
    const turnstileWidgets = document.querySelectorAll('.cf-turnstile, [data-widget-id]');
    if (turnstileWidgets.length === 0) {
        return false; // Not Turnstile, fall back to legacy
    }

    console.log("[TURNSTILE] Found Turnstile widget(s)");

    // Set up observers for dynamic changes
    setupTurnstileObservers();

    // Try to click any visible interactive element
    for (let widget of turnstileWidgets) {
        const clickableElements = [
            widget.querySelector('input[type="checkbox"]'),
            widget.querySelector('[role="checkbox"]'),
            widget.querySelector('span.ctp-checkbox-label'),
            ...Array.from(widget.querySelectorAll('div[tabindex="0"]')).filter(el => 
                el && !el.disabled && el.offsetParent !== null && isScrolledIntoView(el)
            )
        ].filter(Boolean);

        for (let element of clickableElements) {
            if (isScrolledIntoView(element)) {
                console.log("[TURNSTILE] Clicking interactive element");
                element.click();
                return true;
            }
        }
    }

    return true; // We identified it as Turnstile, observers will handle completion
}

function setupTurnstileObservers() {
    // Observe response field
    const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
    if (turnstileResponse) {
        const responseObserver = new MutationObserver(() => {
            if (turnstileResponse.value && turnstileResponse.value.length > 0) {
                console.log("[TURNSTILE] Response field populated via observer");
                responseObserver.disconnect();
                markTurnstileAsSolved();
            }
        });
        responseObserver.observe(turnstileResponse, { attributes: true, attributeFilter: ['value'] });
    }

    // Observe widget state changes
    const turnstileWidgets = document.querySelectorAll('.cf-turnstile, [data-widget-id]');
    for (let widget of turnstileWidgets) {
        const widgetObserver = new MutationObserver((mutations) => {
            // Check for solved state
            if (widget.getAttribute('data-state') === 'solved' || 
                widget.classList.contains('success') || 
                widget.classList.contains('is-success')) {
                console.log("[TURNSTILE] Widget marked as solved via mutation");
                widgetObserver.disconnect();
                markTurnstileAsSolved();
            }
        });
        widgetObserver.observe(widget, { attributes: true, childList: true, subtree: true });
    }
}

function markTurnstileAsSolved() {
    window.__captchaExt.solvedCaptcha = true;
    chrome.runtime.sendMessage({ captchaPassed: true });
}

function handleLegacyCloudflare() {
    // Recursive shadow root resolver
    function findInShadow(selector, root = document) {
        const el = root.querySelector(selector);
        if (el) return el;
        const allElements = root.querySelectorAll('*');
        for (let node of allElements) {
            if (node.shadowRoot) {
                const found = findInShadow(selector, node.shadowRoot);
                if (found) return found;
            }
        }
        return null;
    }

    // =============== HANDLE CLOUDFLARE CHECKBOX ("I am human") ===============
    const timerCheckbox = setInterval(() => {
        let checkbox = null;

        // Method 1: Label says "I am human" → find associated input
        const labels = Array.from(document.querySelectorAll('label')).filter(l =>
            /I am human|Я человек|Je suis humain|Ich bin ein Mensch|Soy humano/i.test(l.textContent)
        );
        for (let label of labels) {
            const id = label.getAttribute('for');
            if (id) {
                checkbox = document.getElementById(id);
            } else {
                checkbox = label.querySelector('input[type="checkbox"]');
            }
            if (checkbox && isScrolledIntoView(checkbox) && checkbox.offsetParent !== null && !checkbox.disabled) {
                break;
            }
        }

        // Method 2: Text near checkbox implies it's the human verification
        if (!checkbox) {
            const humanTexts = Array.from(document.querySelectorAll('span, div, p')).filter(el =>
                /I am human|Я человек|Je suis humain|Ich bin ein Mensch|Soy humano/i.test(el.textContent)
            );
            for (let textEl of humanTexts) {
                const container = textEl.closest('.widget, .challenge-form, .challenge-container, form');
                if (container) {
                    checkbox = container.querySelector('input[type="checkbox"]:not([disabled])');
                    if (checkbox && isScrolledIntoView(checkbox) && checkbox.offsetParent !== null) {
                        break;
                    }
                }
            }
        }

        // Method 3: Fallback common selectors
        if (!checkbox) {
            const selectors = [
                '#cf-chl-widget-checkbox',
                'input[type="checkbox"][name="cf-challenge"]',
                '.challenge-form input[type="checkbox"]',
                'input[type="checkbox"]'
            ];
            for (let sel of selectors) {
                const candidates = document.querySelectorAll(sel);
                for (let el of candidates) {
                    if (
                        isScrolledIntoView(el) &&
                        el.offsetParent !== null &&
                        !el.disabled &&
                        (el.offsetWidth > 0 || el.offsetHeight > 0)
                    ) {
                        checkbox = el;
                        break;
                    }
                }
                if (checkbox) break;
            }
        }

        if (checkbox) {
            clearInterval(timerCheckbox);
            console.log('[Cloudflare] Checkbox clicked.');
            checkbox.click();

            // Monitor for success
            const timerSuccess = setInterval(() => {
                const success = findInShadow('#success') || findInShadow('.challenge-success') || findInShadow('.fbc-success');
                if (
                    (success && (success.style.display !== 'none' || success.offsetHeight > 0)) ||
                    window.location.search.includes('__cf_chl') ||
                    /turnstile|captcha-success/.test(document.body.className)
                ) {
                    clearInterval(timerSuccess);
                    window.__captchaExt.solvedCaptcha = true;
                    chrome.runtime.sendMessage({ captchaPassed: true });
                }
            }, CHECK_INTERVAL);

            setTimeout(() => clearInterval(timerSuccess), MAX_WAIT_TIME);
        }
    }, CHECK_INTERVAL);

    // =============== HANDLE INTERACTIVE CHALLENGE (“Click the mark”) ===============
    const timerMark = setInterval(() => {
        const mark = findInShadow('#cf-norobot-container span.mark') || findInShadow('#challenge-stage span.mark');
        if (mark && isScrolledIntoView(mark) && mark.offsetParent !== null) {
            clearInterval(timerMark);
            console.log('[Cloudflare] Mark clicked.');
            mark.click();

            const timerSuccess = setInterval(() => {
                const success = findInShadow('#success') || findInShadow('.challenge-success') || findInShadow('.fbc-success');
                if (
                    (success && (success.style.display !== 'none' || success.offsetHeight > 0)) ||
                    window.location.search.includes('__cf_chl') ||
                    /turnstile|captcha-success/.test(document.body.className)
                ) {
                    clearInterval(timerSuccess);
                    window.__captchaExt.solvedCaptcha = true;
                    chrome.runtime.sendMessage({ captchaPassed: true });
                }
            }, CHECK_INTERVAL);

            setTimeout(() => clearInterval(timerSuccess), MAX_WAIT_TIME);
        }
    }, CHECK_INTERVAL);

    // =============== GLOBAL TIMEOUT GUARD ===============
    setTimeout(() => {
        clearInterval(timerCheckbox);
        clearInterval(timerMark);
    }, MAX_WAIT_TIME);
}

function isScrolledIntoView(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom >= 0;
}

// Return truthy value to prevent "Receiving end does not exist" in executeScript
true;