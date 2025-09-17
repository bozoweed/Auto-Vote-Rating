from pathlib import Path
path = Path('views/projects/main.js')
text = path.read_text(encoding='utf-8').replace('\r\n','\n')
old = "        var buttonBlock = ctx.root.querySelector('.projectsBlock .buttonBlock');\n        var contentBlock = ctx.root.querySelector('.projectsBlock .contentBlock');\n        if (buttonBlock && typeof buttonBlock.replaceChildren === 'function') buttonBlock.replaceChildren();\n        else if (buttonBlock) buttonBlock.innerHTML = '';\n        if (contentBlock && typeof contentBlock.replaceChildren === 'function') contentBlock.replaceChildren();\n        else if (contentBlock) contentBlock.innerHTML = '';\n\n        var notAdded = $('#notAddedAll');\n        var loading = $('#addedLoading');\n\n        try {\n"
new = "        var buttonBlock = ctx.root.querySelector('.projectsBlock .buttonBlock');\n        var contentBlock = ctx.root.querySelector('.projectsBlock .contentBlock');\n        if (buttonBlock && typeof buttonBlock.replaceChildren === 'function') buttonBlock.replaceChildren();\n        else if (buttonBlock) buttonBlock.innerHTML = '';\n        if (contentBlock && typeof contentBlock.replaceChildren === 'function') contentBlock.replaceChildren();\n        else if (contentBlock) contentBlock.innerHTML = '';\n\n        var notAdded = $('#notAddedAll');\n        var loading = $('#addedLoading');\n\n        console.log('[projects] reloadProjectList:start', { hasDB: !!db, lock: generateLock });\n        try {\n"
if old not in text:
    raise SystemExit('pattern1')
text = text.replace(old, new, 1)

old2 = "          if (!db && be && typeof be.initializeConfig === 'function') {\n            try { await be.initializeConfig({ background: false }); } catch (_) {}\n            db = be.DB;\n          }\n          if (!db) {\n            if (notAdded) notAdded.style.display = 'block';\n            return;\n          }\n\n          var projects = await db.getAll('projects');\n          var byRating = new Map();\n          var customFound = false;\n\n          projects.forEach(function (project) {\n            if (!project || typeof project !== 'object') return;\n            var rating = project.rating || 'unknown';\n            if (!byRating.has(rating)) byRating.set(rating, []);\n            byRating.get(rating).push(project);\n            if (rating === 'Custom') customFound = true;\n          });\n\n          for (var list of byRating.values()) {\n            list.sort(function(a, b){ return (a && a.key || 0) - (b && b.key || 0); });\n          }\n\n          ratingCache = byRating;\n\n          if (customFound && settings && !settings.enableCustom) {\n            settings.enableCustom = true;\n            try {\n              await db.put('other', settings, 'settings');\n              chrome.runtime?.sendMessage?.('reloadSettings');\n            } catch (_) {}\n          }\n\n          var ratingOrder = Object.keys(allProjects || {});\n          var seen = new Set();\n\n          ratingOrder.forEach(function (rating, orderIndex) {\n            var list = byRating.get(rating);\n            if (list && list.length) {\n              generateBtnListRating(rating, list.length, orderIndex);\n              seen.add(rating);\n            }\n          });\n\n          var extraOrder = ratingOrder.length;\n          for (var [rating, list] of byRating.entries()) {\n            if (seen.has(rating)) continue;\n            generateBtnListRating(rating, list.length, extraOrder++);\n          }\n\n          if (buttonBlock && buttonBlock.childElementCount > 0) {\n            if (notAdded) notAdded.style.display = 'none';\n            var alreadySelected = buttonBlock.querySelector('.selectsite.activeList');\n            if (!alreadySelected) {\n              var firstBtn = buttonBlock.querySelector('.selectsite');\n              if (firstBtn) firstBtn.click();\n            }\n          } else if (notAdded) {\n            notAdded.style.display = 'block';\n          }\n        } catch (error) {\n          console.warn('[projects] reloadProjectList failed', error);\n          if (notAdded) notAdded.style.display = 'block';\n        } finally {\n          if (loading) loading.style.display = 'none';\n          generateLock = false;\n        }\n      }\n"
new2 = "          if (!db && be && typeof be.initializeConfig === 'function') {\n            try { await be.initializeConfig({ background: false }); } catch (_) {}\n            db = be.DB;\n            console.log('[projects] reloadProjectList:afterInit', { hasDB: !!db });\n          }\n          if (!db) {\n            ratingCache = new Map();\n            if (notAdded) notAdded.style.display = 'block';\n            console.log('[projects] reloadProjectList:noDB');\n            return;\n          }\n\n          var projects = await db.getAll('projects');\n          console.log('[projects] reloadProjectList:projectsLoaded', { count: projects.length });\n          var byRating = new Map();\n          var customFound = false;\n\n          projects.forEach(function (project) {\n            if (!project || typeof project !== 'object') return;\n            var rating = project.rating || 'unknown';\n            if (!byRating.has(rating)) byRating.set(rating, []);\n            byRating.get(rating).push(project);\n            if (rating === 'Custom') customFound = true;\n          });\n\n          for (var list of byRating.values()) {\n            list.sort(function(a, b){ return (a && a.key || 0) - (b && b.key || 0); });\n          }\n\n          ratingCache = byRating;\n          console.log('[projects] reloadProjectList:grouped', { ratings: Array.from(byRating.keys()) });\n\n          if (customFound && settings && !settings.enableCustom) {
            settings.enableCustom = true;
            try {
              await db.put('other', settings, 'settings');
              chrome.runtime?.sendMessage?.('reloadSettings');
            } catch (_) {}
          }

          var ratingOrder = Object.keys(allProjects || {});
          var seen = new Set();

          ratingOrder.forEach(function (rating, orderIndex) {
            var list = byRating.get(rating);
            if (list && list.length) {
              generateBtnListRating(rating, list.length, orderIndex);
              seen.add(rating);
            }
          });

          var extraOrder = ratingOrder.length;
          for (var [rating, list] of byRating.entries()) {
            if (seen.has(rating)) continue;
            generateBtnListRating(rating, list.length, extraOrder++);
          }

          console.log('[projects] reloadProjectList:buttons', { buttons: buttonBlock?.childElementCount || 0 });
          if (buttonBlock && buttonBlock.childElementCount > 0) {
            if (notAdded) notAdded.style.display = 'none';
            var alreadySelected = buttonBlock.querySelector('.selectsite.activeList');
            if (!alreadySelected) {
              var firstBtn = buttonBlock.querySelector('.selectsite');
              if (firstBtn) firstBtn.click();
            }
          } else if (notAdded) {
            notAdded.style.display = 'block';
          }
        } catch (error) {
          console.warn('[projects] reloadProjectList failed', error);
          if (notAdded) notAdded.style.display = 'block';
        } finally {
          if (loading) loading.style.display = 'none';
          generateLock = false;
          console.log('[projects] reloadProjectList:end', { cacheRatings: Array.from(ratingCache.keys()) });
        }
      }
