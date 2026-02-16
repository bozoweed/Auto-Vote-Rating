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
    chrome.runtime.sendMessage({errorVoteNoElement: message})
}

function sendCooldown(nextVoteTime) {
    chrome.runtime.sendMessage({later: nextVoteTime || true})
}

function sendSuccess() {
    chrome.runtime.sendMessage({successfully: Date.now()})
}

function sendMessage(text) {
    chrome.runtime.sendMessage({message: text})
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
    // Delegate to appropriate function based on URL
    if (document.URL.includes('/wheel-fortune')) {
        return await voteWheelFortune(first)
    } else {
        return await voteFreeCase(first)
    }
}

// ============================================================================
// Free Daily Case Vote Function
// ============================================================================
async function voteFreeCase(first) {
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

// ============================================================================
// Wheel Fortune Vote Function
// ============================================================================

// Wheel Fortune Selectors
const WHEEL_SELECTORS = {
    spinButton: 'button.wheel-button, button[class*="wheel"], button[class*="spin"]',
    cooldownTimer: '.wheel-fortune__wheel-timer-lost, .wheel-timer, .cooldown, [class*="timer"], [class*="cooldown"]',
    notification: '.notification, .alert, .toast',
    successMessage: '.success, [class*="success"]',
    errorMessage: '.error, [class*="error"]'
}

const WHEEL_TIMEOUTS = {
    pageLoad: 2000,
    spinAnimation: 5000,
    checkResult: 1000,
    cooldownCheck: 500
}

// Cooldown Parsing Functions
function parseCooldownTime(text) {
    // Try to parse format "21 ч. 59 м. 2 с." (Russian format from magicrust.gg)
    const russianMatch = text.match(/(\d+)\s*ч\.\s*(\d+)\s*м\.\s*(\d+)\s*с\./)
    if (russianMatch) {
        const hours = parseInt(russianMatch[1])
        const minutes = parseInt(russianMatch[2])
        const seconds = parseInt(russianMatch[3])
        const milliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000)
        return Date.now() + milliseconds + (30 * 1000) // +30 seconds buffer
    }

    // Try to find time in format HH:MM:SS or H:MM:SS
    const timeMatch = text.match(/(\d+):(\d+):(\d+)/)
    if (timeMatch) {
        const hours = parseInt(timeMatch[1])
        const minutes = parseInt(timeMatch[2])
        const seconds = parseInt(timeMatch[3])
        const milliseconds = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000)
        return Date.now() + milliseconds + (1 * 60 * 1000) // +1 minute buffer
    }

    // Try to find hours in text (e.g., "22 часа", "22 hours")
    const hoursMatch = text.match(/(\d+)\s*(час|hour)/i)
    if (hoursMatch) {
        const hours = parseInt(hoursMatch[1])
        return Date.now() + (hours * 60 * 60 * 1000) + (1 * 60 * 1000)
    }

    return null
}

function getCooldownFromPage() {
    // Try to find cooldown timer elements
    const timerElements = document.querySelectorAll(WHEEL_SELECTORS.cooldownTimer)

    for (const element of timerElements) {
        const text = element.textContent.trim()
        const cooldownTime = parseCooldownTime(text)
        if (cooldownTime) {
            return cooldownTime
        }
    }

    // Default to 22 hours if we can't parse
    return Date.now() + (22 * 60 * 60 * 1000)
}

// Button Finding
function findSpinButton() {
    // Try specific selectors first
    let button = document.querySelector(WHEEL_SELECTORS.spinButton)
    if (button) return button

    // Try to find button by text content
    const buttons = document.querySelectorAll('button')
    button = Array.from(buttons).find(btn => {
        const text = btn.textContent.toLowerCase()
        return text.includes('крутить') ||
               text.includes('spin') ||
               text.includes('вращ') ||
               text.includes('колесо')
    })

    return button
}

async function voteWheelFortune(first) {
    // Don't run on Steam domain (auth redirect)
    if (document.URL.includes('steamcommunity.com')) {
        return
    }

    // Execute only on first run
    if (first === false) return

    // Wait for page to load
    await wait(WHEEL_TIMEOUTS.pageLoad)

    // Check if cooldown timer is already visible (BEFORE clicking button)
    const timerElement = document.querySelector('.wheel-fortune__wheel-timer-lost')
    if (timerElement && timerElement.offsetParent !== null) {
        // Timer is visible - cooldown is active
        const cooldownTime = getCooldownFromPage()
        sendCooldown(cooldownTime)
        return
    }

    // Find the spin button
    const spinButton = findSpinButton()

    if (!spinButton) {
        sendError('Кнопка вращения колеса не найдена')
        return
    }

    // Check if button is disabled (cooldown active)
    if (spinButton.disabled || spinButton.classList.contains('disabled')) {
        const cooldownTime = getCooldownFromPage()
        sendCooldown(cooldownTime)
        return
    }

    // Check button style - sometimes buttons are visually disabled via opacity/pointer-events
    const computedStyle = window.getComputedStyle(spinButton)
    if (computedStyle.pointerEvents === 'none' ||
        computedStyle.opacity === '0' ||
        computedStyle.opacity === '0.5') {
        const cooldownTime = getCooldownFromPage()
        sendCooldown(cooldownTime)
        return
    }

    // Button is enabled - click to spin
    spinButton.click()

    // Wait for spin animation and result
    await wait(WHEEL_TIMEOUTS.spinAnimation)

    // Check for success indicators
    const successMsg = document.querySelector(WHEEL_SELECTORS.successMessage)
    if (successMsg) {
        sendSuccess()

        // Try to get new cooldown time after successful spin
        await wait(WHEEL_TIMEOUTS.cooldownCheck)
        const cooldownTime = getCooldownFromPage()
        if (cooldownTime) {
            chrome.runtime.sendMessage({later: cooldownTime})
        }
        return
    }

    // Check if button is disabled after spin (indicates success)
    if (spinButton.disabled || spinButton.classList.contains('disabled')) {
        sendSuccess()

        // Try to get new cooldown time after successful spin
        await wait(WHEEL_TIMEOUTS.cooldownCheck)
        const cooldownTime = getCooldownFromPage()
        if (cooldownTime) {
            chrome.runtime.sendMessage({later: cooldownTime})
        }
        return
    }

    // Check if timer appeared after spin (indicates success)
    const timerAfterSpin = document.querySelector('.wheel-fortune__wheel-timer-lost')
    if (timerAfterSpin && timerAfterSpin.offsetParent !== null) {
        sendSuccess()

        // Get new cooldown time
        const cooldownTime = getCooldownFromPage()
        if (cooldownTime) {
            chrome.runtime.sendMessage({later: cooldownTime})
        }
        return
    }

    // Check for error messages
    const errorMsg = document.querySelector(WHEEL_SELECTORS.errorMessage)
    if (errorMsg) {
        const errorText = errorMsg.textContent.trim()
        if (errorText.toLowerCase().includes('кулдаун') ||
            errorText.toLowerCase().includes('cooldown') ||
            errorText.toLowerCase().includes('доступно через')) {
            const cooldownTime = getCooldownFromPage()
            sendCooldown(cooldownTime)
            return
        }
        sendMessage(errorText)
        return
    }

    // If we got here, assume success
    sendSuccess()

    // Try to get cooldown time
    await wait(WHEEL_TIMEOUTS.cooldownCheck)
    const cooldownTime = getCooldownFromPage()
    if (cooldownTime) {
        chrome.runtime.sendMessage({later: cooldownTime})
    }
}
