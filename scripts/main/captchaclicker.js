// ============================
// Captcha Assistant (Complete & Integrated, improved)
// - Scaffolding: Single orchestrator, single MutationObserver, IntersectionObserver,
//                exponential backoff, official MAIN-world callback hooks,
//                centralized success check, robust teardown, token watchers.
// - Integration: Aggressive auto-solve first (your code), then passive assist fallback.
// - Solvers: Your click/movement functions kept as-is (only minor timer tracking).
// ============================

// ---- Global flags ----
window.dontSolve = window.dontSolve ?? false;
window.solvedCaptcha = window.solvedCaptcha ?? false;
window.loadedCaptcha = window.loadedCaptcha ?? false;

// ---- Debug & State ----
const DEBUG = true;
const dbg = (...a) => DEBUG && console.log('[CAPTCHA Assist]', ...a);

const CAP = {
  running: false,
  solved: false,
  retries: 0,
  maxRetries: 8,
  backoffMs: 400,
  startedAt: 0,
  mo: null,        // MutationObserver (DOM)
  io: null,        // IntersectionObserver (visibility)
  tokenMO: null,   // MutationObserver (token value changes)
  ioTargets: new Set(),
  timers: new Set(),
  addTimer(id) { this.timers.add(id); return id; },
  clearTimers() {
    this.timers.forEach((t) => { try { clearInterval(t); clearTimeout(t); } catch {} });
    this.timers.clear();
  },
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const onIdle = (timeout = 250) =>
  new Promise((res) =>
    (window.requestIdleCallback ? requestIdleCallback(res, { timeout }) : setTimeout(res, timeout))
  );

// ---- Unified Success & Teardown ----
function hasAnySolution(root = document) {
  // Turnstile
  const ts = document.querySelector('[name="cf-turnstile-response"]');
  if (ts?.value?.trim()) return true;
  // reCAPTCHA
  const gre = document.getElementById('g-recaptcha-response');
  if (gre?.value?.trim()) return true;
  // hCaptcha
  const hc = document.querySelector('[name="h-captcha-response"], textarea[name="h-captcha-response"]');
  if (hc?.value?.trim()) return true;
  // Some widgets expose a #success node
  const suc = root.querySelector?.('#success');
  if (suc && getComputedStyle(suc).display !== 'none') return true;
  return false;
}

function markSolved() {
  if (CAP.solved) return;
  CAP.solved = true;
  window.solvedCaptcha = true;
  const t = Math.round(performance.now() - CAP.startedAt);
  dbg(`✅ Solved via token/flag. TTS: ${t}ms`);
  teardown();
  try { chrome.runtime.sendMessage({ captchaPassed: true }); } catch {}
}

function teardown() {
  CAP.running = false;
  CAP.clearTimers();
  if (CAP.mo) { CAP.mo.disconnect(); CAP.mo = null; }
  if (CAP.io) { CAP.io.disconnect(); CAP.io = null; }
  if (CAP.tokenMO) { CAP.tokenMO.disconnect(); CAP.tokenMO = null; }
  CAP.ioTargets.clear();
  dbg('Teardown complete.');
}

// Clean up on nav
window.addEventListener('pagehide', teardown);
window.addEventListener('beforeunload', teardown);

// ---- Token Watchers (instant success on value change) ----
function ensureTokenWatchers() {
  if (CAP.tokenMO) return;
  const isResponseInput = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const n = (el.getAttribute?.('name') || '').toLowerCase();
    return n === 'cf-turnstile-response' || n === 'g-recaptcha-response' || n === 'h-captcha-response';
  };
  CAP.tokenMO = new MutationObserver((records) => {
    if (CAP.solved) return;
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName === 'value' && isResponseInput(r.target)) {
        const val = r.target.value?.trim?.() || '';
        if (val) {
          dbg('Token watcher: value set on', r.target.getAttribute('name'));
          markSolved();
          break;
        }
      }
    }
  });
  CAP.tokenMO.observe(document.documentElement || document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['value'],
  });
  dbg('Token MutationObserver armed.');
}

