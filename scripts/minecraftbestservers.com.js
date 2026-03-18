async function vote(first) {
  // Success message - green notification
  if (document.querySelector('div[class*="bg-green-"][x-data="{ show: true }"]')) {
    const message = document.querySelector('div.bg-green-500[x-data="{ show: true }"]')?.innerText
    if (message?.includes('vote has been counted')) {
      chrome.runtime.sendMessage({successfully: true})
    } else {
      chrome.runtime.sendMessage({message})
    }
    return
  }

  // Error message - red notification (Alpine.js: x-show + x-text OR x-data)
  const errorDiv = document.querySelector('div.bg-red-500[x-show][x-text]') || document.querySelector('div[class*="bg-red-"][x-data="{ show: true }"]')
  if (errorDiv) {
  	const request = {}
  	request.message = errorDiv?.innerText
    if (request.message?.includes('failed the security challenge')) {
      // None
    } else if (request.message?.toLowerCase().includes('already voted')) {
      chrome.runtime.sendMessage({later: true})
      return
    } else {
      if (request.message?.includes('Server does not exist')) {
        request.ignoreReport = true
        request.retryCoolDown = 21600000
      } else if (request.message?.toLowerCase().includes('could not send vote via votifier')) {
        request.ignoreReport = true
      }
      chrome.runtime.sendMessage(request)
      return
    }
  }

  // Check for rate limit message - specific paragraph element
  const rateLimitP = document.querySelector('p.mb-6.font-normal')
  if (rateLimitP?.innerText?.includes('Come back tomorrow to vote in the next period')) {
    const style = getComputedStyle(rateLimitP)
    if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
      chrome.runtime.sendMessage({later: true})
      return
    }
  }

  // Check if vote form elements exist
  const usernameInput = document.querySelector('#username')
  const submitBtn = document.querySelector('section[x-show="!submitting"] button.bg-sandstone-600') || document.querySelector('button.bg-sandstone-600')
  
  if (!usernameInput || !submitBtn) return

  if (first) {
    // No captcha detected, signal ready to proceed
    chrome.runtime.sendMessage({captchaPassed: true})
    return
  }

  const project = await getProject()
  if (usernameInput) {
    usernameInput.value = project.nick
  }
  if (submitBtn) {
    submitBtn.click()
  }
}
