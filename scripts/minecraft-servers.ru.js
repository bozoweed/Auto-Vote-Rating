async function vote(first) {
    if (checkAnswer()) {
        return;
    }

    const spans = document.querySelectorAll('section.container > div > span');
    const voteToggle = spans[1]?.parentElement;

    if (!voteToggle) {
        const watcher = setInterval(() => {
            if (checkAnswer()) {
                clearInterval(watcher);
            }
        }, 1000);
        return;
    }

    voteToggle.click();
    await wait(1000);

    const project = await getProject();
    const nickInput = await waitForElement('#username', 5000);

    if (!nickInput) {
        return;
    }

    nickInput.value = project.nick;

    const inputEvent = typeof InputEvent === 'function'
        ? new InputEvent('input', { bubbles: true, cancelable: true })
        : new Event('input', { bubbles: true, cancelable: true });

    nickInput.dispatchEvent(inputEvent);

    await wait(1000);

    const submitButton = document.querySelector('button.app_btn');

    if (submitButton) {
        submitButton.click();
        await waitForToast();
    }
}

async function waitForToast(timeout = 15000, interval = 500) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        if (checkAnswer()) {
            return;
        }

        await wait(interval);
    }
}

async function waitForElement(selector, timeout = 5000, step = 100) {
    const start = Date.now();
    let element = document.querySelector(selector);

    while (!element && Date.now() - start < timeout) {
        await wait(step);
        element = document.querySelector(selector);
    }

    return element || null;
}

function getToastText(selectors, classKeyword) {
    for (const selector of selectors) {
        const node = document.querySelector(selector);
        const text = node?.textContent?.trim();

        if (text) {
            return text;
        }
    }

    if (classKeyword) {
        const nodes = document.querySelectorAll('div.flex.items-center > div');

        for (const node of nodes) {
            const wrapperClass = `${node.parentElement?.className || ''} ${node.parentElement?.parentElement?.className || ''}`;
            const text = node.textContent?.trim();

            if (text && wrapperClass.includes(classKeyword)) {
                return text;
            }
        }
    }

    return '';
}

function checkAnswer() {
    const successMessage = getToastText([
        'div.text-green-800 div.flex.items-center > div',
        'div.text-green-700 div.flex.items-center > div',
        'div.text-emerald-800 div.flex.items-center > div',
        'div.text-emerald-700 div.flex.items-center > div',
        'div.bg-green-50 div.flex.items-center > div'
    ], 'text-green');

    if (successMessage) {
        chrome.runtime.sendMessage({ successfully: true, message: successMessage });
        return true;
    }

    const errorMessage = getToastText([
        'div.text-red-800 div.flex.items-center > div',
        'div.text-red-700 div.flex.items-center > div',
        'div.text-rose-800 div.flex.items-center > div',
        'div.bg-red-50 div.flex.items-center > div'
    ], 'text-red');

    if (!errorMessage) {
        return false;
    }

    const normalized = errorMessage.toLowerCase();

    if (normalized.includes('too many voting attempts')) {
        chrome.runtime.sendMessage({ later: true });
    } else if (normalized.includes('vote sent successfully') || normalized.includes('successfully sent')) {
        chrome.runtime.sendMessage({ successfully: true, message: errorMessage });
    } else {
        const request = { message: errorMessage };
        chrome.runtime.sendMessage(request);
    }

    return true;
}