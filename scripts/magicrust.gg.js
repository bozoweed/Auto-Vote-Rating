// noinspection ES6MissingAwait

async function vote(first) {
    // Only run on magicrust.gg domain
    if (!document.URL.includes('magicrust.gg')) {
        return
    }

    // Check for success/error messages first (before performing actions)
    const initialNotyfMessage = document.querySelector('.notyf__message')
    if (initialNotyfMessage) {
        const text = initialNotyfMessage.textContent.trim()
        if (text.includes('10 часов') || text.includes('10 hours') || text.includes('доступен каждые')) {
            chrome.runtime.sendMessage({later: Date.now() + (10 * 60 * 60 * 1000) + (1 * 60 * 1000)})
            return
        }
        if (text.includes('успешно') || text.includes('success')) {
            chrome.runtime.sendMessage({successfully: true})
            return
        }
    }

    // Execute only on first run (like loliland.ru.js)
    if (first === false) return

    // Step 1: Click on "Modded" button
    const gmodButton = document.querySelector('button.change-gmod[data-gmod="modded"]')
    if (!gmodButton) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Modded button not found'})
        return
    }

    // Click the modded button first if not already active
    if (!gmodButton.classList.contains('active')) {
        gmodButton.click()
        // Wait a bit for the page to update
        await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Step 2: Find the free case button and get its parent card
    const freeCaseButton = document.querySelector('.products__card .products__card-btn-free')
    if (!freeCaseButton) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Free case button not found'})
        return
    }

    // Get the parent card element
    const freeCase = freeCaseButton.closest('.products__card')
    if (!freeCase) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Could not find parent card for free button'})
        return
    }

    // Check if case is visible (has modded in data-gmod attribute)
    const gmodAttr = freeCase.getAttribute('data-gmod')
    if (!gmodAttr || !gmodAttr.includes('modded')) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Free case not available for modded mode'})
        return
    }

    // Check if case has display: none or is hidden
    const computedStyle = window.getComputedStyle(freeCase)
    if (computedStyle.display === 'none' || !freeCase.offsetParent) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Free case is hidden'})
        return
    }

    // Click the free case button
    freeCaseButton.click()

    // Wait for modal to appear (look for the specific modal for product 5)
    let modalAppeared = false
    let targetModal = null

    for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 150))

        // Look for modal with data-product-id="5" or data-modal="product-5"
        const modal5 = document.querySelector('.modal[data-product-id="5"], .modal[data-modal="product-5"]')

        if (modal5 && modal5.classList.contains('modal-on')) {
            targetModal = modal5
            modalAppeared = true
            break
        }
    }

    if (!modalAppeared) {
        // Maybe notyf message already appeared (error case)
        const notyfCheck = document.querySelector('.notyf__message')
        if (notyfCheck && notyfCheck.textContent.includes('10 часов')) {
            chrome.runtime.sendMessage({later: Date.now() + (10 * 60 * 60 * 1000) + (1 * 60 * 1000)})
            return
        }
        chrome.runtime.sendMessage({errorVoteNoElement: 'Modal did not appear'})
        return
    }

    // Additional wait for button to be ready
    await new Promise(resolve => setTimeout(resolve, 500))

    // Step 3: Check for auth button or open case button in modal
    const authButton = targetModal.querySelector('.auth-btn, .modal-simple-cmd__btn-auth')
    if (authButton) {
        // User not authorized - click auth button to redirect to Steam login
        authButton.click()
        return
    }

    const openCaseButton = targetModal.querySelector('.modal-product-buy')
    if (!openCaseButton) {
        chrome.runtime.sendMessage({errorVoteNoElement: 'Open case button not found in modal'})
        return
    }

    openCaseButton.click()

    // Wait for the result
    await new Promise(resolve => setTimeout(resolve, 2500))

    // Check for error notification (notyf)
    const notyfMessage = document.querySelector('.notyf__message')
    if (notyfMessage) {
        const text = notyfMessage.textContent.trim()
        if (text.includes('10 часов') || text.includes('10 hours') || text.includes('доступен каждые')) {
            // Case available every 10 hours - set timer
            chrome.runtime.sendMessage({later: Date.now() + (10 * 60 * 60 * 1000) + (1 * 60 * 1000)})
            return
        }
        if (text.includes('Недостаточно средств')) {
            // Wrong case opened! This shouldn't happen with free case
            chrome.runtime.sendMessage({message: 'ERROR: Opened wrong case (not free). Got: ' + text})
            return
        }
        if (text.includes('успешно') || text.includes('success')) {
            chrome.runtime.sendMessage({successfully: true})
            return
        }
        // Other error message
        chrome.runtime.sendMessage({message: text})
        return
    }

    // Check for other error messages
    const errorMessage = document.querySelector('.alert-danger, .error-message')
    if (errorMessage) {
        const text = errorMessage.textContent.trim()
        if (text.includes('10 часов') || text.includes('10 hours')) {
            chrome.runtime.sendMessage({later: Date.now() + (10 * 60 * 60 * 1000) + (1 * 60 * 1000)})
            return
        }
        chrome.runtime.sendMessage({message: text})
        return
    }

    // Check for success messages
    const successMessage = document.querySelector('.alert-success, .success-message, .modal-roulette__result')
    if (successMessage) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }

    // If we got here, assume success (the case was opened)
    chrome.runtime.sendMessage({successfully: true})
}
