async function vote(first) {
    

    // if (first) return
    if (document.querySelectorAll("section.container  > div > span")[1] == null) {
        const timer = setInterval(() => {
            if (checkAnswer()) {
                clearInterval(timer)
            }
        }, 1000)
        return
    }
    const project = await getProject()
    document.querySelectorAll("section.container  > div > span")[1].parentNode.click()
    await wait(1000)
    document.querySelector('input[id="username"]').value = project.nick
    const nickInput = document.querySelector('input[id="username"]')
    nickInput.value = project.nick
    const nickInputEvent = new InputEvent('input', {bubbles: true, cancelable: true});
    nickInput.dispatchEvent(nickInputEvent);
    await wait(1000)
    document.querySelector('button.app_btn > img').parentElement.click()
}



function checkAnswer() {
    // Alerts.Вы уже голосовали сегодня
    const toast = document.querySelector("div.text-red-800 > div.flex.items-center > div").innerText
    const wintoast = document.querySelector("div.text-green-800 > div.flex.items-center > div").innerText
    if (toast) {
        const request = {}
        request.message = toast.trim()
        /*if (request.message.includes('Vote sent successfully')) {// nothing for now i will finish that latter
            chrome.runtime.sendMessage({successfully: true})
            return true
        } else*/ if (request.message.includes('Alerts.Вы уже голосовали сегодня')) {
            chrome.runtime.sendMessage({later: true})
            return true
        } else {
            chrome.runtime.sendMessage({successfully: true})
            // chrome.runtime.sendMessage(request)
            return true
        }
    }
    if (wintoast) {       
        chrome.runtime.sendMessage({successfully: true})
        return true
    }
    return false
}