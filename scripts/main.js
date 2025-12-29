import { getStroke } from '../node_modules/perfect-freehand/dist/esm/index.mjs'
import { getSvgPathFromStroke } from './helpers/freehand-helper.js';

const InkCanvas = document.getElementById("inkCanvas");
const ButtonDrag = document.getElementById("buttonDrag");
const ButtonDraw = document.getElementById("buttonDraw");
const ButtonErase = document.getElementById("buttonErase");
const ButtonClear = document.getElementById("buttonClear");
const ButtonClose = document.getElementById("buttonClose");

// region Window
function closeWithConfirm() {
    if (confirm("真的要关闭画板吗")) {
        window.close();
    }
}
// endregion

// region Toolbar
ButtonDrag.addEventListener('click', () => switchMode(EditingModes.Drag));
ButtonDraw.addEventListener('click', () => switchMode(EditingModes.Draw));
ButtonErase.addEventListener('click', () => switchMode(EditingModes.Erase));
ButtonClear.addEventListener('click', () => clearCanvasWithConfirm());
ButtonClose.addEventListener('click', () => closeWithConfirm());
// endregion

// region Editing Mode
const EditingModes = {
    Drag: 'drag',
    Draw: 'draw',
    Erase: 'erase'
}

let currentMode;
let lastMode;
let isPenAss = false;

function switchMode(mode) {
    lastMode = currentMode;
    currentMode = mode;

    ButtonDrag.appearance = 'neutral';
    ButtonDraw.appearance = 'neutral';
    ButtonErase.appearance = 'neutral';

    switch (mode) {
        case EditingModes.Drag:
            ButtonDrag.appearance = 'accent';
            break;
        case EditingModes.Draw:
            ButtonDraw.appearance = 'accent';
            break;
        case EditingModes.Erase:
            ButtonErase.appearance = 'accent';
            break;
    }
}

switchMode(EditingModes.Draw);
// endregion

// region Ink Canvas
let isEditing = false;
let currentPath = null;
let currentPoints = [];

InkCanvas.addEventListener('pointerdown', (e) => {
    // Handle Surface Pen ass
    if (e.pointerType === 'pen') {
        if (e.buttons === 32) {
            isPenAss = true;
            switchMode(EditingModes.Erase);
        }
    }

    const point = getMousePosition(e);

    isEditing = true;
    switch (currentMode) {
        case EditingModes.Draw:
            startNewPath(point);
            addPointToPath(point);
            break;
        case EditingModes.Erase:
            startNewErasePath(point);
            addPointToErasePath(point);
            break;
    }
});

InkCanvas.addEventListener('pointermove', (e) => {
    if (!isEditing) return;

    const point = getMousePosition(e);

    switch (currentMode) {
        case EditingModes.Draw:
            addPointToPath(point);
            break;
        case EditingModes.Erase:
            addPointToErasePath(point);
            break;
    }
});

InkCanvas.addEventListener('pointerup', () => {
    isEditing = false;
    switch (currentMode) {
        case EditingModes.Draw:
            currentPath = null;
            break;
        case EditingModes.Erase:
            finalizeErase();
            break;
    }
});

InkCanvas.addEventListener('pointerleave', () => {
    if (isEditing) {
        isEditing = false;
        switch (currentMode) {
            case EditingModes.Draw:
                currentPath = null;
                break;
            case EditingModes.Erase:
                finalizeErase();
                break;
        }
    }
});

InkCanvas.addEventListener('pointerenter', (e) => {
    if (currentMode == EditingModes.Draw) {
        if (e.buttons === 1) {
            isEditing = true;
            const point = getMousePosition(e);
            startNewPath(point);
        }
    }
});

function getMousePosition(e) {
    const rect = InkCanvas.getBoundingClientRect();

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;

    return {
        x: clientX - rect.left,
        y: clientY - rect.top,
    };
}

function startNewPath(startPoint) {
    currentPoints = [[startPoint.x, startPoint.y]];
}

function addPointToPath(point) {
    currentPoints.push([point.x, point.y]);

    const strokePoints = getStroke(currentPoints, {
        size: 4,
        thinning: 0.6,
        smoothing: 0.5,
        streamline: 0.5,
    });

    const pathData = getSvgPathFromStroke(strokePoints);

    if (!currentPath) {
        currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        currentPath.setAttribute("fill", "black");
        InkCanvas.appendChild(currentPath);
    }

    currentPath.setAttribute("d", pathData)
}

// region eraser
let erasePoints = [];
let lastErasePoint = null;
let eraseCtx = null;

function getEraseContext() {
    if (!eraseCtx) {
        eraseCtx = document.createElement('canvas').getContext('2d');
    }
    return eraseCtx;
}

function startNewErasePath(point) {
    erasePoints = [point];
    lastErasePoint = point;
    eraseAtPoint(point);
}

function addPointToErasePath(point) {
    if (!lastErasePoint) {
        lastErasePoint = point;
        eraseAtPoint(point);
        return;
    }

    const dx = point.x - lastErasePoint.x;
    const dy = point.y - lastErasePoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 插点
    if (distance > 20) {
        const steps = Math.ceil(distance / 10); // 每5像素插一个点
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const interpPoint = {
                x: lastErasePoint.x + dx * t,
                y: lastErasePoint.y + dy * t
            };
            eraseAtPoint(interpPoint);
            erasePoints.push(interpPoint);
        }
    }

    eraseAtPoint(point);
    erasePoints.push(point);
    lastErasePoint = point;
}

function eraseAtPoint(point) {
    const allPaths = InkCanvas.querySelectorAll('path');
    const eraseRadius = 5;
    const ctx = getEraseContext();

    allPaths.forEach(path => {
        const pathData = path.getAttribute('d');
        if (!pathData) return;

        const tempPath = new Path2D(pathData);

        for (let r = 0; r < eraseRadius; r += 2) {
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
                const testX = point.x + Math.cos(angle) * r;
                const testY = point.y + Math.sin(angle) * r;

                if (ctx.isPointInStroke(tempPath, testX, testY)) {
                    path.remove();
                    return;
                }
            }
        }
    });
}

function finalizeErase() {
    erasePoints = [];
    lastErasePoint = null;

    if (isPenAss) {
        isPenAss = false;
        switchMode(lastMode);
    }
}
// endregion
// region Clear
function clearCanvas() {
    const allPaths = InkCanvas.querySelectorAll('path');
    allPaths.forEach(path => path.remove());
}

function clearCanvasWithConfirm() {
    if (confirm("真的要清除画板吗")) {
        clearCanvas();
    }
}
// endregion
// endregion
