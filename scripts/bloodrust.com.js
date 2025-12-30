// noinspection ES6MissingAwait

async function vote(first) {
    // Don't run on Steam domain (auth redirect)
    if (document.URL.includes('steamcommunity.com')) {
        return
    }

    // Only run on bloodrust.com domain
    if (!document.URL.includes('bloodrust.com')) {
        return
    }

    // Only run for wheel spin, not for promo code activation
    if (document.URL.includes('/home')) {
        return
    }

    // Execute only on first run
    if (first === false) return

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Find the spin button (first button with "Крутить" text)
    const spinButton = Array.from(document.querySelectorAll('button')).find(btn =>
        btn.textContent.includes('Крутить')
    )

    if (!spinButton) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Spin button not found'})
        return
    }

    // Check if button is disabled (cooldown active)
    if (spinButton.disabled) {
        // Try to find cooldown text
        const cooldownText = document.querySelector('.text-muted-foreground')

        if (cooldownText) {
            const text = cooldownText.textContent.trim()

            // Try to extract time in format HH:MM:SS or H:MM:SS
            const timeMatch = text.match(/(\d+):(\d+):(\d+)/)
            if (timeMatch) {
                const hours = parseInt(timeMatch[1])
                const minutes = parseInt(timeMatch[2])
                const seconds = parseInt(timeMatch[3])
                const milliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000)
                chrome.runtime.sendMessage({later: Date.now() + milliseconds + (1 * 60 * 1000)}) // +1 minute buffer
                return
            }
        }

        // If we couldn't parse the time, just set timer to 24 hours
        chrome.runtime.sendMessage({later: Date.now() + (24 * 60 * 60 * 1000)})
        return
    }

    // Click the spin button
    spinButton.click()

    // Wait for spin animation and result
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Check for success - the button should be disabled again after successful spin
    if (spinButton.disabled) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }

    // If button is still enabled, something might have gone wrong
    chrome.runtime.sendMessage({message: 'Spin completed but status unclear'})
}
