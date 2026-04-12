async function vote(first) {
    if (document.querySelector('.alert.alert-success')) {
        chrome.runtime.sendMessage({ successfully: true })
        return
    }
    if (document.querySelector('.alert.alert-danger')) {
        const request = {}
        request.message = document.querySelector('.alert.alert-danger').textContent.trim()
        if (request.message.includes('Vous devez attendre')) {
        	const numbers = request.message.match(/\d+/g).map(Number)
        	chrome.runtime.sendMessage({ later: Date.UTC(numbers[2], numbers[1] - 1, numbers[0], numbers[3], numbers[4]) })
        } else if (request.message.includes('Répondre au captcha est obligatoire') || request.message.includes('Le captcha est invalide')) {
            // None
        } else {
            if (request.message.includes('Il est strictement interdit d\'utiliser un proxy / VPN')) {
                request.ignoreReport = true
            }
            chrome.runtime.sendMessage(request)
        }
        return
    }

    if (document.querySelector('#vote').getAttribute('aria-hidden') === 'true') {
        document.querySelector('[data-target="#vote"]').click()
    }

    if (first) return

    const project = await getProject()
    if (document.querySelector('#vote form #pseudo')) document.querySelector('form #pseudo').value = project.nick
    document.querySelector('#vote form input[type="submit"]').click()
}