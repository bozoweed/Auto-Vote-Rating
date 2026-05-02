// ========== GLOBAL CAPTCHA LISTENER ==========
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

    function randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    /**
     * Simule une frappe clavier humaine complète :
     * - Sélection du texte existant (Ctrl+A) puis suppression
     * - Pour chaque caractère : keydown → keypress → input → keyup
     * - Délais aléatoires réalistes entre chaque événement
     * - Utilise KeyboardEvent avec code/key/codePlateforme conformes
     */
    async function humanType(element, text) {
        element.focus()
        element.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        await randomDelay(100, 250)

        // Sélectionner tout le texte existant comme un humain (Ctrl+A)
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true, bubbles: true }))
        element.dispatchEvent(new KeyboardEvent('keypress', { key: 'a', code: 'KeyA', keyCode: 97, ctrlKey: true, bubbles: true }))
        element.select()
        element.dispatchEvent(new Event('select', { bubbles: true }))
        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', keyCode: 65, ctrlKey: true, bubbles: true }))
        await randomDelay(50, 150)

        // Supprimer la sélection avec Backspace
        element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true }))
        const oldValue = element.value
        element.value = ''
        if (oldValue !== element.value) {
            element.dispatchEvent(new InputEvent('input', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }))
        }
        element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Backspace', code: 'Backspace', keyCode: 8, bubbles: true }))
        await randomDelay(80, 200)

        // Frappe caractère par caractère
        for (let i = 0; i < text.length; i++) {
            const char = text[i]
            const isUpper = char !== char.toLowerCase()
            const shiftKey = isUpper
            const keyCode = char.charCodeAt(0)

            // keydown
            element.dispatchEvent(new KeyboardEvent('keydown', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                keyCode: keyCode,
                shiftKey: shiftKey,
                bubbles: true,
                cancelable: true
            }))
            await randomDelay(5, 25)

            // keypress
            element.dispatchEvent(new KeyboardEvent('keypress', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                keyCode: keyCode,
                shiftKey: shiftKey,
                bubbles: true,
                cancelable: true
            }))
            await randomDelay(5, 15)

            // Modifier la valeur et déclencher input
            element.value += char
            element.dispatchEvent(new InputEvent('input', {
                inputType: 'insertText',
                data: char,
                bubbles: true,
                cancelable: true
            }))
            await randomDelay(5, 20)

            // keyup
            element.dispatchEvent(new KeyboardEvent('keyup', {
                key: char,
                code: `Key${char.toUpperCase()}`,
                keyCode: keyCode,
                shiftKey: shiftKey,
                bubbles: true
            }))

            // Délai inter-caractère réaliste (plus long pour les majuscules)
            await randomDelay(isUpper ? 100 : 40, isUpper ? 220 : 160)
        }

        await randomDelay(100, 300)
        element.dispatchEvent(new Event('change', { bubbles: true }))
        await randomDelay(50, 150)
        element.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
    }

    /**
     * Simule un clic humain complet : pointerdown → mousedown → focus → mouseup → click
     * Ordre conforme au W3C et au comportement réel du navigateur
     */
    async function humanClick(element) {
        const rect = element.getBoundingClientRect()
        const x = rect.left + rect.width * (0.3 + Math.random() * 0.4)
        const y = rect.top + rect.height * (0.3 + Math.random() * 0.4)

        const pointerOpts = { clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }
        const mouseOpts = { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1 }

        element.dispatchEvent(new PointerEvent('pointerdown', { ...pointerOpts, pointerId: 1, pointerType: 'mouse', pressure: 0.5 }))
        await randomDelay(8, 30)
        element.dispatchEvent(new MouseEvent('mousedown', mouseOpts))
        await randomDelay(5, 20)
        element.focus()
        element.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
        await randomDelay(40, 120)
        element.dispatchEvent(new PointerEvent('pointerup', { ...pointerOpts, pointerId: 1, pointerType: 'mouse', pressure: 0 }))
        await randomDelay(5, 15)
        element.dispatchEvent(new MouseEvent('mouseup', { ...mouseOpts, buttons: 0 }))
        await randomDelay(5, 15)
        element.dispatchEvent(new MouseEvent('click', { ...mouseOpts, buttons: 0, detail: 1 }))
    }

    // ========== SUCCESS DETECTION ==========
    if (document.querySelector('div.alert.alert-success')) {
        const message = document.querySelector('div.alert.alert-success').textContent
        if (message.includes('vote was successfully')
            || message.includes('hlas byl úspěšně přijat')
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
            await humanClick(document.querySelector('.sidebar .card-body .btn'))
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
        await humanClick(document.querySelector('.sidebar .card-body .btn'))
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
        if (window.solvedCaptcha) {
            craftlistCaptchaSolved = true
        }

        // Détecter reCAPTCHA dans la modal
        const recaptchaElement = document.querySelector('.modal-body .g-recaptcha')
            || document.querySelector('.modal-body iframe[src*="recaptcha"]')

        if (!craftlistCaptchaSolved && recaptchaElement) {
            chrome.runtime.sendMessage({ captcha: true })
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
        await randomDelay(800, 2000)

        const nickInput = document.querySelector('.modal-body [name="nickName"]')
        if (nickInput) {
            await humanType(nickInput, project.nick)
        }

        await randomDelay(500, 1200)

        const submitButton = document.querySelector('.modal-footer button[type="submit"]')
            || document.querySelector('.modal-footer button[type^="sub"]')
        if (submitButton) {
            await humanClick(submitButton)
            await randomDelay(200, 500) // let check function do is job
        }
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
