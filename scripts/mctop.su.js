async function vote(first) {
    if (document.getElementById('summary') != null) {
        if (document.getElementById('summary').textContent.includes('Ошибка проверки CSRF')) {
            //Костыль костыля, перезагружаем страницу в случае возникновения Ошибки проверки CSRF (данная ошибка выскакивает после прохождения проверки CloudFlare)
            document.location.replace(document.URL)
            return
        } else if (document.querySelector('#summary > h1') != null && document.querySelector('#summary > p') != null) {
            chrome.runtime.sendMessage({message: document.getElementById('summary').textContent})
            return
        }
    }

    if (document.querySelector('#container > h1')) {
        let request = {}
        request.message = document.querySelector('#container > h1').textContent
        if (document.querySelector('#container > h1').nextElementSibling) {
            request.message = request.message + ' ' + document.querySelector('#container > h1').nextElementSibling.textContent
        }
        if (request.message.toLowerCase().includes('ошибка авторизации через социальную сеть')) {
            request.ignoreReport = true
        }
        chrome.runtime.sendMessage(request)
        return
    }

    const verifyUUID = crypto.randomUUID()
    window.portIsTrusted.dataset.avrId = verifyUUID

    //Авторизованы ли мы в аккаунте?
    if (!document.querySelector('#userLoginWrap').classList.contains('hidden')) {
        window.portIsTrusted.dataset.ITtype = 'click'
        document.querySelector('.voteBtn').dispatchEvent(new CustomEvent('mousedown', {detail: {avrId: verifyUUID, eventName: 'MouseEvent', eventType: 'mousedown', isTrusted: true, detail: 1}}))
        document.querySelector('.voteBtn').click()
        window.portIsTrusted.dataset.ITtype = null
        return
    }

    if (first) return

    const project = await getProject()

    document.querySelector('input[name=nick]').value = project.nick
    window.portIsTrusted.dataset.ITtype = 'click'
    document.querySelector('.voteBtn').dispatchEvent(new CustomEvent('mousedown', {detail: {avrId: verifyUUID, eventName: 'MouseEvent', eventType: 'mousedown', isTrusted: true, detail: 1}}))
    document.querySelector('.voteBtn').click()
    window.portIsTrusted.dataset.ITtype = null
}

let fixTimer
const timer = setInterval(()=>{
    try {
        //Ищет надпись в которой написано что вы проголосовали или вы уже голосовали, по этой надписи скрипт завершается
        if (document.readyState === 'complete' && document.querySelectorAll('div[class=tooltip-inner]').item(0) != null) {
            const textContent = document.querySelectorAll('div[class=tooltip-inner]').item(0).textContent.toLowerCase()
            if (
                textContent.includes('уже голосовали')
                || textContent.includes('уже проголосовали')
                || textContent.includes('сможете проголосовать')
                || textContent.includes('вы сегодня голосовали')
                || textContent.includes('вы сегодня проголосовали')
                || textContent.includes('голос уже был учтен')) {
                chrome.runtime.sendMessage({later: true})
            } else if (textContent.includes('за ваш голос')
                || textContent.includes('спасибо за голос')
                ||  textContent.includes('голос принят')
                || textContent.includes('голос засчитан')
                || textContent.includes('успех')
                || textContent.includes('успешн')) {
                chrome.runtime.sendMessage({successfully: true})
            } else if (
                    textContent.includes('некорректный ник')
                    || textContent.includes('ваш айпи находится в базе данных спамеров')
                    || textContent.includes('ваш айпи попал в базу данных спамеров')
                    || (textContent.includes('код ошибки') && textContent.includes('обновить страницу'))
                    || textContent.includes('ошибка авторизации через социальную сеть')
                    || textContent.includes('ошибка 500')
                    || textContent === 'ошибка'
                    || textContent.includes('капча временно не работает')
                    || textContent.includes('аккаунт заблокирован')) {
                chrome.runtime.sendMessage({message: document.querySelectorAll('div[class=tooltip-inner]').item(0).textContent, ignoreReport: true})
            } else if (textContent.includes('поставьте галочку в капче') || textContent.includes('обязательное поле')) {
                return
            } else {
                chrome.runtime.sendMessage({message: document.querySelectorAll('div[class=tooltip-inner]').item(0).textContent})
            }
            clearInterval(timer)
            clearTimeout(fixTimer)
        }
    } catch (e) {
        clearInterval(timer)
        clearTimeout(fixTimer)
        throwError(e)
    }
}, 1000)

//Фикс-костыль на случай если у нас ошибка в vote запросе
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        if (entry.name === 'https://mctop.su/projects/vote/') {
            fixTimer = setTimeout(()=>{
                chrome.runtime.sendMessage({message: 'Мы получили что vote запрос прошёл но ответ от McTOP так и не поступил, скорее всего в vote запросе произошла ошибка, смотрите подробности в консоли в момент голосования', ignoreReport: true})
            }, 5000)
        }
    }
})
observer.observe({
    entryTypes: ["resource"]
})