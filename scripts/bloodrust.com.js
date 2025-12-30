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
        // Find all elements with cooldown text class
        const allMutedElements = document.querySelectorAll('.text-muted-foreground')

        // Search for element containing cooldown message
        const cooldownText = Array.from(allMutedElements).find(el =>
            el.textContent.includes('вращение будет доступно через')
        )

        if (cooldownText) {
            const text = cooldownText.textContent.trim()

            // Extract time in format HH:MM:SS or H:MM:SS
            const timeMatch = text.match(/(\d+):(\d+):(\d+)/)

            if (timeMatch) {
                const hours = parseInt(timeMatch[1])
                const minutes = parseInt(timeMatch[2])
                const seconds = parseInt(timeMatch[3])
                const milliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000)
                const nextVoteTime = Date.now() + milliseconds + (1 * 60 * 1000) // +1 minute buffer

                chrome.runtime.sendMessage({later: nextVoteTime})
                return
            }
        }

        // If we couldn't parse the time, set timer to 24 hours
        chrome.runtime.sendMessage({later: Date.now() + (24 * 60 * 60 * 1000)})
        return
    }

    // Button is enabled - click to spin
    spinButton.click()

    // Wait for spin animation and result
    await new Promise(resolve => setTimeout(resolve, 5000))

    // Check for success - the button should be disabled again after successful spin
    if (spinButton.disabled) {
        chrome.runtime.sendMessage({successfully: true})

        // Try to get the new cooldown time after successful spin
        await new Promise(resolve => setTimeout(resolve, 1000))

        const allMutedElements = document.querySelectorAll('.text-muted-foreground')
        const cooldownText = Array.from(allMutedElements).find(el =>
            el.textContent.includes('вращение будет доступно через')
        )

        if (cooldownText) {
            const text = cooldownText.textContent.trim()
            const timeMatch = text.match(/(\d+):(\d+):(\d+)/)

            if (timeMatch) {
                const hours = parseInt(timeMatch[1])
                const minutes = parseInt(timeMatch[2])
                const seconds = parseInt(timeMatch[3])
                const milliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000)
                const nextVoteTime = Date.now() + milliseconds + (1 * 60 * 1000)

                chrome.runtime.sendMessage({later: nextVoteTime})
            }
        }
        return
    }

    // If button is still enabled, something might have gone wrong
    chrome.runtime.sendMessage({message: 'Spin completed but status unclear'})
}
