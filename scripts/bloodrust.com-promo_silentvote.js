// noinspection ES6MissingAwait

self['silentVote_bloodrust.com-promo'] = async function (project) {
    console.log('[bloodrust.com-promo-silent] Начало silent vote')

    const PROMO_REGEX = /(?:Промокод|Промик|Промо).*?(?::|—)\s*([A-Za-z0-9]{5,10})/i

    try {
        // Step 1: Check wipe calendar
        console.log('[bloodrust.com-promo-silent] Шаг 1: Проверка календаря вайпов')
        const wipeResponse = await fetch('https://core.bloodrust.com/public/wipe-calendar', {
            headers: {
                'accept': 'application/json, text/plain, */*'
            },
            method: 'GET'
        })

        if (!wipeResponse.ok) {
            endVote({message: `Ошибка загрузки календаря вайпов: ${wipeResponse.status}`}, null, project)
            return
        }

        const wipeData = await wipeResponse.json()
        console.log('[bloodrust.com-promo-silent] Получено дней в календаре:', Array.isArray(wipeData) ? wipeData.length : 'не массив')

        // Find wipe in next 24 hours from now
        const now = new Date()
        console.log('[bloodrust.com-promo-silent] Текущее время:', now.toLocaleString('ru-RU'))

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
                                hoursDiff
                            })
                        }
                    }
                }
            }

            // Sort by date (closest first, whether past or future)
            allWipes.sort((a, b) => Math.abs(a.hoursDiff) - Math.abs(b.hoursDiff))

            console.log(`[bloodrust.com-promo-silent] Найдено вайпов: ${allWipes.length}`)

            // Find wipe within 24 hours (past or future)
            for (const item of allWipes) {
                // Accept wipe if it happened in past 24 hours OR will happen in next 24 hours
                if (Math.abs(item.hoursDiff) <= 24) {
                    recentWipe = item.wipe
                    const isInPast = item.hoursDiff >= 0
                    const status = isInPast ? 'прошедший' : 'предстоящий'
                    console.log(`[bloodrust.com-promo-silent] ✓ Найден ${status} вайп: ${item.date.toLocaleString('ru-RU')}`)
                    break
                }
            }
        }

        if (!recentWipe) {
            console.log('[bloodrust.com-promo-silent] Вайпов в ближайшие 24 часа не найдено')

            // Calculate next check time: tomorrow at 00:00
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(0, 0, 0, 0)

            endVote({later: tomorrow.getTime()}, null, project)
            return
        }

        // Step 2: Parse Telegram channel for promo code
        console.log('[bloodrust.com-promo-silent] Шаг 2: Парсинг Telegram канала')

        const telegramResponse = await fetch('https://t.me/s/bloodrust', {
            method: 'GET'
        })

        if (!telegramResponse.ok) {
            endVote({message: `Ошибка загрузки Telegram: ${telegramResponse.status}`}, null, project)
            return
        }

        const html = await telegramResponse.text()
        console.log('[bloodrust.com-promo-silent] Получен HTML, длина:', html.length)

        let promoCode = null
        let highestMessageId = 0

        console.log('[bloodrust.com-promo-silent] Поиск промокодов по ID сообщений...')

        // First, let's find all message blocks with simpler regex
        const simpleMessageRegex = /<div[^>]*class="[^"]*tgme_widget_message[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi
        const messageBlocks = html.matchAll(simpleMessageRegex)

        let messageCount = 0
        const foundPromoCodes = []

        for (const messageBlock of messageBlocks) {
            messageCount++
            const messageHtml = messageBlock[1]

            // Extract message ID from any link in the message pointing to t.me/bloodrust/ID
            const linkMatch = messageHtml.match(/https:\/\/t\.me\/bloodrust\/(\d+)/)
            const messageId = linkMatch ? parseInt(linkMatch[1], 10) : 0

            // Extract message text
            const textMatch = messageHtml.match(/<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)
            if (!textMatch) continue

            const messageText = textMatch[1]
            const cleanText = messageText.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').trim()

            // Try to find promo code
            const promoMatch = cleanText.match(PROMO_REGEX)

            if (promoMatch && promoMatch[1]) {
                const foundCode = promoMatch[1]
                foundPromoCodes.push({
                    code: foundCode,
                    messageId: messageId,
                    text: cleanText.substring(0, 100)
                })

                console.log('[bloodrust.com-promo-silent] Найден промокод:', foundCode, 'ID сообщения:', messageId || 'не найден')

                // Keep track of the promo code with highest message ID (newest)
                if (messageId > 0 && messageId > highestMessageId) {
                    highestMessageId = messageId
                    promoCode = foundCode
                }
            }
        }

        console.log('[bloodrust.com-promo-silent] Проверено сообщений:', messageCount)
        console.log('[bloodrust.com-promo-silent] Найдено промокодов:', foundPromoCodes.length)

        if (promoCode) {
            console.log('[bloodrust.com-promo-silent] ✓ Выбран самый свежий промокод:', promoCode, 'ID сообщения:', highestMessageId)
        } else if (foundPromoCodes.length > 0) {
            // Fallback: if no message IDs found, take the last promo code in the HTML (likely newest)
            promoCode = foundPromoCodes[foundPromoCodes.length - 1].code
            console.log('[bloodrust.com-promo-silent] ⚠ ID сообщений не найдены, выбран последний промокод:', promoCode)
        }

        if (!promoCode) {
            console.log('[bloodrust.com-promo-silent] Промокод не найден в HTML')
            endVote({message: 'Промокод не найден в Telegram канале @bloodrust'}, null, project)
            return
        }

        // Check if this promo code was already used
        const usedPromoCodesKey = 'bloodrust_used_promo_codes'
        let usedPromoCodes = []

        try {
            const stored = await db.get('other', usedPromoCodesKey)
            if (stored && Array.isArray(stored)) {
                usedPromoCodes = stored
            }
        } catch (e) {
            console.log('[bloodrust.com-promo-silent] Не удалось загрузить историю промокодов')
        }

        if (usedPromoCodes.includes(promoCode)) {
            console.log('[bloodrust.com-promo-silent] Промокод', promoCode, 'уже был использован')

            // Find next wipe date and set cooldown
            const now = new Date()
            let nextWipeTime = null

            // Look for next wipe after current time
            for (const item of allWipes) {
                // Find wipe in the future (negative hoursDiff means future)
                if (item.hoursDiff < 0) {
                    nextWipeTime = item.date.getTime()
                    console.log('[bloodrust.com-promo-silent] Найден следующий вайп:', item.date.toLocaleString('ru-RU'))
                    break
                }
            }

            if (nextWipeTime) {
                endVote({later: nextWipeTime}, null, project)
            } else {
                // No future wipe found, check tomorrow at midnight
                const tomorrow = new Date(now)
                tomorrow.setDate(tomorrow.getDate() + 1)
                tomorrow.setHours(0, 0, 0, 0)
                console.log('[bloodrust.com-promo-silent] Следующий вайп не найден, проверка в 00:00')
                endVote({later: tomorrow.getTime()}, null, project)
            }
            return
        }

        // Step 3: Send promo code to content script
        console.log('[bloodrust.com-promo-silent] Промокод найден, отправка в content script:', promoCode)

        // Store promo code in silentResponseBody so content script can use it
        silentResponseBody['bloodrust.com-promo'] = {
            promoCode: promoCode
        }

        // Save used promo code
        usedPromoCodes.push(promoCode)
        // Keep only last 50 promo codes
        if (usedPromoCodes.length > 50) {
            usedPromoCodes = usedPromoCodes.slice(-50)
        }
        try {
            await db.put('other', usedPromoCodes, usedPromoCodesKey)
        } catch (e) {
            console.log('[bloodrust.com-promo-silent] Не удалось сохранить промокод в историю')
        }

        endVote({silentVote: true}, null, project)

    } catch (error) {
        console.error('[bloodrust.com-promo-silent] Критическая ошибка:', error)
        endVote({message: 'Ошибка: ' + error.message}, null, project)
    }
}
