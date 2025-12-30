// noinspection ES6MissingAwait

// ============================================================================
// Constants
// ============================================================================
const SELECTORS = {
    notification: '.notyf__message',
    moddedButton: 'button.change-gmod[data-gmod="modded"]',
    freeCaseButton: '.products__card .products__card-btn-free',
    productCard: '.products__card',
    modal: '.modal[data-product-id="5"], .modal[data-modal="product-5"]',
    authButton: '.auth-btn, .modal-simple-cmd__btn-auth',
    openCaseButton: '.modal-product-buy',
    errorMessage: '.alert-danger, .error-message',
    successMessage: '.alert-success, .success-message, .modal-roulette__result'
}

const MESSAGES = {
    cooldown: ['10 часов', '10 hours', 'доступен каждые'],
    success: ['успешно', 'success'],
    insufficientFunds: 'Недостаточно средств'
}

const TIMEOUTS = {
    moddedButtonClick: 1000,
    modalAppear: 150,
    modalMaxAttempts: 20,
    buttonReady: 500,
    waitResult: 2500
}

// ============================================================================
// Helper Functions
// ============================================================================
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function sendError(message) {
    chrome.runtime.sendMessage({ errorVoteNoElement: message })
}

function sendCooldown() {
    chrome.runtime.sendMessage({ later: true })
}

function sendSuccess() {
    chrome.runtime.sendMessage({ successfully: Date.now() })
}

function sendMessage(text) {
    chrome.runtime.sendMessage({ message: text })
}

function containsAny(text, keywords) {
    return keywords.some(keyword => text.includes(keyword))
}

// ============================================================================
// Message Handlers
// ============================================================================
function handleNotificationMessage(text) {
    if (containsAny(text, MESSAGES.cooldown)) {
        sendCooldown()
        return true
    }
    if (containsAny(text, MESSAGES.success)) {
        sendSuccess()
        return true
    }
    if (text.includes(MESSAGES.insufficientFunds)) {
        sendMessage('ERROR: Opened wrong case (not free). Got: ' + text)
        return true
    }
    return false
}

function checkInitialNotification() {
    const notification = document.querySelector(SELECTORS.notification)
    if (!notification) return false

    const text = notification.textContent.trim()
    return handleNotificationMessage(text)
}

// ============================================================================
// UI Interaction Functions
// ============================================================================
async function activateModdedMode() {
    const button = document.querySelector(SELECTORS.moddedButton)
    if (!button) {
        sendError('Modded button not found')
        return false
    }

    if (!button.classList.contains('active')) {
        button.click()
        await wait(TIMEOUTS.moddedButtonClick)
    }
    return true
}

function validateFreeCase() {
    const freeCaseButton = document.querySelector(SELECTORS.freeCaseButton)
    if (!freeCaseButton) {
        sendError('Free case button not found')
        return null
    }

    const freeCase = freeCaseButton.closest(SELECTORS.productCard)
    if (!freeCase) {
        sendError('Could not find parent card for free button')
        return null
    }

    // Check if case is for modded mode
    const gmodAttr = freeCase.getAttribute('data-gmod')
    if (!gmodAttr || !gmodAttr.includes('modded')) {
        sendError('Free case not available for modded mode')
        return null
    }

    // Check visibility
    const style = window.getComputedStyle(freeCase)
    if (style.display === 'none' || !freeCase.offsetParent) {
        sendError('Free case is hidden')
        return null
    }

    return freeCaseButton
}

async function waitForModal() {
    for (let i = 0; i < TIMEOUTS.modalMaxAttempts; i++) {
        await wait(TIMEOUTS.modalAppear)

        const modal = document.querySelector(SELECTORS.modal)
        if (modal && modal.classList.contains('modal-on')) {
            return modal
        }
    }

    // Check if cooldown message appeared
    const notification = document.querySelector(SELECTORS.notification)
    if (notification && containsAny(notification.textContent, MESSAGES.cooldown)) {
        sendCooldown()
        return null
    }

    sendError('Modal did not appear')
    return null
}

async function handleModalActions(modal) {
    await wait(TIMEOUTS.buttonReady)

    // Check if user needs to authenticate
    const authButton = modal.querySelector(SELECTORS.authButton)
    if (authButton) {
        authButton.click()
        return false
    }

    // Try to open the case
    const openCaseButton = modal.querySelector(SELECTORS.openCaseButton)
    if (!openCaseButton) {
        sendError('Open case button not found in modal')
        return false
    }

    openCaseButton.click()
    return true
}

// ============================================================================
// Result Checking Functions
// ============================================================================
function checkNotificationResult() {
    const notification = document.querySelector(SELECTORS.notification)
    if (!notification) return false

    const text = notification.textContent.trim()
    if (handleNotificationMessage(text)) {
        return true
    }

    // Unknown error
    sendMessage(text)
    return true
}

function checkErrorMessages() {
    const errorMsg = document.querySelector(SELECTORS.errorMessage)
    if (!errorMsg) return false

    const text = errorMsg.textContent.trim()
    if (containsAny(text, MESSAGES.cooldown)) {
        sendCooldown()
        return true
    }

    sendMessage(text)
    return true
}

function checkSuccessMessages() {
    const successMsg = document.querySelector(SELECTORS.successMessage)
    if (successMsg) {
        sendSuccess()
        return true
    }
    return false
}

// ============================================================================
// Main Vote Function
// ============================================================================
async function vote(first) {
    // Check for immediate messages
    if (checkInitialNotification()) {
        return
    }

    // Execute only on first run
    if (first === false) return

    // Step 1: Activate modded mode
    if (!await activateModdedMode()) {
        return
    }

    // Step 2: Validate and click free case
    const freeCaseButton = validateFreeCase()
    if (!freeCaseButton) {
        return
    }
    freeCaseButton.click()

    // Step 3: Wait for modal and handle it
    const modal = await waitForModal()
    if (!modal) {
        return
    }

    const caseOpened = await handleModalActions(modal)
    if (!caseOpened) {
        return
    }

    // Step 4: Wait for result and check messages
    await wait(TIMEOUTS.waitResult)

    // Check in order of priority
    if (checkNotificationResult()) return
    if (checkErrorMessages()) return
    if (checkSuccessMessages()) return

    // If we got here, assume success
    sendSuccess()
}
