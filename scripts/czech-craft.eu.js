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

    // ========== ERROR DETECTION ==========
    if (document.querySelector('div.alert.alert-danger')) {
        chrome.runtime.sendMessage({message: document.querySelector('div.alert.alert-danger').textContent.trim()})
        return
    }

    if (document.querySelector('div.alert.alert-error:last-of-type') || document.querySelector('div.alert.alert-error')) {
        const request = {}
        const error = document.querySelector('div.alert.alert-error:last-of-type') || document.querySelector('div.alert.alert-error')
        request.message = error.innerText
        if (request.message.includes('Již si hlasoval') || request.message.includes('Nyní nemůžeš hlasovat. Zkus to prosím znovu')) {
            if (request.message.match(/\d+/g)) {
                const numbers = request.message.match(/\d+/g).map(Number)
                const date = new Date()
                chrome.runtime.sendMessage({later: Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), numbers[0] - 2, numbers[1], numbers[2])})
            } else {
                chrome.runtime.sendMessage({later: true})
            }
        } else {
            if (request.message.includes('Nastala chyba')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
        }
        return
    }

    if (document.querySelector('span.form-error')) {
        const request = {}
        request.message = document.querySelector('span.form-error').textContent
        if (request.message.includes('Nick obsahuje nepovolené znaky')) {
            request.ignoreReport = true
            request.retryCoolDown = 604800000
            chrome.runtime.sendMessage(request)
            return
        } else if (request.message.includes('field is required')) {
            // None
        } else {
            if (request.message.includes('response parameter is missing') || request.message.includes('response parameter is invalid')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
            return
        }
    }

    if (document.querySelector('div.alert.alert-success') != null) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }

    if (first) {
        // ========== CAPTCHA WAIT PATTERN ==========
        let captchaSolved = false

        // Listener pour le message captchaPassed depuis captchaclicker.js
        const captchaListener = (message, sender, sendResponse) => {
            if (message.captchaPassed === true || message.captchaPassed === 'double') {
                captchaSolved = true
                chrome.runtime.onMessage.removeListener(captchaListener)
            }
        }
        chrome.runtime.onMessage.addListener(captchaListener)

        // Vérifier si CAPTCHA déjà résolu
        if (window.solvedCaptcha) {
            captchaSolved = true
        }

        // Détecter la présence de reCAPTCHA
        const recaptchaElement = document.querySelector('.g-recaptcha') || 
                                  document.querySelector('div[class*="recaptcha"]') ||
                                  document.querySelector('iframe[src*="recaptcha"]')

        // Si reCAPTCHA présent, envoyer signal et attendre sa résolution
        if (!captchaSolved && recaptchaElement) {
            chrome.runtime.sendMessage({captcha: true})
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (captchaSolved || window.solvedCaptcha) {
                        captchaSolved = true
                        clearInterval(checkInterval)
                        resolve()
                    }
                }, 500)
            })
        }

        // Petite pause post-résolution pour stabilité
        await randomDelay(500, 1000)

        // ========== HUMAN-LIKE VOTE ACTIONS ==========
        const project = await getProject()


        // Remplissage humain du username
        const usernameInput = document.getElementById('username')
        if (usernameInput) {
            usernameInput.value = ''
            await humanType(usernameInput, project.nick)
        }

        // Délai avant checkbox
        await randomDelay(300, 800)

        // Cliquer sur la checkbox au lieu de .checked = true
        const privacyCheckbox = document.getElementById('privacy')
        if (privacyCheckbox) {
            privacyCheckbox.click()
            await randomDelay(100, 300)
        }

        // Délai avant submit
        await randomDelay(400, 1000)

        // Soumettre le formulaire
        const submitButton = document.querySelector('form[method="post"] > button.button')
        if (submitButton) {
            submitButton.click()
        }
    }
}