// ---- Assistive Functions (Passive Mode) ----
function assistFocus(el) {
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    setTimeout(() => { try { el.focus({ preventScroll: true }); } catch {} }, 100);
    const box = el.closest?.('.cb-c, .cf-turnstile') || el;
    box.style.outline = '2px solid #4f8cff';
    box.style.outlineOffset = '2px';
    setTimeout(() => { box.style.outline = ''; box.style.outlineOffset = ''; }, 2500);
  } catch {}
}

function ensureIO() {
  if (CAP.io) return CAP.io;
  CAP.io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) assistFocus(e.target);
    }
  }, { threshold: 0.2, rootMargin: '100px 0px 100px 0px' });
  return CAP.io;
}

// ---- MAIN-world callback hooks (no clicking) ----
function injectCallbackHooks() {
  const src = `
    (function(){
      const post = (k,t)=>{try{window.postMessage({__captcha__:k,token:t},'*')}catch(e){}};
      // Turnstile
      const pTS=()=>{const w=window,r=w.turnstile?.render;
        if(typeof r==='function'&&!r.__patched){
          w.turnstile.render=function(e,o){
            if(o&&typeof o.callback==='function'){
              const t=o.callback;o=Object.assign({},o,{callback:(n)=>{post('turnstile',n);return t(n);}});
            }
            const id=r.apply(this,[e,o]);
            try{const tok=w.turnstile.getResponse?.(id);if(tok)post('turnstile',tok);}catch(e){}
            return id;
          }; w.turnstile.render.__patched=true;
        }};
      pTS(); const tsi=setInterval(pTS,1000); setTimeout(()=>clearInterval(tsi),10000);

      // reCAPTCHA
      const pGRE=()=>{const w=window,r=w.grecaptcha?.render;
        if(typeof r==='function'&&!r.__patched){
          w.grecaptcha.render=function(e,o){
            if(o&&typeof o.callback==='function'){
              const t=o.callback;o.callback=function(n){post('recaptcha',n);return t(n);};
            }
            return r.apply(this,arguments);
          }; w.grecaptcha.render.__patched=true;
        }};
      pGRE(); const gri=setInterval(pGRE,1000); setTimeout(()=>clearInterval(gri),10000);

      // hCaptcha
      const pHC=()=>{const w=window,r=w.hcaptcha?.render;
        if(typeof r==='function'&&!r.__patched){
          w.hcaptcha.render=function(e,o){
            if(o&&typeof o.callback==='function'){
              const t=o.callback;o.callback=function(n){post('hcaptcha',n);return t(n);};
            }
            return r.apply(this,arguments);
          }; w.hcaptcha.render.__patched=true;
        }};
      pHC(); const hci=setInterval(pHC,1000); setTimeout(()=>clearInterval(hci),10000);
    })();
  `;
  const s = document.createElement('script');
  s.textContent = src;
  (document.documentElement || document.head || document.body).appendChild(s);
  s.remove();

  const onMsg = (e) => {
    if (e.source === window && e.data?.__captcha__ && e.data.token) {
      dbg('Token via official callback:', e.data.__captcha__);
      markSolved();
      window.removeEventListener('message', onMsg, false);
    }
  };
  window.addEventListener('message', onMsg, false);
}

// ---- Visibility Gating ----
function waitDocumentVisible() {
  if (document.visibilityState === 'visible') return Promise.resolve();
  return new Promise((res) => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', onVis);
        res();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    // safety timeout
    CAP.addTimer(setTimeout(() => {
      document.removeEventListener('visibilitychange', onVis);
      res();
    }, 3000));
  });
}

