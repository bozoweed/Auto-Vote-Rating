// ========== GLOBAL CAPTCHA LISTENER ==========
// Le listener DOIT être global pour recevoir captchaPassed même après un return
let craftlistCaptchaSolved = false

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.captchaPassed === true || request.captchaPassed === 'double') {
        craftlistCaptchaSolved = true
    }
})

async function vote(first) {
    // ========== UTILITY FUNCTIONS ==========
    function randomDelay(min, max) {
        return new Promise(resolve => setTimeout(resolve, Math.random() * (max - min) + min))
    }

    async function humanType(element, text) {
        element.focus()
        element.dispatchEvent(new Event('focus', { bubbles: true }))
        for (let char of text) {
            element.value += char
            element.dispatchEvent(new Event('input', { bubbles: true }))
            await randomDelay(50, 150)
        }
        element.dispatchEvent(new Event('change', { bubbles: true }))
        element.dispatchEvent(new Event('blur', { bubbles: true }))
    }

    // ========== SUCCESS DETECTION ==========
    if (document.querySelector('div.alert.alert-success')) {
        const message = document.querySelector('div.alert.alert-success').textContent
        if (message.includes('vote was successfully')
        || message.includes('hlas byl úspěšně přijatý')
        || message.includes('hlas bol úspešne prijatý')
        || message.includes('Dein Vote wurde akzeptiert')
        || message.includes('Tvůj hlas byl úspěšne přijatý')
        || message.includes('głos został pomyślnie zaakceptowany')) {
            chrome.runtime.sendMessage({ successfully: true })
        } else {
            chrome.runtime.sendMessage({ message })
        }
        return
    }

    // ========== ALREADY VOTED DETECTION ==========
    if (document.querySelector('div.alert.alert-info')) {
        const message = document.querySelector('div.alert.alert-info').textContent
        if (message.includes('next vote')
        || message.includes('možný hlas za tento server můžeš odeslat')
        || message.includes('možný hlas za tento server môžeš odoslať')
        || message.includes('nächster Vote')
        || message.includes('następny głos będzie możliwy')) {
            const numbers = message.match(/\d+/g).map(Number)
            chrome.runtime.sendMessage({ later: Date.UTC(numbers[2], numbers[1] - 1, numbers[0], numbers[3], numbers[4], numbers[5]) + 3600000 })
        } else {
            chrome.runtime.sendMessage({ message })
        }
        return
    }

    if (document.querySelector('div.alert.alert-error')) {
        const message = document.querySelector('div.alert.alert-error').textContent
        if (message.includes('next vote')
        || message.includes('možný hlas za tento server můžeteš odeslat')
        || message.includes('možný hlas za tento server môžeš odoslať')
        || message.includes('nächster Vote')
        || message.includes('następny głos będzie możliwy')) {
            const numbers = message.match(/\d+/g).map(Number)
            chrome.runtime.sendMessage({ later: Date.UTC(numbers[2], numbers[1] - 1, numbers[0], numbers[3], numbers[4]) + 3600000 })
            return
        } else if (message.includes('robot')) {
            // CAPTCHA non résolu - ne rien faire
        } else {
            chrome.runtime.sendMessage({ message })
            return
        }
    }

    // ========== ERROR DETECTION ==========
    if (document.querySelector('div.alert.alert-danger')) {
        const request = {}
        request.message = document.querySelector('div.alert.alert-danger').innerText
        if (request.message.includes('Ban')) {
            request.retryCoolDown = 43200000
            request.ignoreReport = true
        }
        chrome.runtime.sendMessage(request)
        return
    }

    if (document.querySelector('body #tracy-error')) {
        chrome.runtime.sendMessage({
            message: document.querySelector('body #tracy-error').innerText,
            ignoreReport: true
        })
        return
    }
    if (document.querySelector('body #server-error')) {
        chrome.runtime.sendMessage({
            message: document.querySelector('body #server-error').innerText,
            ignoreReport: true
        })
        return
    }

    // Redirection vers liste de serveurs
    if ((document.location.pathname.split('/')[1] === 'cz' || document.location.pathname.split('/')[1] === 'cs' || document.location.pathname.split('/')[1] === 'sk') && !document.location.pathname.split('/')[2]) {
        const request = {}
        request.errorVoteNoElement = 'Redirected to server list'
        request.ignoreReport = true
        chrome.runtime.sendMessage(request)
        return
    }

    const project = await getProject()

    // ========== OPEN VOTE MODAL ==========
    if (first && !document.querySelector('#voteModal')?.classList.contains('show')) {
        const btnText = document.querySelector('.sidebar .card-body .btn')?.textContent
        if (btnText && (btnText.includes('possible vote') || btnText.includes('možný hlas') || btnText.includes('ist möglich'))) {
            const numbers = btnText.match(/\d+/g).map(Number)
            const milliseconds = (numbers[0] * 60 * 60 * 1000) + (numbers[1] * 60 * 1000) + (numbers[2] * 1000)
            chrome.runtime.sendMessage({ later: Date.now() + milliseconds })
            return
        } else {
            document.querySelector('.sidebar .card-body .btn')?.click()
        }

        const timeout = document.querySelector('#voteModal p.text-center')
        if (timeout) {
            const hours = timeout.textContent.match(/\d+/g).map(Number)[0]
            const milliseconds = (hours * 60 * 60 * 1000)
            if (project.timeout == null || project.timeout !== milliseconds) {
                project.timeout = milliseconds
                chrome.runtime.sendMessage({ changeProject: project })
            }
        }
        return
    }

    // Si modal fermée, l'ouvrir
    if (!document.querySelector('#voteModal')?.classList.contains('show')) {
        document.querySelector('.sidebar .card-body .btn')?.click()
    }

    const btnText = document.querySelector('.modal-footer a span')?.textContent
    if (btnText && (btnText.includes('possible vote') || btnText.includes('možný hlas') || btnText.includes('ist möglich'))) {
        const numbers = btnText.match(/\d+/g).map(Number)
        const milliseconds = (numbers[0] * 60 * 60 * 1000) + (numbers[1] * 60 * 1000) + (numbers[2] * 1000)
        chrome.runtime.sendMessage({ later: Date.now() + milliseconds })
        return
    }

    if (!first) {
        // ========== CAPTCHA WAIT PATTERN ==========
        // Vérifier si CAPTCHA déjà résolu globalement
        if (window.solvedCaptcha) {
            craftlistCaptchaSolved = true
        }

        // Détecter reCAPTCHA dans la modal
        const recaptchaElement = document.querySelector('.modal-body .g-recaptcha') ||
                                  document.querySelector('.modal-body iframe[src*="recaptcha"]')

        if (!craftlistCaptchaSolved && recaptchaElement) {
            chrome.runtime.sendMessage({ captcha: true })
            // Attendre la résolution du CAPTCHA
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (craftlistCaptchaSolved || window.solvedCaptcha) {
                        craftlistCaptchaSolved = true
                        clearInterval(checkInterval)
                        resolve()
                    }
                }, 500)
            })
        }

        // ========== HUMAN-LIKE VOTE ACTIONS ==========
        await randomDelay(500, 1500)

        // Remplir le champ visible avec le bon sélecteur
        const nickInput = document.querySelector('.modal-body [name="nickName"]')
        if (nickInput) {
            nickInput.value = ''
            await humanType(nickInput, project.nick)
        }

        await randomDelay(400, 1000)

        // Soumettre le formulaire APRÈS avoir rempli le nom
        const submitButtons = [
            document.querySelector('.modal-footer button[type="submit"]'),// appear not allways true
            document.querySelector('.modal-footer button[type^="sub"]')
        ]
        let done = false
        for(const submitButton of submitButtons)
            if (submitButton) {
                submitButton.click()
                done = true
                break
            }
        if(!done)
            alert("strange thing happened")
    }

    // ========== ERROR POLLING ==========
    const timer = setInterval(() => {
        const request = {}
        request.message = document.querySelector('.modal-body .text-danger')?.innerText
        if (request.message?.length > 3 && !request.message.includes('field is required') && !request.message.includes('pole je povinný') && !request.message.includes('pole je povinné')) {
            clearInterval(timer)
            if (request.message.includes('Nick je v špatném formátu')) {
                request.ignoreReport = true
                request.retryCoolDown = 604800000
            }
            setTimeout(() => {
                chrome.runtime.sendMessage(request)
            }, 15000)
        }
    }, 1000)
}
