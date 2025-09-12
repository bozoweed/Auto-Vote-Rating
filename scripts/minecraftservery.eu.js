async function vote(first) {
    if (document.querySelector('.notification') != null) {
        if (document.querySelector('.notification.is-success') != null) {
            chrome.runtime.sendMessage({ successfully: true })
            return
        } else if (document.querySelector('.notification.is-warning') != null && (document.querySelector('.notification.is-warning').textContent.includes('Hlasovat můžete až') || document.querySelector('.notification.is-warning').textContent.includes('Hlasovať môžete až'))) {
            //Сайт предоставляет когда следующее голосование но не понятно в каком часовом поясе указано время, также не указывается день (пишет только часы и минуты) что ещё больше осложняет определение времени следующего голосования
            const numbers = document.querySelector('.notification.is-warning').textContent.match(/\d+/g).map(Number);
        const milliseconds = (numbers[0] * 60 * 60 * 1000) + (numbers[1] * 60 * 1000)  * 1000; 
        chrome.runtime.sendMessage({ later: Date.now() + milliseconds });
            return
        } else {
            const request = {}
            request.message = document.querySelector('.notification').textContent.trim()
            if (request.message.toLowerCase().includes('captcha') || request.message.toLowerCase().includes('že nejste robot')) {
                // None
            } else {
                if (request.message.includes('server byl označen jako neaktivní')) {
                    request.ignoreReport = true
                    request.retryCoolDown = 21600000
                } else if (request.message.includes('Přezdívka je v nesprávném formátu')) {
                    request.ignoreReport = true
                }
                chrome.runtime.sendMessage(request)
                return
            }
        }
    }
    if (document.querySelector('body > .container > h1.title')) {
        const request = {}
        request.message = document.querySelector('body > .container > h1.title').textContent
        if (request.message.includes('stránka nebyla nalezena')) {
            request.ignoreReport = true
            request.retryCoolDown = 21600000
        }
        chrome.runtime.sendMessage(request)
        return
    }
    if (document.querySelector('body .container h1.title')?.textContent.includes('Internal Server Error')) {
        const request = {}
        request.message = document.querySelector('body .container h1.title').parentElement.innerText
        request.ignoreReport = true
        chrome.runtime.sendMessage(request)
        return
    }

    if (first) {
        document.querySelector('.columns .column button.button').click()

    }
    await wait(1000)
    while (!checkTurnstileSolved()) {
        await wait(1000)
    }
    let project = await getProject()
    const input = document.querySelector('form input.is-mid');
    if (input) {
        input.value = project.nick; // 👈 This actually sets the value
        input.focus();

        // Optional: Dispatch an 'input' or 'change' event if other code listens for it
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await wait(1000)
    document.querySelector('footer button.is-primary ').click()

    await wait(1000)
    if (document.querySelector('.notification.is-warning') != null && (document.querySelector('.notification.is-warning').textContent.includes('Hlasovat můžete až') || document.querySelector('.notification.is-warning').textContent.includes('Hlasovať môžete až'))) {
        //Сайт предоставляет когда следующее голосование но не понятно в каком часовом поясе указано время, также не указывается день (пишет только часы и минуты) что ещё больше осложняет определение времени следующего голосования
        const numbers = document.querySelector('.notification.is-warning').textContent.match(/\d+/g).map(Number);
        const milliseconds = (numbers[0] * 60 * 60 * 1000) + (numbers[1] * 60 * 1000)  * 1000; 
        chrome.runtime.sendMessage({ later: Date.now() + milliseconds });
        return
    }
}

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