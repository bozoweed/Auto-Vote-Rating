function parseAMPM(timeStr) {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
    if (!match) return null
    let hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const period = match[3].toUpperCase()
    if (period === 'AM') {
        if (hours === 12) hours = 0
    } else {
        if (hours !== 12) hours += 12
    }
    return hours * 60 + minutes
}

function sendResult(cooldownDiv) {
    if (cooldownDiv) {
        const cooldownText = cooldownDiv.textContent
        const regex = /The time is\s+(\d{1,2}:\d{2}\s*[AP]M)\.\s*You can vote again at\s+(\d{1,2}:\d{2}\s*[AP]M)/i
        const match = cooldownText.match(regex)
        if (match) {
            const currentMinutes = parseAMPM(match[1])
            const nextMinutes = parseAMPM(match[2])
            if (currentMinutes !== null && nextMinutes !== null) {
                let deltaMinutes = nextMinutes - currentMinutes
                if (deltaMinutes <= 0) deltaMinutes += 24 * 60
                const msg = { later: Date.now() + deltaMinutes * 60 * 1000}
                if(window.localStorage.topMineCraftServersJustVoted ==="true"){
                    msg.successfully = true
                    window.localStorage.topMineCraftServersJustVoted = false
                }
                chrome.runtime.sendMessage(msg)
                return
            }
        }
    }else{
        chrome.runtime.sendMessage({later: true})
    }  
    
}

async function vote(first) {
    if (first === false) return
    if (document.querySelector('div.row > div.col-md-4 > button')) {
        const button = document.querySelector('div.row > div.col-md-4 > button')
        const buttonText = button.textContent.toLowerCase()
        if (buttonText.includes('thanks for voting')) {
            sendResult(button.parentElement.querySelector('div.text-center.small'))
        } else {
            chrome.runtime.sendMessage({later:true,message: button.textContent})
        }
    } else {
        const timer = setInterval(async ()=>{
            try {
                if (document.querySelector('input[name="t"]') != null && document.querySelector('input[name="t"]').value !== '') {
                    clearInterval(timer)
                    const project = await getProject()
                    window.localStorage.topMineCraftServersJustVoted = true
                    document.getElementById('username').value = project.nick
                    document.getElementById('voteButton').click()
                }
            } catch (e) {
                clearInterval(timer)
                throwError(e)
            }
        }, 1000)
    }
}
