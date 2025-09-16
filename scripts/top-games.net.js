async function vote(first) {
    if (first === false) return;

    if (isVisibleElement(document.querySelector('.fc-dialog-container'))) {
        chrome.runtime.sendMessage({ requiredConfirmTOS: true });
        await new Promise(resolve => {
            const timer2 = setInterval(() => {
                if (!document.querySelector('.fc-dialog-container')) {
                    clearInterval(timer2);
                    resolve();
                }
            }, 1000);
        });
    }

    console.log("[DEBUG] Page HTML contains Turnstile:", document.body.innerHTML.includes('cf-turnstile-response'));
    console.log("[DEBUG] Turnstile container:", document.querySelector('.turnstile-container')?.outerHTML);
    
    // Check for Turnstile-specific elements
    const turnstileWidget = document.querySelector('.cf-turnstile, [data-widget-id], [name="cf-turnstile-response"]');
    if (turnstileWidget) {
        console.log("[DEBUG] Found Turnstile widget");
    }

    // Если успешное авто-голосование
    if (window.location.href.endsWith('/success')) {
        chrome.runtime.sendMessage({ successfully: true });
        return;
    }

    // Если есть предупреждение
    if (document.getElementById('digitalCountdown') != null) {
        const numbers = document.getElementById('digitalCountdown').textContent.match(/\d+/g).map(Number);
        const milliseconds = (numbers[0] * 60 * 60 * 1000) + (numbers[1] * 60 * 1000) + (numbers[2] * 1000); 
        chrome.runtime.sendMessage({ later: Date.now() + milliseconds });
        return;
    } 

    // Если есть ошибка
    for (const el of document.querySelectorAll('div.alert.alert-danger')) {
        const request = { message: el.innerText };

        if (
            request.message.includes('cannot vote more than once at the same time') ||
            request.message.includes('avant de pouvoir voter à nouveau')
        ) {
            chrome.runtime.sendMessage({ later: true });
            return;
        } else if (request.message.includes('Captcha')) {
            // We'll handle captcha via content.js — do nothing here
            continue;
        } else if (
            request.message.includes('Sie können nicht wählen, weil Ihr Netzwerk kein') ||
            request.message.includes('cannot vote because your network') ||
            request.message.includes('не можете голосовать из-за того, что находитесь в частной или закрытой сети') ||
            request.message.includes('não pode votar porque sua rede não é uma rede') ||
            request.message.includes('ne pouvez pas voter car votre réseau n\'est pas un réseau') ||
            request.message.includes('puedes votar porque tu red no es una red')
        ) {
            request.ignoreReport = true;
        }

        chrome.runtime.sendMessage(request);
        return;
    }

    if (document.getElementById('playername') != null) {
        const project = await getProject();
        document.getElementById('playername').value = project.nick;
    }

    // ==================== WAIT FOR CAPTCHA TO BE SOLVED ====================
    let captchaSolved = false;

    // Special handling for Cloudflare Turnstile
    function checkTurnstileSolved() {
        // Check for hidden response field with value
        const turnstileResponse = document.querySelector('[name="cf-turnstile-response"]');
        if (turnstileResponse && turnstileResponse.value && turnstileResponse.value.length > 0) {
            return true;
        }
        
        // Check for success indicator classes
        const successIndicators = document.querySelectorAll('.cf-turnstile-success, .turnstile-success, [data-state="solved"]');
        for (let indicator of successIndicators) {
            if (indicator.offsetParent !== null) {
                return true;
            }
        }
        
        return false;
    }

    // Listen for captchaPassed message from content.js
    const captchaListener = (message, sender, sendResponse) => {
        if (message.captchaPassed === true || message.captchaPassed === 'double') {
            console.log("[VOTE] CAPTCHA solved! Proceeding to submit vote.");
            captchaSolved = true;
            chrome.runtime.onMessage.removeListener(captchaListener);
        }
    };
    chrome.runtime.onMessage.addListener(captchaListener);

    // Also check if CAPTCHA was already solved before
    if (window.__captchaExt?.solvedCaptcha) {
        console.log("[VOTE] CAPTCHA was already solved. Proceeding immediately.");
        captchaSolved = true;
    }

    // Check specifically for Turnstile being solved
    if (!captchaSolved && document.querySelector('.cf-turnstile, [data-widget-id]')) {
        console.log("[VOTE] Checking if Turnstile is already solved...");
        if (checkTurnstileSolved()) {
            console.log("[VOTE] Turnstile already solved!");
            captchaSolved = true;
        }
    }

    // If not solved yet, wait for it
    if (!captchaSolved) {
        console.log("[VOTE] Waiting for CAPTCHA to be solved...");

        // // Optional: timeout after 60s
        // const timeoutId = setTimeout(() => {
        //     console.warn("[VOTE] Timeout waiting for CAPTCHA solve.");
        //     chrome.runtime.onMessage.removeListener(captchaListener);
        // }, 60000);

        // Wait until captchaSolved becomes true
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                // Check both the general captcha solution and Turnstile-specific solution
                if (captchaSolved || checkTurnstileSolved()) {
                    if (checkTurnstileSolved()) {
                        console.log("[VOTE] Turnstile solved by direct check!");
                        captchaSolved = true;
                    }
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve();
                }
            }, 500);
        });
    }

    // ==================== NOW CLICK SUBMIT BUTTON ====================
    console.log("[VOTE] Clicking #btnSubmitVote...");

    // Enable button if disabled
    const submitBtn = document.getElementById('btnSubmitVote');
    if (submitBtn?.disabled) {
        console.log("[VOTE] Button is disabled. Waiting for enable...");
        await new Promise(resolve => {
            const enableCheck = setInterval(() => {
                if (submitBtn && !submitBtn.disabled) {
                    clearInterval(enableCheck);
                    resolve();
                }
            }, 500);
        });
    }

    // Finally click
    if (submitBtn) {
        // Double-check Turnstile is solved right before submitting
        if (document.querySelector('.cf-turnstile, [data-widget-id]') && !checkTurnstileSolved()) {
            console.warn("[VOTE] Turnstile may not be fully solved yet, waiting a bit longer...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        submitBtn.click();
        console.log("[VOTE] Vote submitted!");
    } else {
        console.error("[VOTE] Submit button not found!");
    }
}