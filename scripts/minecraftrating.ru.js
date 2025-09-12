chrome.runtime.onMessage.addListener(function (message) {
    if (message.captchaPassed === true || message.captchaPassed === 'double') {
        console.log("[VOTE SCRIPT] Received 'captchaPassed' message. Clicking the final submit button.");
        
        // Find the correct submit button based on the project listing type.
        const project = getProject ? getProject().listing : 'servers'; // Simple check for which button to press
        let submitButton;

        if (project === 'projects') {
            submitButton = document.querySelector('#submitVote');
        } else { // 'servers' listing
            submitButton = document.querySelector('#voteForm button[type="submit"]');
        }
        
        if (submitButton) {
            submitButton.click();
        } else {
            console.error("[VOTE SCRIPT] Could not find the submit button after captcha was solved.");
        }
    }
});

async function vote(first) {
    // SECTION 1: INITIAL PAGE CHECKS
    if (document.querySelector('.container .text-center')?.textContent.includes('Страница не найдена')) {
        chrome.runtime.sendMessage({ message: document.querySelector('.container .text-center').textContent, ignoreReport: true, retryCoolDown: 21600000 });
        return;
    }
    if (document.body.innerText.trim().length < 150) {
        const message = document.body.innerText.trim();
        if (document.querySelector('body > #warning-container') || message.toLocaleLowerCase() === '419\npage expired') {
            chrome.runtime.sendMessage({ message: document.body.innerText.trim(), ignoreReport: true });
            return;
        }
    }

    // SECTION 2: CHECK FOR VOTE RESULTS
    if (document.querySelector('div.alert.alert-success')?.textContent.includes('Спасибо за Ваш голос!')) {
        chrome.runtime.sendMessage({ successfully: true });
        return;
    }
    if (document.querySelector('div.alert.alert-danger')?.textContent.includes('Вы уже голосовали за этот проект')) {
        chrome.runtime.sendMessage({ later: true });
        return;
    }
    if (document.querySelector('#msgBox')?.textContent.includes('Спасибо за Ваш голос')) {
        chrome.runtime.sendMessage({ successfully: true });
        return;
    }
    if (document.querySelector('#msgBox')?.textContent.includes('уже голосовали')) {
        const message = document.querySelector('#msgBox').textContent;
        const numbers = message.match(/\d+/g).map(Number);
        chrome.runtime.sendMessage({ later: Date.UTC(numbers[2], numbers[1] - 1, numbers[0], numbers[3], numbers[4], numbers[5]) - 10800000 + 60000 });
        return;
    }

    // SECTION 3: PREPARE FORM AND HANDLE CAPTCHA WORKFLOW
    const project = await getProject();

    if (first) {
        const nickInput = document.querySelector('input[name=nick]');
        if (nickInput) {
            nickInput.value = project.nick;
            console.log(`[VOTE SCRIPT] Nickname '${project.nick}' has been entered.`);
        }
    }

    const smartCaptchaIframe = document.querySelector('iframe[src*="smartcaptcha.yandexcloud.net"]');

    if (smartCaptchaIframe) {
        console.log("[VOTE SCRIPT] Yandex SmartCaptcha detected. Waiting for automatic solver...");

        // The top-level listener is already active and waiting for the 'captchaPassed' message.
        // We just need the fallback timeout here.

        const manualFallbackTimeout = 30000; // 30 seconds
        setTimeout(() => {
            if (document.querySelector('div.alert.alert-success, #msgBox')) {
                return; // Vote completed successfully, no need for fallback.
            }

            console.log("[VOTE SCRIPT] Automatic solver timed out. Requesting manual intervention.");
            chrome.runtime.sendMessage({ captcha: true }); // This triggers the manual notification

        }, manualFallbackTimeout);

    } else {
        console.log("[VOTE SCRIPT] No captcha detected. Attempting direct form submission.");
        const submitButton = document.querySelector('#submitVote, button[type=submit]');
        if (submitButton) {
            submitButton.click();
        } else {
            chrome.runtime.sendMessage({ message: "Could not find a captcha or a vote button on the page." });
        }
    }
}

// --- The rest of your script (PerformanceObserver, etc.) remains unchanged ---
let unload = false
window.onbeforeunload = ()=> {
    unload = true
}
window.onunload = ()=> {
    unload = true
}
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        if (entry.name === 'https://minecraftrating.ru/set-cookie/') {
            // Дикий костыль в обход ошибки "CSRF token mismatch."
            setTimeout(async () => {
                if (unload) return
                const project = await getProject()

                let response
                try {
                    response = await fetch(document.location.href)
                } catch (error) {
                    chrome.runtime.sendMessage({message: error.toString(), ignoreReport: true})
                    return
                }
                if (!response.ok) {
                    chrome.runtime.sendMessage({errorVote: [String(response.status), response.url]})
                    return
                }
                const text = await response.text()
                const doc = new DOMParser().parseFromString(text, 'text/html')
                const csrfToken = doc.querySelector('#form-vote input[name="_token"]')?.value
                if (!csrfToken) {
                    chrome.runtime.sendMessage({errorVoteNoElement: 'Не найден csrf токен', html: text, url: response.url})
                    return
                }
                document.querySelector('#form-vote input[name="_token"]').value = csrfToken

                try {
                    response = await fetch('/set-cookie/', {
                        headers: {
                            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
                        },
                        method: 'POST',
                        body: '_token=' + csrfToken + '&' + 'name=' + 'voted_project' + '&' + 'value= ' + document.querySelector('[name=url]').value + '__' + project.nick,
                    })
                } catch (error) {
                    chrome.runtime.sendMessage({message: error.toString(), ignoreReport: true})
                    return
                }
                if (!response.ok) {
                    chrome.runtime.sendMessage({errorVote: [String(response.status), response.url]})
                    return
                }

                document.querySelector('#form-vote').submit()
            }, 5000)
        }
    }
})
observer.observe({
    entryTypes: ["resource"]
})