"
if old2 not in text:
    raise SystemExit('pattern2')
text = text.replace(old2, new2, 1)

old3 = "        var list = ctx.root.querySelector(`[data-rating-list='${rating}']`);\n        if (!list) return;\n        if (list.childElementCount === 0) {\n          var placeholder = document.createElement('div');\n          placeholder.setAttribute('data-resource','load');\n          placeholder.textContent = t('load') || 'Loading...';\n          list.append(placeholder);\n\n          var ratingProjects = ratingCache.get(rating) || [];\n          if (ratingProjects.length === 0) {\n            placeholder.remove();\n            return;\n          }\n\n          for (var i = 0; i < ratingProjects.length; i++) {\n            if (placeholder.isConnected) placeholder.remove();\n            await addProjectList(ratingProjects[i]);\n          }\n          if (placeholder.isConnected) placeholder.remove();\n        }\n      }\n"
new3 = "        var list = ctx.root.querySelector(`[data-rating-list='${rating}']`);\n        if (!list) return;\n        if (list.childElementCount === 0) {\n          var placeholder = document.createElement('div');\n          placeholder.setAttribute('data-resource','load');\n          placeholder.textContent = t('load') || 'Loading...';\n          list.append(placeholder);\n\n          var ratingProjects = ratingCache.get(rating) || [];\n          console.log('[projects] listSelect', { rating, cached: ratingProjects.length });\n          if (ratingProjects.length === 0) {\n            placeholder.remove();\n            return;\n          }\n\n          for (var i = 0; i < ratingProjects.length; i++) {\n            if (placeholder.isConnected) placeholder.remove();\n            await addProjectList(ratingProjects[i]);\n          }\n          if (placeholder.isConnected) placeholder.remove();\n        }\n      }\n"
if old3 not in text:
    raise SystemExit('pattern3')
text = text.replace(old3, new3, 1)

old4 = "        if (existing) {\n          if (existing.parentElement !== listProject) listProject.appendChild(existing);\n          await updateProjectText(project);\n          if (preBend) listProject.prepend(existing);\n          return;\n        }\n\n        var li = document.createElement('li'); li.id='projects'+project.key;\n\n        var msg = document.createElement('div'); msg.className='message';\n"
new4 = "        if (existing) {\n          if (existing.parentElement !== listProject) listProject.appendChild(existing);\n          await updateProjectText(project);\n          if (preBend) listProject.prepend(existing);\n          console.log('[projects] addProjectList:updateExisting', { rating, key: project.key });\n          return;\n        }\n\n        console.log('[projects] addProjectList:create', { rating, key: project.key });\n        var li = document.createElement('li'); li.id='projects'+project.key;\n\n        var msg = document.createElement('div'); msg.className='message';\n"
if old4 not in text:
    raise SystemExit('pattern4')
text = text.replace(old4, new4, 1)

path.write_text(text, encoding='utf-8')
