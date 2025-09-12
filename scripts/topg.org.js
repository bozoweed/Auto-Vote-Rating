// --- THIS IS THE FINAL, ROBUST VOTE FUNCTION ---
async function vote(first) {
    // All of the initial checks at the top remain the same.
    if (document.querySelector('.alert.alert-danger') != null) {
        const message = document.querySelector('.alert.alert-danger').textContent.trim()
        if (message.includes('verification required') || message.includes('not double click or refresh page')) return
        chrome.runtime.sendMessage({message})
        return
    } else if (document.querySelector('.alert.alert-warning') != null) {
        // ... (this section is fine, leave it as is)
        const message = document.querySelector('.alert.alert-warning').textContent
        if (message.includes('already voted')) {
            let hour = 0, min = 0, sec = 0
            if (message.match(/\d+ hour/g)) hour = Number(message.match(/\d+ hour/g)[0].match(/\d+/g)[0])
            if (message.match(/\d+ min/g)) min = Number(message.match(/\d+ min/g)[0].match(/\d+/g)[0])
            if (message.match(/\d+ sec/g)) sec = Number(message.match(/\d+ sec/g)[0].match(/\d+/g)[0])
            const milliseconds = (hour * 3600000) + (min * 60000) + (sec * 1000)
            chrome.runtime.sendMessage({later: Date.now() + milliseconds})
        } else if (message.includes('verification required')) {
            return
        } else {
            chrome.runtime.sendMessage({message: message.trim()})
        }
        return
    } else if (document.querySelector('.alert.alert-success')?.textContent.includes('voted successfully')) {
        chrome.runtime.sendMessage({successfully: true})
        return
    }
    // ... (all other initial checks are fine)
    
    const project = await getProject();

    // Check for login button
    if (document.querySelector("#openModal")?.innerText.toLowerCase().includes('login to vote')) {
        chrome.runtime.sendMessage({auth: true});
        return;
    }

    // 1. Find and click the button to open the voting modal
    console.log("Looking for #openModal button...");
    const openModalButton = document.querySelector('#openModal');
    if (openModalButton) {
        console.log("Found #openModal, clicking it.");
        openModalButton.click();
        await wait(2000); // Wait for modal to open
    } else {
        console.log("Button #openModal not found. Assuming modal is already open.");
    }

    // 2. Find the drag and drop elements
    console.log("Looking for drag and drop elements...");
    const dragable = document.querySelector('#draggable-item');
    const droparea = document.querySelector('#drop-area');

    if (!dragable || !droparea) {
        console.error("CRITICAL: Could not find #draggable-item or #drop-area. Cannot continue.");
        chrome.runtime.sendMessage({ message: "Could not find drag/drop elements." });
        return;
    }
    console.log("Found D&D elements. Starting simulation.");

    // 3. Perform the drag and drop
    await humanDragAndDrop(dragable, droparea);
    console.log("Drag and drop simulation complete.");
    await wait(1000); // Wait for the website to process the result.

    // 4. Fill the username
    console.log("Looking for username input #game_user...");
    const usernameInput = document.getElementById('game_user');
    if (usernameInput) {
        console.log("Found username input, filling it.");
        usernameInput.value = project.nick;
        
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
        usernameInput.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        console.error("Could not find username input #game_user.");
        // We might not stop here, maybe the username is pre-filled.
    }
    await wait(500);

    // 5. Find and click the FINAL submit button
    console.log("Looking for submit button (#submitVote or #submit)...");
    let submitButton = document.querySelector('#submitVote') || document.querySelector('#submit');
    
    if (submitButton) {
        console.log("Found submit button! Clicking it.");
        submitButton.click();
    } else {
        console.error("CRITICAL: Could not find the final submit button (#submitVote or #submit).");
        chrome.runtime.sendMessage({ message: "Vote captcha passed, but couldn't find submit button." });
    }
    await wait(300000)
}
// --- Replace your D&D code with this "Ultimate Test" version ---

