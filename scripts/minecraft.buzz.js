chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.captchaPassed === true || request.captchaPassed === 'double') {
        document.querySelector('#recaptchamodal #submitter').click();
    }
});

async function vote(first) {
    // if (first) return

    const project = await getProject();

    // Wait for username input to appear
    while (!document.getElementById('username-input')) {
        await wait(1000);
    }

    // Handle review checkbox
    let input = document.getElementById('review-check');
    input.focus();
    input.checked = false;

    await wait(1000);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // Focus the username input
    input = document.getElementById('username-input');
    input.focus();
    input.value = ''; // Clear it first (optional)

    // 💡 TYPE EACH CHARACTER WITH DELAY
    const nick = project.nick;
    for (let i = 0; i < nick.length; i++) {
        const char = nick[i];

        // Insert character into input
        input.value += char;

        // Dispatch 'input' event after each character (for live listeners)
        input.dispatchEvent(new Event('input', { bubbles: true }));

        // Optional: Also dispatch key events for realism (though not required for value change)
        const keyEventProps = {
            bubbles: true,
            cancelable: true,
            view: window,
            key: char,
            code: `Key${char.toUpperCase()}`, // Approximation — fine for most cases
            keyCode: char.charCodeAt(0),      // Deprecated but sometimes still listened to
            which: char.charCodeAt(0)
        };

        input.dispatchEvent(new KeyboardEvent('keydown', keyEventProps));
        input.dispatchEvent(new KeyboardEvent('keypress', keyEventProps)); // if needed
        input.dispatchEvent(new KeyboardEvent('keyup', keyEventProps));

        // Small random delay between keystrokes (human-like)
        await wait(50 + Math.random() * 150); // 50ms to 200ms
    }

    // Final focus and events
    input.focus();
    input.dispatchEvent(new Event('change', { bubbles: true })); // optional final 'change'

    await wait(1000);

    // Submit
    document.querySelector('#submitter').click();

    await wait(20000);
}

const timer = setInterval(()=>{
    try {
        if (document.getElementById('message')) {
            const request = {}
            request.message = document.getElementById('message').textContent.trim()
            if (request.message.includes('Thank you for voting')) {
                chrome.runtime.sendMessage({successfully: true})
            } else if (request.message.includes('already voted')) {
                chrome.runtime.sendMessage({later: true})
            } else {
                if (request.message.includes('proxy') || request.message.includes('Captcha') || request.message.includes('Username can\'t be empty')) {
                    request.ignoreReport = true
                }
                chrome.runtime.sendMessage(request)
            }
            clearInterval(timer)
        }
    } catch (e) {
        clearInterval(timer)
        throwError(e)
    }
}, 1000)