// ---- Turnstile: Orchestrator Stage 2 (Passive Assist) ----
async function startTurnstileAssistOrchestrator() {
  if (window.dontSolve || CAP.running || CAP.solved) return;
  CAP.running = true;
  CAP.retries = 0; CAP.backoffMs = 400;
  CAP.startedAt = performance.now();

  // Small idle/visibility gating
  await onIdle(250);
  await waitDocumentVisible();

  injectCallbackHooks();
  ensureTokenWatchers();

  if (await assistTurnstileOnce()) return;

  if (!CAP.mo) {
    CAP.mo = new MutationObserver(async (mutations) => {
      if (CAP.solved || !mutations.some(m => m.addedNodes?.length)) return;
      if (CAP.retries >= CAP.maxRetries) return;
      CAP.retries++;
      const wait = Math.min(3000, CAP.backoffMs * Math.pow(1.5, CAP.retries - 1));
      dbg(`Turnstile assist retry ${CAP.retries}/${CAP.maxRetries} after ${Math.round(wait)}ms…`);
      CAP.addTimer(setTimeout(async () => { if (!CAP.solved) await assistTurnstileOnce(); }, wait));
    });
    CAP.mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    dbg('Turnstile assist observer armed.');
  }

  CAP.addTimer(setTimeout(() => {
    if (!CAP.solved) { dbg('Turnstile timeout.'); teardown(); }
  }, 30000));
}

async function assistTurnstileOnce() {
  if (hasAnySolution()) { markSolved(); return true; }

  // Candidates (DOM + shallow shadow)
  const set = new Set();
  document.querySelectorAll('.cf-turnstile, [data-widget-id], .cb-c, .cb-lb-t').forEach(el => set.add(el));
  document.querySelectorAll('*').forEach(n => { if (n.shadowRoot) n.shadowRoot.querySelectorAll('.cf-turnstile, [data-widget-id], .cb-c, .cb-lb-t').forEach(el => set.add(el)); });

  if (set.size === 0) { dbg('No Turnstile candidates for assist yet.'); return false; }

  const io = ensureIO();
  for (const c of set) {
    if (CAP.solved) return true;
    if (!CAP.ioTargets.has(c)) { io.observe(c); CAP.ioTargets.add(c); }
    assistFocus(c);

    // Brief poll for token via official callbacks or hidden inputs
    const ok = await new Promise(res => {
      let ticks = 10;
      const id = CAP.addTimer(setInterval(() => {
        if (hasAnySolution()) { clearInterval(id); res(true); }
        else if (--ticks <= 0) { clearInterval(id); res(false); }
      }, 200));
    });
    if (ok) { markSolved(); return true; }
  }
  return false;
}

// ============================
// Main Entry Point
// ============================
chrome.runtime.onMessage.addListener(function (request) {
  dbg('Received message', request);
  if (request.sendProject) {
    if (!window.loadedCaptcha) {
      window.loadedCaptcha = true;
      if (request.settings?.disabledClickCaptcha) window.dontSolve = true;
      run();
    } else if (window.solvedCaptcha) {
      try { chrome.runtime.sendMessage({ captchaPassed: 'double' }); } catch {}
    }
  }
});

function run() {
  if (window.portAlert) {
    window.portAlert.addEventListener('state', event =>
      chrome.runtime.sendMessage({ message: event.detail.message, ignoreReport: true })
    );
  }

  const url = window.location.href;
  const isRecaptchaAnchor   = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api\d|enterprise)\/anchor/.test(url);
  const isRecaptchaBFrame   = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api\d|enterprise)\/bframe/.test(url);
  const isRecaptchaFallback = /https?:\/\/(.+?\.)?(google\.com|recaptcha\.net)\/recaptcha\/(api|enterprise)\/fallback/.test(url);
  const isMTCaptcha = /https?:\/\/service\.mtcaptcha\.com\/mtcv1/.test(url);
  const isHCaptcha          = url.includes('.hcaptcha.com/captcha.v');  
  const isSmartCaptcha      = url.includes('smartcaptcha.yandexcloud.net');
  const isCloudflareChallengePage = url.startsWith('https://challenges.cloudflare.com');
  const hasTurnstileWidget  = !!document.querySelector('.cf-turnstile, [name="cf-turnstile-response"], iframe[src*="challenges.cloudflare.com/turnstile"]');

  dbg('Flags:', { isRecaptchaAnchor, isRecaptchaBFrame, isRecaptchaFallback, isHCaptcha, isSmartCaptcha, isCloudflareChallengePage, hasTurnstileWidget, isMTCaptcha });


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
      dbg('No immediate target found. Stage 2: Passive Assist Orchestrator...');
      startTurnstileAssistOrchestrator();
    }
    return;
  }

  dbg('No known CAPTCHA type detected.');
}

