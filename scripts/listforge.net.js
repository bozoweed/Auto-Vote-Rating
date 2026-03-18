async function vote(first) {
    //Пилюля от жадности
    if (document.getElementById('adblock-notice')) document.getElementById('adblock-notice').style.display = 'none'
    if (document.getElementById('adsense-notice')) document.getElementById('adsense-notice').style.display = 'none'
    if (document.getElementById('vote-loading-block')) document.getElementById('vote-loading-block').style.display = 'none'
    if (document.getElementById('blocked-notice')) document.getElementById('blocked-notice').style.display = 'none'
    if (document.getElementById('privacysettings-notice')) document.getElementById('privacysettings-notice').style.display = 'none'
    document.getElementById('vote-form-block')?.removeAttribute('style')
    document.getElementById('vote-button-block')?.removeAttribute('style')
    document.querySelector('.alert-danger a[href*="/servers/premium/"]')?.parentElement?.remove()
    document.querySelector('a[href="/servers/premium/"]')?.remove()

    for (const el of document.querySelectorAll('div.alert.alert-info')) {
        if (el.textContent.includes('server has been removed')) {
            chrome.runtime.sendMessage({message: el.textContent.trim(), ignoreReport: true, retryCoolDown: 21600000})
            return
        }
    }

    for (const el of document.querySelectorAll('strong')) {
        if (el.textContent.includes('website is made possible by displaying online advertisements')) continue

        if (el.textContent.includes('Thank you for your vote')) {
            chrome.runtime.sendMessage({successfully: true})
            return
        } else if (el.textContent.includes('Voting is disabled for few minutes')) {
            chrome.runtime.sendMessage({message: el.textContent, ignoreReport: true})
            return
        }
    }

    for (const el of document.querySelectorAll('div.alert.alert-danger')) {
        if (el.querySelector('center > strong')) continue
        if (!el.innerText) continue

        const request = {}
        request.message = el.textContent.trim()

        if (request.message.includes('need to accept our Privacy Policy')
            || request.message.includes('website is made possible by displaying online advertisements')
            || request.message.includes('have one unread message')) continue

        if (request.message.includes('already voted') || request.message.includes('have reached your daily vote limit')) {
            chrome.runtime.sendMessage({later: true})
            return
        } else if (request.message.toLowerCase().includes('steam login')) {
            if (first) {
                chrome.runtime.sendMessage({auth: true})
                return
            }
        } else if (request.message.toLowerCase().includes('captcha')) {
            if (first) chrome.runtime.sendMessage({captcha: true})
        } else {
            if (request.message.includes('username maximum length') || request.message.toLowerCase().includes('vote time expired') || request.message.includes('API has returned an error')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
            return
        }
    }

    if (document.querySelector('.container h1')?.textContent?.includes('Error')) {
        const request = {}
        request.message = document.querySelector('.container h1').textContent + ' ' + document.querySelector('.container p').textContent
        if (request.message.includes('page you were looking for cannot be found') || request.message.includes('page you were looking does not exist anymore')) {
            request.ignoreReport = true
            request.retryCoolDown = 21600000
        }
        chrome.runtime.sendMessage(request)
    }

    // Иногда если сервер/проект был удалён то сайт просто переадресует на главную страницу или на список серверов никак не сообщая о об ошибке 404 или о том что сервер удалён
    if (document.querySelector('ul.pagination')) {
        const request = {}
        request.errorVoteNoElement = 'It looks like the site redirected to the main page (list of servers), most likely this server/project was deleted. If this is not the case and you think it is a error, inform the extension developer'
        request.ignoreReport = true
        chrome.runtime.sendMessage(request)
        return
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
    if (!captchaSolved && (document.querySelector('div.h-captcha') || document.querySelector('.cf-turnstile') || document.querySelector('#captcha-block'))) {
    	console.log("[VOTE] Waiting for CAPTCHA to be solved...");
   
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
    				resolve();
    			}
    		}, 500);
    	});
    }

    //Соглашаемся с Privacy Policy
    if (document.querySelector('#accept')) document.querySelector('#accept').checked = true

    //Если требуется авторизация Steam
    if (document.querySelector('form[name="steam_form"] > input[type="image"]') != null) {
        document.querySelector('form[name="steam_form"] > input[type="image"]').click()
        return
    }

    //Если нас каким-то образом выкинул на страницу описания сервера
    if (document.querySelector('a[role="button"][title="Vote"]')) {
        document.querySelector('a[role="button"][title="Vote"]').click()
        return
    }
    if (document.querySelector('a.btn[title="Vote for this server"]')) {
        document.querySelector('a.btn[title="Vote for this server"]').click()
        return
    }

    // На случай если гугл капча не полностью загрузилась, во избежание ошибки "Captcha data missing"
    if (document.querySelector('#vote_form div.g-recaptcha')) {
        if (!document.querySelector('#g-recaptcha-response')) {
            await new Promise(resolve => {
                const timer = setInterval(() => {
                    if (document.querySelector('#g-recaptcha-response')) {
                        clearInterval(timer)
                        resolve()
                    }
                }, 1000)
            })
        }
    }

    const project = await getProject()
    //Вводим ник если он существует
    if (document.getElementById('nickname') != null) {
        if (project.nick == null || project.nick === '') {
            chrome.runtime.sendMessage({requiredNick: true})
            return
        }

        document.getElementById('nickname').value = project.nick
       //Кликаем проголосовать, если нет hCaptcha
       if (document.getElementById('voteBtn') != null) {
        // Double-check Turnstile is solved right before submitting
        if (document.querySelector('.cf-turnstile, [data-widget-id]') && !checkTurnstileSolved()) {
        	console.warn("[VOTE] Turnstile may not be fully solved yet, waiting a bit longer...");
        	await new Promise(resolve => setTimeout(resolve, 2000));
        }
        document.getElementById('voteBtn').click()
        //Если hCaptcha
        } else if (document.querySelector('button[form="vote_form"]') != null) {
                document.querySelector('button[form="vote_form"]').click()
        //Ещё какая-то разновидность кнопки Vote (Specially for Minecraft Pocket Servers)
        } else {
            // document.querySelector('a[href="javascript:document.vote_form.submit();"]').click()
            document.querySelector('form[name="vote_form"]').submit()
        }
    } else {
        // noinspection ExceptionCaughtLocallyJS
        throw Error(null)
    }
}