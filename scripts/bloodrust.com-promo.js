// noinspection ES6MissingAwait

async function vote(first) {
    // Only run on bloodrust.com domain
    if (!document.URL.includes('bloodrust.com')) {
        return
    }

    // Execute only on first run
    if (first === false) return

    const PROMO_REGEX = /(?:Промокод|Промик|Промо).*?(?::|—)\s*([A-Za-z0-9]{5,10})/i

    try {
        console.log('[bloodrust.com-promo] Начало работы скрипта')

        // Wait for page to fully load
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Step 1: Check wipe calendar
        console.log('[bloodrust.com-promo] Шаг 1: Проверка календаря вайпов')
        const wipeResponse = await fetch('https://core.bloodrust.com/public/wipe-calendar', {
            'headers': {
                'accept': 'application/json, text/plain, */*'
            },
            'method': 'GET'
        })

        if (!wipeResponse.ok) {
            console.error('[bloodrust.com-promo] Ошибка загрузки календаря:', wipeResponse.status)
            chrome.runtime.sendMessage({message: 'Ошибка загрузки календаря вайпов'})
            return
        }

        const wipeData = await wipeResponse.json()
        console.log('[bloodrust.com-promo] Получено дней в календаре:', Array.isArray(wipeData) ? wipeData.length : 'не массив')

        // Find wipe in next 24 hours from now
        const now = new Date()
        console.log('[bloodrust.com-promo] Текущее время:', now.toLocaleString('ru-RU'), '(timestamp:', now.getTime() + ')')

        let recentWipe = null
        let allWipes = []

        if (Array.isArray(wipeData)) {
            // Collect all wipes with their dates
            for (const dayData of wipeData) {
                if (!dayData.wipes || !Array.isArray(dayData.wipes) || dayData.wipes.length === 0) {
                    continue
                }

                for (const wipe of dayData.wipes) {
                    if (wipe.date) {
                        // Add 30 seconds to wipe time to ensure promo code is posted
                        const wipeDate = new Date(wipe.date + 30000)
                        if (!isNaN(wipeDate.getTime())) {
                            const hoursDiff = (now - wipeDate) / (1000 * 60 * 60)
                            allWipes.push({
                                wipe,
                                date: wipeDate,
                                hoursDiff,
                                timestamp: wipe.date,
                                adjustedTimestamp: wipe.date + 30000
                            })
                        }
                    }
                }
            }

            // Sort by date (closest first, whether past or future)
            allWipes.sort((a, b) => Math.abs(a.hoursDiff) - Math.abs(b.hoursDiff))

            console.log(`[bloodrust.com-promo] Найдено вайпов: ${allWipes.length}`)
            console.log('[bloodrust.com-promo] Ближайшие 5 вайпов:')
            allWipes.slice(0, 5).forEach((item, idx) => {
                const isInPast = item.hoursDiff >= 0
                const timeDescription = isInPast
                    ? `${item.hoursDiff.toFixed(2)} часов назад`
                    : `через ${Math.abs(item.hoursDiff).toFixed(2)} часов`
                console.log(`  ${idx + 1}. ${item.date.toLocaleString('ru-RU')} - ${timeDescription} (${item.wipe.type}, ${item.wipe.wipe_group}) [+30 сек]`)
            })

            // Find wipe within 24 hours (past or future)
            for (const item of allWipes) {
                // Accept wipe if it happened in past 24 hours OR will happen in next 24 hours
                if (Math.abs(item.hoursDiff) <= 24) {
                    recentWipe = item.wipe
                    const isInPast = item.hoursDiff >= 0
                    const timeDescription = isInPast
                        ? `${item.hoursDiff.toFixed(2)} часов назад`
                        : `через ${Math.abs(item.hoursDiff).toFixed(2)} часов`
                    const statusEmoji = isInPast ? '✓' : '⏳'
                    console.log(`[bloodrust.com-promo] ${statusEmoji} Найден ${isInPast ? 'прошедший' : 'предстоящий'} вайп: ${item.date.toLocaleString('ru-RU')} (${timeDescription})`)
                    console.log('[bloodrust.com-promo] Данные вайпа:', item.wipe)
                    break
                }
            }
        } else {
            console.error('[bloodrust.com-promo] wipeData не является массивом, тип:', typeof wipeData)
        }

        if (!recentWipe) {
            console.log('[bloodrust.com-promo] Вайпов в ближайшие 24 часа не найдено')

            // Calculate next check time: tomorrow at 00:00
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            const msUntilMidnight = tomorrow.getTime() - now.getTime()
            const hoursUntilMidnight = (msUntilMidnight / (1000 * 60 * 60)).toFixed(2)

            console.log(`[bloodrust.com-promo] Следующая проверка в 00:00 (через ${hoursUntilMidnight} часов)`)

            // Wait a bit so logs can be seen
            await new Promise(resolve => setTimeout(resolve, 5000))

            // Check again at midnight
            chrome.runtime.sendMessage({later: tomorrow.getTime()})
            return
        }

        // Step 2: Get promo code from silent vote
        console.log('[bloodrust.com-promo] Шаг 2: Получение промокода из background script')

        // Wait for silent vote result
        await new Promise(resolve => setTimeout(resolve, 1000))

        let promoCode = null

        // Get promo code from silentResponseBody (set by background script)
        // Check both 'bloodrust.com' and 'bloodrust.com-promo' keys for compatibility
        if (window.silentResponseBody && (window.silentResponseBody['bloodrust.com'] || window.silentResponseBody['bloodrust.com-promo'])) {
            const responseData = window.silentResponseBody['bloodrust.com'] || window.silentResponseBody['bloodrust.com-promo']
            promoCode = responseData.promoCode
            console.log('[bloodrust.com-promo] ✓ Промокод получен от background script:', promoCode)
        }

        // Fallback: search on current page
        if (!promoCode) {
            console.log('[bloodrust.com-promo] Промокод не получен от background script, ищем на странице')
            const allText = document.body.innerText
            const match = allText.match(PROMO_REGEX)

            if (match && match[1]) {
                promoCode = match[1]
                console.log('[bloodrust.com-promo] ✓ Промокод найден на странице:', promoCode)
            }
        }

        if (!promoCode) {
            console.log('[bloodrust.com-promo] Промокод не найден')
            console.log('[bloodrust.com-promo] Подсказка: откройте Telegram канал @bloodrust вручную')
            chrome.runtime.sendMessage({message: 'Промокод не найден. Проверьте @bloodrust'})
            return
        }

        // Step 3: Click the BC button to open modal
        console.log('[bloodrust.com-promo] Шаг 3: Поиск кнопки BC')
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Find button with "90" and BC image
        const bcButton = Array.from(document.querySelectorAll('button')).find(btn => {
            const text = btn.textContent.trim()
            const hasBC = btn.querySelector('img[alt="BC"]')
            return text.includes('90') && hasBC
        })

        if (!bcButton) {
            console.error('[bloodrust.com-promo] BC кнопка не найдена')
            chrome.runtime.sendMessage({errorVoteNoElement: 'BC button not found'})
            return
        }

        console.log('[bloodrust.com-promo] Кликаем по BC кнопке')
        bcButton.click()

        // Wait for modal to open
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Step 4: Find and click "Промокод" tab
        console.log('[bloodrust.com-promo] Шаг 4: Поиск таба "Промокод"')
        const promoTab = Array.from(document.querySelectorAll('button[role="tab"]')).find(btn =>
            btn.textContent.includes('Промокод')
        )

        if (!promoTab) {
            console.error('[bloodrust.com-promo] Таб "Промокод" не найден')
            chrome.runtime.sendMessage({errorVoteNoElement: 'Promo tab not found'})
            return
        }

        console.log('[bloodrust.com-promo] Кликаем по табу "Промокод"')
        promoTab.click()

        // Wait for tab to switch
        await new Promise(resolve => setTimeout(resolve, 500))

        // Step 5: Find input field and enter promo code
        console.log('[bloodrust.com-promo] Шаг 5: Поиск поля ввода промокода')
        const promoInput = document.querySelector('input[placeholder*="AAA"]') ||
                          document.querySelector('input[type="text"][aria-label*="Value"]')

        if (!promoInput) {
            console.error('[bloodrust.com-promo] Поле ввода промокода не найдено')
            chrome.runtime.sendMessage({errorVoteNoElement: 'Promo input not found'})
            return
        }

        // Set input value
        console.log('[bloodrust.com-promo] Вводим промокод:', promoCode)
        promoInput.value = promoCode
        promoInput.dispatchEvent(new Event('input', { bubbles: true }))
        promoInput.dispatchEvent(new Event('change', { bubbles: true }))

        await new Promise(resolve => setTimeout(resolve, 500))

        // Step 6: Click "Применить" button
        console.log('[bloodrust.com-promo] Шаг 6: Поиск кнопки "Применить"')
        const applyButton = Array.from(document.querySelectorAll('button')).find(btn =>
            btn.textContent.includes('Применить')
        )

        if (!applyButton) {
            console.error('[bloodrust.com-promo] Кнопка "Применить" не найдена')
            chrome.runtime.sendMessage({errorVoteNoElement: 'Apply button not found'})
            return
        }

        console.log('[bloodrust.com-promo] Кликаем "Применить"')
        applyButton.click()

        // Wait for result and check for success/error messages
        await new Promise(resolve => setTimeout(resolve, 3000))

        // Check for error messages (look in the entire page and in modals)
        const errorSelectors = [
            '[role="alert"]',
            '.error',
            '.alert-error',
            '.alert-danger',
            '.notification-error',
            '[class*="error"]',
            '[class*="Error"]'
        ]

        for (const selector of errorSelectors) {
            const errorElements = document.querySelectorAll(selector)
            for (const errorEl of errorElements) {
                const text = errorEl.textContent?.trim()
                // Skip if empty or if element is hidden
                if (!text || errorEl.offsetParent === null) continue

                // Check if this looks like an error message
                if (text.length > 0 && text.length < 500) {
                    console.error('[bloodrust.com-promo] Ошибка при применении промокода:', text)
                    chrome.runtime.sendMessage({
                        message: `Ошибка активации промокода: ${text}`
                    })
                    return
                }
            }
        }

        // Check for success messages
        const successSelectors = [
            '.success',
            '.alert-success',
            '[role="status"]',
            '.notification-success',
            '[class*="success"]',
            '[class*="Success"]'
        ]

        let successText = null
        for (const selector of successSelectors) {
            const successElements = document.querySelectorAll(selector)
            for (const successEl of successElements) {
                const text = successEl.textContent?.trim()
                // Skip if empty or if element is hidden
                if (!text || successEl.offsetParent === null) continue

                if (text.length > 0 && text.length < 500) {
                    successText = text
                    break
                }
            }
            if (successText) break
        }

        // Log the result
        console.log('[bloodrust.com-promo] ✓ Промокод применён:', promoCode)
        if (successText) {
            console.log('[bloodrust.com-promo] Сообщение об успехе:', successText)
        } else {
            console.log('[bloodrust.com-promo] Сообщение об успехе не найдено, но ошибок тоже нет')
        }

        chrome.runtime.sendMessage({
            successfully: true,
            message: successText || `Промокод ${promoCode} применён (проверьте результат в профиле)`
        })

    } catch (error) {
        console.error('[bloodrust.com-promo] ✗ Критическая ошибка:', error)
        chrome.runtime.sendMessage({message: 'Ошибка: ' + error.message})
    }
}

console.log('[bloodrust.com-promo] Скрипт загружен')