// ===================================================================================
// SOLVER FUNCTIONS (Your logic, with minor timer tracking & correctness tweaks only)
// ===================================================================================

async function handleMTCaptcha() {

    const client = new window.LettersASRClient({ baseUrl: "https://bozoweed.ddns.net/api/ocr" });
    while (!document.querySelector('#mtcap-audio-1')) await new Promise(resolve => setTimeout(resolve, 1000));
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
        if (res.letters.length < 4) {
            document.querySelector('#mtcap-statusbutton-1').click();
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {

            let input = document.querySelector('#mtcap-inputtext-1');
            const inputField = input;
            inputField.focus();
            await new Promise(resolve => setTimeout(resolve, 100));
            for (const letter of res.letters.split(' ')) {

                inputField.value += letter;
                inputField.dispatchEvent(new InputEvent('input', { bubbles: true }));
                await new Promise(resolve => setTimeout(resolve, 50));

            }
            await new Promise(resolve => setTimeout(resolve, 100));
            inputField.dispatchEvent(new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'Enter',
                code: 'Enter',
                which: 13
            }));
            inputField.dispatchEvent(new InputEvent('input', { bubbles: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
            inputField.dispatchEvent(new Event('blur', { bubbles: true }));
            window.solvedCaptcha = true;
        }
    } while (!window.solvedCaptcha);


    chrome.runtime.sendMessage({ captchaPassed: true });
}

async function handleSmartCaptcha() {
  try {
    while (!document.querySelector('.CheckboxCaptcha-Checkbox')) await new Promise(resolve => setTimeout(resolve, 1000));
    document.querySelector('.CheckboxCaptcha-Checkbox').setAttribute("data-checked", true);
    document.querySelector('#js-button')?.click();
    await new Promise(resolve => setTimeout(resolve, 2000));
    markSolved();
  } catch (error) {
    console.error("Error during SmartCaptcha interaction:", error);
    try { chrome.runtime.sendMessage({ message: error.message }); } catch {}
  }
}

function handleReCaptchaAnchor() {
  const timer1 = CAP.addTimer(setInterval(() => {
    if (window.dontSolve || CAP.solved) return clearInterval(timer1);

    const checkboxBorder = document.querySelector('#recaptcha-anchor > div.recaptcha-checkbox-border');
    if (!checkboxBorder || !isScrolledIntoView(checkboxBorder) || checkboxBorder.style.display === 'none') return;

    const errorMsg = document.querySelector('.rc-anchor-error-msg-container');
    if (errorMsg?.style.display !== 'none' && errorMsg.textContent.trim().length > 0) return;

    checkboxBorder.click();
    clearInterval(timer1);

    const timer2 = CAP.addTimer(setInterval(() => {
      if (hasAnySolution()) { clearInterval(timer2); return markSolved(); }

      const err = document.querySelector('.rc-anchor-error-msg-container');
      if (err?.style.display !== 'none' && err.textContent.trim().length > 0) {
        const text = err.textContent.trim();
        if (text.includes('Try reloading the page')) location.reload();
        else if (!/время проверки истекло|Verification (challenge )?expired|La validation a expiré|verificación caducó/i.test(text)) {
          try { chrome.runtime.sendMessage({ errorCaptcha: text }); } catch {}
          clearInterval(timer2);
        }
      }
    }, 1000));
  }, 1000));
}

function handleReCaptchaBFrame() {
  let count = 0, repeat = 2;

  const timer7 = CAP.addTimer(setInterval(() => {
    const solverButton = document.getElementById('solver-button');
    const verifyButton = document.getElementById('recaptcha-verify-button');

    if (solverButton && !solverButton.classList.contains('working') && verifyButton && !verifyButton.disabled) {
      const audioError = document.querySelector('.rc-audiochallenge-error-message');
      if (audioError && audioError.style.display !== 'none' && audioError.textContent.trim().length > 0) repeat = 3;

      if (count >= repeat) {
        try { chrome.runtime.sendMessage({ reloadCaptcha: true }); } catch {}
        clearInterval(timer7);
        return;
      }

      solverButton.click();
      count++;
    }

    const dosText = document.querySelector('.rc-doscaptcha-body-text');
    if (dosText && dosText.style.display !== 'none' && dosText.textContent.trim().length > 0) {
      try { chrome.runtime.sendMessage({ errorCaptcha: dosText.textContent.trim() }); } catch {}
      clearInterval(timer7);
    }

    // Temporary fix for NopeCHA + Speech method
    const audioResponse = document.querySelector("#audio-response");
    if (audioResponse && audioResponse.value.length > 3) {
      clearInterval(timer7);
      document.querySelector("#recaptcha-verify-button")?.click();
    }
  }, 2000));

  const timer3 = CAP.addTimer(setInterval(() => {
    if (!document.getElementById("solver-button") && document.getElementById("rc-imageselect")) {
      try { chrome.runtime.sendMessage({ captcha: true }); } catch {}
      clearInterval(timer3);
    }
  }, 1000));
}

function handleReCaptchaFallback() {
  try {
    chrome.runtime.sendMessage({ errorCaptcha: document.body.innerText.trim(), restartVote: true });
  } catch {}
}

function handleHCaptcha() {
  const timer4 = CAP.addTimer(setInterval(() => {
    if (window.dontSolve || CAP.solved) return clearInterval(timer4);

    const checkbox = document.getElementById('checkbox');
    if (!checkbox || !isScrolledIntoView(checkbox) || checkbox.style.display === 'none') return;

    checkbox.click();
    clearInterval(timer4);

    const timer5 = CAP.addTimer(setInterval(() => {
      if (checkbox.getAttribute('aria-checked') === 'true' || hasAnySolution()) {
        clearInterval(timer5);
        markSolved();
      }
    }, 1000));

    const timer6 = CAP.addTimer(setInterval(() => {
      const bodyNoSel = document.querySelector('body.no-selection');
      if (bodyNoSel && bodyNoSel.getAttribute('aria-hidden') == null && bodyNoSel.style.display === '') {
        if (!document.querySelector('head > yandex-captcha-solver')) {
          try { chrome.runtime.sendMessage({ captcha: true }); } catch {}
        }
        clearInterval(timer6);
      }

      const yandexError = document.querySelector('div[style*="color: rgb(218, 94, 94)"]');
      if (yandexError) {
        try { chrome.runtime.sendMessage({ errorCaptcha: yandexError.textContent }); } catch {}
        clearInterval(timer5);
      }
    }, 1000));

    const timer9 = CAP.addTimer(setInterval(() => {
      const status = document.querySelector('#status');
      if (status && status.style.display !== 'none' && status.innerText.trim().length > 3) {
        try { chrome.runtime.sendMessage({ errorCaptcha: status.innerText.trim() }); } catch {}
        clearInterval(timer9);
      }
    }, 1000));
  }, 1000));
}

function handleTurnstileInShadowDOM() {
  const turnstileContainers = findAllElementsInShadowDOM('.cf-turnstile, [data-widget-id], .cb-c, .cb-lb-t');
  if (turnstileContainers.length === 0) return false;

  let initiated = false;
  for (const container of turnstileContainers) {
    if (container.hasAttribute('data-turnstile-handled')) continue;

    const humanLabel = container.querySelector?.('.cb-lb-t') || (container.classList?.contains('cb-lb-t') ? container : null);
    if (!humanLabel) continue;

    const checkboxInput = (humanLabel.closest?.('.cb-c') || container).querySelector('input[type="checkbox"]');
    if (!checkboxInput) continue;

    container.setAttribute('data-turnstile-handled', 'true');
    initiated = true;

    const proceedToClick = () => {
      simulateUltraHumanClick(checkboxInput, (success) => {
        if (!success) simulateKeyboardInteraction(checkboxInput, () => {});
        const timerSuccess = CAP.addTimer(setInterval(() => {
          if (hasAnySolution()) { clearInterval(timerSuccess); markSolved(); }
        }, 1000));
        CAP.addTimer(setTimeout(() => clearInterval(timerSuccess), 30000));
      });
    };

    if (checkboxInput.disabled) {
      const waitInterval = CAP.addTimer(setInterval(() => {
        if (!checkboxInput.disabled) { clearInterval(waitInterval); proceedToClick(); }
      }, 200));
      CAP.addTimer(setTimeout(() => clearInterval(waitInterval), 5000));
    } else {
      checkboxInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      CAP.addTimer(setTimeout(proceedToClick, 1000 + Math.random() * 500));
    }
    break;
  }
  return initiated;
}

function handleTurnstileInIframe() {
  const turnstileIframes = Array.from(document.querySelectorAll('iframe')).filter(iframe => iframe.src.includes('challenges.cloudflare.com/turnstile/'));
  if (turnstileIframes.length === 0) return false;

  let initiated = false;

  turnstileIframes.forEach(iframe => {
    if (iframe.hasAttribute('data-turnstile-handled')) return;
    iframe.setAttribute('data-turnstile-handled', 'true');
    initiated = true;

    const onLoadHandler = () => {
      try {
        if (!iframe.contentDocument || iframe.contentDocument.location.href === 'about:blank') {
          CAP.addTimer(setTimeout(onLoadHandler, 500));
          return;
        }
        const iframeDoc = iframe.contentDocument;
        const humanLabel = iframeDoc.querySelector('.cb-lb-t');
        if (!humanLabel) return;

        const checkboxInput = humanLabel.closest('.cb-c')?.querySelector('input[type="checkbox"]');
        if (!checkboxInput) return;

        const proceedToClick = () => {
          simulateUltraHumanClick(checkboxInput, (success) => {
            if (!success) simulateKeyboardInteraction(checkboxInput, () => {});
            const timerSuccess = CAP.addTimer(setInterval(() => {
              if (hasAnySolution() || hasAnySolution(iframeDoc)) { clearInterval(timerSuccess); markSolved(); }
            }, 1000));
            CAP.addTimer(setTimeout(() => clearInterval(timerSuccess), 30000));
          });
        };

        if (checkboxInput.disabled) {
          const enableCheck = CAP.addTimer(setInterval(() => {
            if (!checkboxInput.disabled) { clearInterval(enableCheck); proceedToClick(); }
          }, 200));
          CAP.addTimer(setTimeout(() => clearInterval(enableCheck), 5000));
        } else {
          checkboxInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          CAP.addTimer(setTimeout(proceedToClick, 1000 + Math.random() * 500));
        }
      } catch (e) {
        console.error(`[Turnstile DEBUG] 💥 Error during iframe handling:`, e.message);
      }
    };

    if (iframe.contentDocument?.readyState === 'complete' && iframe.contentDocument.location.href !== 'about:blank') onLoadHandler();
    else iframe.addEventListener('load', onLoadHandler, { once: true });
  });

  return initiated;
}

// ===================================================================================
// HELPER FUNCTIONS (Your original high-fidelity automation code — unchanged)
// ===================================================================================

function findAllElementsInShadowDOM(selector, root = document.body) {
  const result = [];
  if (!root) return result;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
  let node;
  while (node = walker.nextNode()) {
    if (node.shadowRoot) {
      result.push(...node.shadowRoot.querySelectorAll(selector));
      result.push(...findAllElementsInShadowDOM(selector, node.shadowRoot));
    }
  }
  result.push(...root.querySelectorAll(selector));
  return [...new Set(result)]; // unique
}

function simulateUltraHumanClick(element, callback, options = {}) {
  if (!element || !element.getBoundingClientRect) {
    console.warn('[Ultra-Human Click] Element invalid.');
    if (callback) callback(false);
    return;
  }
  const startTime = performance.now();
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    console.warn('[Ultra-Human Click] Element has no size.');
    if (callback) callback(false);
    return;
  }
  try { element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch (e) {}
  setTimeout(() => {
    const updatedRect = element.getBoundingClientRect();
    const targetX = updatedRect.left + updatedRect.width / 2 + (Math.random() * 6 - 3);
    const targetY = updatedRect.top + updatedRect.height / 2 + (Math.random() * 6 - 3);
    const startX = Math.max(0, Math.min(window.innerWidth, targetX + (Math.random() * 200 - 100)));
    const startY = Math.max(0, Math.min(window.innerHeight, targetY + (Math.random() * 200 - 100)));
    dbg(`[Ultra-Human Click] Journey: (${Math.round(startX)},${Math.round(startY)}) -> (${Math.round(targetX)},${Math.round(targetY)})`);
    safelyDispatchEvent(element, 'mouseenter', { clientX: startX, clientY: startY });
    const steps = 8 + Math.floor(Math.random() * 5);
    let currentStep = 0;
    const pathPoints = generateBezierPath(startX, startY, targetX, targetY, steps);
    const moveStep = () => {
      if (currentStep >= steps) {
        try { element.focus(); } catch(e){}
        const hoverDelay = 300 + Math.random() * 900;
        setTimeout(() => {
          safelyDispatchEvent(element, 'mousedown', { clientX: targetX, clientY: targetY, button: 0 });
          const holdDuration = 50 + Math.random() * 100;
          setTimeout(() => {
            safelyDispatchEvent(element, 'mouseup', { clientX: targetX, clientY: targetY, button: 0 });
            safelyDispatchEvent(element, 'click', { clientX: targetX, clientY: targetY, button: 0 });
            setTimeout(() => { try { element.blur(); } catch(e){} }, 100);
            dbg(`[Ultra-Human Click] Total time: ${Math.round(performance.now() - startTime)}ms`);
            if (callback) callback(true);
          }, holdDuration);
        }, hoverDelay);
        return;
      }
      const point = pathPoints[currentStep];
      const tremorX = currentStep < steps - 1 ? (Math.random() * 3 - 1.5) : 0;
      const tremorY = currentStep < steps - 1 ? (Math.random() * 3 - 1.5) : 0;
      const finalX = Math.max(0, Math.min(window.innerWidth, point.x + tremorX));
      const finalY = Math.max(0, Math.min(window.innerHeight, point.y + tremorY));
      safelyDispatchEvent(element, 'mousemove', { clientX: finalX, clientY: finalY });
      currentStep++;
      setTimeout(moveStep, 50 + Math.random() * 100);
    };
    const cognitiveDelay = 800 + Math.floor(Math.random() * 2200);
    setTimeout(moveStep, cognitiveDelay);
  }, 800);
}

function safelyDispatchEvent(element, type, props = {}) {
  try {
    const event = new MouseEvent(type, { view: window, bubbles: true, cancelable: true, ...props });
    element.dispatchEvent(event);
  } catch (e) {
    console.warn(`[Dispatch Event] Failed to dispatch ${type}:`, e.message);
  }
}

function generateBezierPath(x0, y0, x1, y1, steps) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const easeT = t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
    const controlX = (x0 + x1) / 2 + (Math.random() * 100 - 50);
    const controlY = Math.min(y0, y1) - 50 - Math.random() * 50;
    const x = (1 - easeT) ** 2 * x0 + 2 * (1 - easeT) * easeT * controlX + easeT ** 2 * x1;
    const y = (1 - easeT) ** 2 * y0 + 2 * (1 - easeT) * easeT * controlY + easeT ** 2 * y1;
    points.push({ x, y });
  }
  return points;
}

function simulateKeyboardInteraction(element, callback) {
  dbg(`[Keyboard Fallback] Attempting...`);
  const keyEvents = [{ key: ' ', code: 'Space', which: 32 }, { key: 'Enter', code: 'Enter', which: 13 }];
  let success = false;
  const tryKey = (index) => {
    if (index >= keyEvents.length || success) { if (callback) callback(success); return; }
    const keyConfig = keyEvents[index];
    try { element.focus(); } catch (e) {}
    const eventProps = { key: keyConfig.key, code: keyConfig.code, which: keyConfig.which, bubbles: true, cancelable: true };
    safelyDispatchEvent(element, 'keydown', eventProps);
    setTimeout(() => {
      safelyDispatchEvent(element, 'keyup', eventProps);
      if (hasAnySolution()) {
        success = true;
        dbg(`[Keyboard Fallback] Success with ${keyConfig.key}!`);
        if (callback) callback(true);
      } else {
        dbg(`[Keyboard Fallback] ${keyConfig.key} failed. Trying next...`);
        setTimeout(() => tryKey(index + 1), 300);
      }
    }, 100 + Math.random() * 200);
  };
  tryKey(0);
}

function isScrolledIntoView(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.top < window.innerHeight && rect.bottom >= 0;
}