async function vote(first) {
    if (checkAnswer()) return

    // Si premier appel, initialiser l'attente CAPTCHA
    if (first) {
        // Flag pour tracker la résolution CAPTCHA
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

        // Si hCaptcha présent, attendre sa résolution
        if (!captchaSolved && document.querySelector('div.h-captcha')) {
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
        await new Promise(resolve => setTimeout(resolve, 500))

        // Remplir le username et soumettre
        const project = await getProject()
        const usernameInput = document.querySelector('#vote-form #username')
        if (usernameInput) {
            usernameInput.value = project.nick
        }

        // Cliquer sur le bouton Vote
        const voteButton = document.querySelector('#vote-form button[type="submit"]')
        if (voteButton) {
            voteButton.click()
        }
    }
}

const timer = setInterval(() => {
    try {
        checkAnswer()
    } catch (e) {
        clearInterval(timer)
        throwError(e)
    }
}, 1000)

function checkAnswer() {
    if (document.querySelector('#vote div[class="auth-msg"]')) {
        const request = {}
        request.message = document.querySelector('#vote div[class="auth-msg"]').innerText
        if (request.message.includes('already voted') || request.message.includes('reached your daily voting limit')) {
            const numbers = request.message.match(/\d+/g).map(Number)
            const milliseconds = (numbers[0] * 60 * 60 * 1000) + (numbers[1] * 60 * 1000)
            chrome.runtime.sendMessage({later: Date.now() + milliseconds + 60000})
        } else if (request.message.includes('Thanks for voting')) {
            chrome.runtime.sendMessage({successfully: true})
        } else {
            if (request.message.includes('session expired')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
        }
        clearInterval(timer)
        return true
    }
}