async function humanDragAndDrop(dragElement, dropZone) {
    if (!dragElement || !dropZone) {
        console.error("Draggable element or drop zone not found.");
        return;
    }

    const dragRect = dragElement.getBoundingClientRect();
    const dropRect = dropZone.getBoundingClientRect();

    // Start in the middle of the drag element
    const startX = dragRect.left + dragRect.width / 2 + window.scrollX;
    const startY = dragRect.top + dragRect.height / 2 + window.scrollY;

    // End in the middle of the drop zone
    const endX = dropRect.left + dropRect.width / 2 + window.scrollX;
    const endY = dropRect.top + dropRect.height / 2 + window.scrollY;

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', dragElement.id || '');
    dataTransfer.effectAllowed = 'move';

    // --- Helper to dispatch events with coordinates ---
    const dispatch = (target, type, x, y, options = {}) => {
        const event = new DragEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            ...options
        });
        Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
        target.dispatchEvent(event);
    };

    const dispatchMouse = (type, x, y) => {
        const event = new MouseEvent(type, {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            buttons: 1, // left mouse button pressed during drag
        });
        document.dispatchEvent(event);
    };

    // --- 1. Move mouse to start & press down ---
    console.log("🖱️ Moving mouse to start position...");
    await smoothMouseMovement(startX, startY, 500); // Takes ~0.5s to reach start
    await wait(100 + Math.random() * 200);

    // --- 2. Mousedown on draggable ---
    dispatchMouse('mousedown', startX, startY);
    dispatch(dragElement, 'mousedown', startX, startY);
    await wait(100);

    // --- 3. Start dragging ---
    dispatch(dragElement, 'dragstart', startX, startY, { dataTransfer });
    await wait(100);

    // --- 4. Begin moving toward drop zone with realistic path ---
    console.log("✋ Dragging element visually...");

    // Generate a smooth, slightly curved path with noise
    const steps = 15 + Math.floor(Math.random() * 10); // 15-25 steps
    const points = generateBezierPath(
        { x: startX, y: startY },
        { x: endX, y: endY },
        0.3 + Math.random() * 0.4, // curvature
        steps
    );

    // Add micro-pauses and variance
    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const x = point.x + (Math.random() * 6 - 3); // ±3px jitter
        const y = point.y + (Math.random() * 6 - 3);

        // Move mouse cursor visually
        dispatchMouse('mousemove', x, y);

        // Fire drag events
        dispatch(dragElement, 'drag', x, y, { dataTransfer });
        dispatch(dropZone, 'dragover', x, y, { dataTransfer });

        // Vary delay between steps (20ms - 80ms)
        const delay = 20 + Math.random() * 60;
        await wait(delay);

        // Occasionally pause slightly longer (simulate human hesitation)
        if (i === Math.floor(steps / 2) || i === Math.floor(steps * 0.75)) {
            await wait(100 + Math.random() * 150);
        }
    }

    // --- 5. Final precise move to center of drop zone ---
    dispatchMouse('mousemove', endX, endY);
    dispatch(dropZone, 'dragover', endX, endY, { dataTransfer });
    await wait(50);

    // --- 6. Allow drop effect ---
    const dragOverListener = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };
    dropZone.addEventListener('dragover', dragOverListener, { once: true });
    dispatch(dropZone, 'dragover', endX, endY, { dataTransfer });
    await wait(50);

    // --- 7. Release! ---
    dispatch(dropZone, 'drop', endX, endY, { dataTransfer });
    dispatchMouse('mouseup', endX, endY);
    dispatch(dragElement, 'dragend', endX, endY, { dataTransfer });

    console.log("✅ Drop completed successfully.");
}

// --- Smoothly moves mouse cursor visually from current pos to (x,y) ---
async function smoothMouseMovement(x, y, duration = 500) {
    const currentX = x; // In real use, you'd track last mouse pos — here we assume starting at target
    const currentY = y; // For simplicity, we skip interpolation since we’re going to drag immediately after

    // If you want REAL cursor movement simulation (optional):
    // You can't move the real cursor via JS — but visual hover effects often rely on mousemove events.
    // So we dispatch mousemove from an arbitrary start point → target.
    // Let’s simulate coming from 100px above-left for realism.
    const startX = x - 100 - Math.random() * 50;
    const startY = y - 100 - Math.random() * 50;

    const steps = 10;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const curX = startX + (x - startX) * t;
        const curY = startY + (y - startY) * t;
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: curX, clientY: curY }));
        await wait(duration / steps);
    }
}

// --- Generate human-like Bezier curve path ---
function generateBezierPath(start, end, curvature, steps) {
    const cx = (start.x + end.x) / 2 + (Math.random() > 0.5 ? 1 : -1) * curvature * (end.x - start.x);
    const cy = (start.y + end.y) / 2 + (Math.random() > 0.5 ? 1 : -1) * curvature * (end.y - start.y);

    const points = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cx + t * t * end.x;
        const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cy + t * t * end.y;
        points.push({ x, y });
    }
    return points;
}
