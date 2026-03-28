// Matrix Screensaver — Standalone renderers
// Extracted from tools-all.js screensaver tool

let raf = null;
let config = {};
let initialMousePos = null;
let cleanupFn = null;
const MOUSE_THRESHOLD = 5; // px — ignore tiny phantom mouse moves

// ── Init ────────────────────────────────────────────────────────────────────

window.screensaverAPI.onConfig((cfg) => {
    config = cfg;
    start();
});

function start() {
    const canvas = document.getElementById('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Setup input listeners — ANY input triggers lock
    setupInputListeners();

    // Launch the selected mode
    const type = config.type || 'matrix';
    if (type === 'matrix') {
        matrixRain(canvas);
    } else {
        const ctx = canvas.getContext('2d');
        if (type === 'starfield') starfield(ctx, canvas);
        else clockMode(ctx, canvas);
    }
}

// ── Input Detection ─────────────────────────────────────────────────────────

function triggerLock() {
    cancelAnimationFrame(raf);
    if (cleanupFn) { cleanupFn(); cleanupFn = null; }
    window.screensaverAPI.lock();
}

function setupInputListeners() {
    // Any keydown — including lone modifiers (Shift, Alt, Ctrl, Meta/Win)
    document.addEventListener('keydown', (e) => {
        e.preventDefault();
        triggerLock();
    }, true);

    // Mouse move — with threshold to ignore phantom sub-pixel jitter
    document.addEventListener('mousemove', (e) => {
        if (!initialMousePos) {
            initialMousePos = { x: e.screenX, y: e.screenY };
            return;
        }
        const dx = Math.abs(e.screenX - initialMousePos.x);
        const dy = Math.abs(e.screenY - initialMousePos.y);
        if (dx > MOUSE_THRESHOLD || dy > MOUSE_THRESHOLD) {
            triggerLock();
        }
    }, true);

    // Mouse click, scroll, touch
    document.addEventListener('mousedown', () => triggerLock(), true);
    document.addEventListener('wheel', () => triggerLock(), true);
    document.addEventListener('touchstart', () => triggerLock(), true);

    // Context menu (right click)
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        triggerLock();
    }, true);
}

// ── Matrix Rain ─────────────────────────────────────────────────────────────

function buildMask(canvas, maskImage, cellSize, callback) {
    const cols = Math.floor(canvas.width / cellSize);
    const rows = Math.floor(canvas.height / cellSize);
    const img = new Image();
    img.onload = () => {
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const octx = offscreen.getContext('2d');
        const scale = Math.min((canvas.width * 0.8) / img.width, (canvas.height * 0.7) / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        octx.drawImage(img, x, y, w, h);
        const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
        const data = imageData.data;
        const imgW = offscreen.width;
        const mask = [];
        for (let c = 0; c < cols; c++) {
            mask[c] = [];
            for (let r = 0; r < rows; r++) {
                const x0 = c * cellSize;
                const y0 = r * cellSize;
                const x1 = Math.min(x0 + cellSize, imgW);
                const y1 = Math.min(y0 + cellSize, offscreen.height);
                let opaqueCount = 0;
                let totalCount = 0;
                for (let py = y0; py < y1; py++) {
                    for (let px = x0; px < x1; px++) {
                        totalCount++;
                        if (data[(py * imgW + px) * 4 + 3] > 50) opaqueCount++;
                    }
                }
                mask[c][r] = totalCount > 0 ? opaqueCount / totalCount : 0;
            }
        }
        callback(mask, cols, rows);
    };
    img.onerror = () => callback(null);
    img.src = maskImage;
}

// ── Color Helpers ────────────────────────────────────────────────────────────

function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
}

// ── WebGL Helpers ────────────────────────────────────────────────────────────

function createGLProgram(gl, vsSrc, fsSrc) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return prog;
}

// ── Matrix Rain Dispatcher ──────────────────────────────────────────────────

function matrixRain(canvas) {
    const gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false,
        preserveDrawingBuffer: false, powerPreference: 'high-performance'
    });
    if (gl) {
        matrixRainGL(gl, canvas);
    } else {
        matrixRainCanvas(canvas);
    }
}

// ── Matrix Rain — WebGL2 GPU Renderer ───────────────────────────────────────

function matrixRainGL(gl, canvas) {
    const W = canvas.width, H = canvas.height;
    const cellSize = Math.max(8, Math.min(16, config.letterSize ?? 16));
    const fontSize = cellSize - 1;
    const cols = Math.floor(W / cellSize);
    const rows = Math.floor(H / cellSize);
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    const charArr = [...chars];
    const charCount = charArr.length;

    // ── Config ──
    const maskEnabled = config.maskEnabled !== false && !!config.maskImage;

    const intensity = Math.max(10, Math.min(100, config.maskIntensity ?? 50));
    const maskDecay = 0.92 + (intensity / 100) * 0.07;
    const maskAlphaMul = 0.3 + (intensity / 100) * 0.7;
    const speedPct = Math.max(20, Math.min(200, config.rainSpeed ?? 100));
    const msPerTick = 1000 / (60 * speedPct / 100);
    const style = config.colorStyle || 'classic-green';
    const rainOpacity = Math.max(0.2, Math.min(1, (config.rainOpacity ?? 100) / 100));

    // ── Column state ──
    const drops = new Array(cols).fill(-1);
    const rgbHues = [0, 120, 240];
    const columnHues = new Array(cols);
    const columnRgb = new Array(cols);
    for (let i = 0; i < cols; i++) {
        columnHues[i] = Math.floor(Math.random() * 360);
        columnRgb[i] = rgbHues[Math.floor(Math.random() * 3)];
    }
    function pickRgbHue() { return rgbHues[Math.floor(Math.random() * 3)]; }

    // ── Cell data ──
    const cellData = [];
    for (let c = 0; c < cols; c++) {
        cellData[c] = [];
        for (let r = 0; r < rows; r++) {
            cellData[c][r] = { charIdx: 0, brightness: 0 };
        }
    }

    // ── Mask ──
    let mask = null;
    const startTime = Date.now();
    const revealDelay = 4000;
    if (maskEnabled) {
        buildMask(canvas, config.maskImage, cellSize, (m) => { mask = m; });
    }

    // ── Build glyph atlas ──
    const ATLAS_COLS = Math.ceil(Math.sqrt(charCount));
    const ATLAS_ROWS = Math.ceil(charCount / ATLAS_COLS);
    const atlasW = ATLAS_COLS * cellSize;
    const atlasH = ATLAS_ROWS * cellSize;
    const atlasCanvas = document.createElement('canvas');
    atlasCanvas.width = atlasW;
    atlasCanvas.height = atlasH;
    const actx = atlasCanvas.getContext('2d');
    actx.fillStyle = '#000000';
    actx.fillRect(0, 0, atlasW, atlasH);
    actx.font = `${fontSize}px monospace`;
    actx.textBaseline = 'top';
    actx.fillStyle = '#ffffff';
    for (let i = 0; i < charCount; i++) {
        const cx = (i % ATLAS_COLS) * cellSize;
        const cy = Math.floor(i / ATLAS_COLS) * cellSize;
        actx.save();
        actx.beginPath();
        actx.rect(cx, cy, cellSize, cellSize);
        actx.clip();
        actx.fillText(charArr[i], cx, cy);
        actx.restore();
    }
    // Extract luminance → R8 texture (avoids ClearType subpixel artifacts)
    const imgData = actx.getImageData(0, 0, atlasW, atlasH);
    const lumData = new Uint8Array(atlasW * atlasH);
    for (let i = 0; i < lumData.length; i++) {
        const r = imgData.data[i * 4];
        const g = imgData.data[i * 4 + 1];
        const b = imgData.data[i * 4 + 2];
        const lum = Math.max(r, g, b);
        lumData[i] = lum > 25 ? lum : 0;
    }

    // ── Upload atlas texture ──
    const atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, atlasW, atlasH, 0, gl.RED, gl.UNSIGNED_BYTE, lumData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // ── Ping-pong FBOs for trail effect ──
    function makeFBO() {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return { fbo, tex };
    }
    const fboA = makeFBO(), fboB = makeFBO();
    let readFBO = fboA, writeFBO = fboB;

    // ── Shaders ──
    const fadeVS = `#version 300 es
    in vec2 aPos;
    out vec2 vUV;
    void main() { vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const fadeFS = `#version 300 es
    precision mediump float;
    in vec2 vUV;
    uniform sampler2D uTex;
    uniform float uFade;
    out vec4 fragColor;
    void main() { vec4 c = texture(uTex, vUV); fragColor = vec4(c.rgb * uFade, 1.0); }`;

    const glyphVS = `#version 300 es
    in vec2 aQuad;
    in vec2 aOffset;
    in float aCharIdx;
    in vec4 aColor;
    uniform vec2 uRes;
    uniform vec2 uCell;
    uniform float uAtlasCols;
    uniform float uAtlasRows;
    out vec2 vAtlasUV;
    out vec4 vColor;
    void main() {
        vec2 pos = aOffset + aQuad * uCell;
        vec2 ndc = (pos / uRes) * 2.0 - 1.0;
        ndc.y = -ndc.y;
        gl_Position = vec4(ndc, 0.0, 1.0);
        float c = mod(aCharIdx, uAtlasCols);
        float r = floor(aCharIdx / uAtlasCols);
        vAtlasUV = (vec2(c, r) + aQuad) / vec2(uAtlasCols, uAtlasRows);
        vColor = aColor;
    }`;

    const glyphFS = `#version 300 es
    precision mediump float;
    in vec2 vAtlasUV;
    in vec4 vColor;
    uniform sampler2D uAtlas;
    out vec4 fragColor;
    void main() {
        float a = texture(uAtlas, vAtlasUV).r;
        if (a < 0.1) discard;
        fragColor = vec4(vColor.rgb, vColor.a * a);
    }`;

    const fadeProg = createGLProgram(gl, fadeVS, fadeFS);
    const glyphProg = createGLProgram(gl, glyphVS, glyphFS);

    // ── Fade fullscreen quad ──
    const quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const fadeVAO = gl.createVertexArray();
    gl.bindVertexArray(fadeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    const fadePosLoc = gl.getAttribLocation(fadeProg, 'aPos');
    gl.enableVertexAttribArray(fadePosLoc);
    gl.vertexAttribPointer(fadePosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ── Glyph instanced quads ──
    const unitQuadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);

    const INST_FLOATS = 7; // offsetX, offsetY, charIdx, r, g, b, a
    const MAX_INST = cols * rows + cols;
    const instData = new Float32Array(MAX_INST * INST_FLOATS);
    const instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);

    const glyphVAO = gl.createVertexArray();
    gl.bindVertexArray(glyphVAO);
    // Per-vertex quad
    gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadBuf);
    const aQuadLoc = gl.getAttribLocation(glyphProg, 'aQuad');
    gl.enableVertexAttribArray(aQuadLoc);
    gl.vertexAttribPointer(aQuadLoc, 2, gl.FLOAT, false, 0, 0);
    // Per-instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    const stride = INST_FLOATS * 4;
    const aOffLoc = gl.getAttribLocation(glyphProg, 'aOffset');
    gl.enableVertexAttribArray(aOffLoc);
    gl.vertexAttribPointer(aOffLoc, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aOffLoc, 1);
    const aCharLoc = gl.getAttribLocation(glyphProg, 'aCharIdx');
    gl.enableVertexAttribArray(aCharLoc);
    gl.vertexAttribPointer(aCharLoc, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(aCharLoc, 1);
    const aColLoc = gl.getAttribLocation(glyphProg, 'aColor');
    gl.enableVertexAttribArray(aColLoc);
    gl.vertexAttribPointer(aColLoc, 4, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(aColLoc, 1);
    gl.bindVertexArray(null);

    // ── Uniform locations ──
    const uFadeTex = gl.getUniformLocation(fadeProg, 'uTex');
    const uFadeFade = gl.getUniformLocation(fadeProg, 'uFade');
    const uGlyphAtlas = gl.getUniformLocation(glyphProg, 'uAtlas');
    const uGlyphRes = gl.getUniformLocation(glyphProg, 'uRes');
    const uGlyphCell = gl.getUniformLocation(glyphProg, 'uCell');
    const uGlyphAC = gl.getUniformLocation(glyphProg, 'uAtlasCols');
    const uGlyphAR = gl.getUniformLocation(glyphProg, 'uAtlasRows');

    // ── Initial GL state ──
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fbo); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);

    // ── Color helpers (return [h, s, l]) ──
    function rainHSL(col) {
        switch (style) {
            case 'neon-blue': return [200, 100, 50 + Math.random() * 30];
            case 'amber': return [35, 100, 50 + Math.random() * 25];
            case 'random-all': return [Math.random() * 360, 100, 50 + Math.random() * 30];
            case 'random-column':
            case 'random-column-mask': return [columnHues[col], 100, 50 + Math.random() * 30];
            case 'rgb-column': return [columnRgb[col], 100, 50 + Math.random() * 20];
            case 'rgb-char': return [pickRgbHue(), 100, 50 + Math.random() * 20];
            default: return [120, 100, 50 + Math.random() * 30];
        }
    }

    function maskHS(col, now) {
        switch (style) {
            case 'neon-blue': return [200, 100];
            case 'amber': return [35, 100];
            case 'random-all': return [Math.random() * 360, 100];
            case 'random-column': return [Math.random() * 360, 100];
            case 'random-column-mask': return [columnHues[col], 100];
            case 'rgb-column': return [columnRgb[col], 100];
            case 'rgb-char': return [pickRgbHue(), 100];
            case 'green-rain-rainbow-mask': return [Math.random() * 360, 100];
            case 'green-rain-rgb-mask': return [pickRgbHue(), 100];
            case 'green-rain-scrolling-rainbow-mask': return [((col / cols) * 360 + now / 20) % 360, 100];
            default: return [120, 100];
        }
    }

    // ── Render helpers ──
    function renderFade() {
        gl.useProgram(fadeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readFBO.tex);
        gl.uniform1i(uFadeTex, 0);
        gl.uniform1f(uFadeFade, 0.95);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(fadeVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function renderGlyphs(count) {
        gl.useProgram(glyphProg);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.uniform1i(uGlyphAtlas, 0);
        gl.uniform2f(uGlyphRes, W, H);
        gl.uniform2f(uGlyphCell, cellSize, cellSize);
        gl.uniform1f(uGlyphAC, ATLAS_COLS);
        gl.uniform1f(uGlyphAR, ATLAS_ROWS);
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData.subarray(0, count * INST_FLOATS));
        gl.bindVertexArray(glyphVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    }

    // ── Animation loop ──
    let lastTick = performance.now();
    let accumulator = 0;

    const draw = (now) => {
        accumulator += now - lastTick;
        lastTick = now;
        if (accumulator > 200) accumulator = 200;

        while (accumulator >= msPerTick) {
            accumulator -= msPerTick;
            let instCount = 0;

            // ── Rain drops ──
            for (let i = 0; i < cols; i++) {
                const charIdx = Math.floor(Math.random() * charCount);
                const row = drops[i];
                const [h, s, l] = rainHSL(i);
                const [r, g, b] = hslToRgb(h, s, l);
                const off = instCount * INST_FLOATS;
                instData[off]     = i * cellSize;
                instData[off + 1] = row * cellSize;
                instData[off + 2] = charIdx;
                instData[off + 3] = r;
                instData[off + 4] = g;
                instData[off + 5] = b;
                instData[off + 6] = rainOpacity;
                instCount++;

                if (row >= 0 && row < rows) {
                    cellData[i][row].charIdx = charIdx;
                    cellData[i][row].brightness = 1.0;
                }
                if (drops[i] * cellSize > H && Math.random() > 0.975) {
                    drops[i] = -1;
                    columnHues[i] = Math.floor(Math.random() * 360);
                    columnRgb[i] = rgbHues[Math.floor(Math.random() * 3)];
                }
                drops[i]++;
            }

            const elapsed = Date.now() - startTime;
            if (mask && elapsed > revealDelay) {
                const ramp = Math.min(1, (elapsed - revealDelay) / 2000);
                for (let c = 0; c < cols; c++) {
                    for (let r = 0; r < rows; r++) {
                        const density = mask[c][r];
                        if (density <= 0) continue;
                        const cell = cellData[c][r];
                        if (cell.brightness <= 0.03) continue;
                        const cellDecayV = 1 - (1 - maskDecay) / density;
                        cell.brightness *= Math.max(0.90, Math.min(cellDecayV, maskDecay));
                        const alpha = cell.brightness * ramp * maskAlphaMul * Math.sqrt(density);
                        const lightness = 45 + alpha * 35;
                        const [mh, ms] = maskHS(c, now);
                        const [mr, mg, mb] = hslToRgb(mh, ms, lightness);
                        const off = instCount * INST_FLOATS;
                        instData[off]     = c * cellSize;
                        instData[off + 1] = r * cellSize;
                        instData[off + 2] = cell.charIdx;
                        instData[off + 3] = mr;
                        instData[off + 4] = mg;
                        instData[off + 5] = mb;
                        instData[off + 6] = alpha;
                        instCount++;
                    }
                }
            } else {
                for (let c = 0; c < cols; c++) {
                    for (let r = 0; r < rows; r++) {
                        cellData[c][r].brightness *= 0.90;
                    }
                }
            }

            // ── GPU render tick ──
            gl.bindFramebuffer(gl.FRAMEBUFFER, writeFBO.fbo);
            gl.viewport(0, 0, W, H);
            renderFade();
            if (instCount > 0) renderGlyphs(instCount);
            // Swap FBOs
            const tmp = readFBO; readFBO = writeFBO; writeFBO = tmp;
        }

        // Draw current state to screen via fullscreen quad
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.useProgram(fadeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readFBO.tex);
        gl.uniform1i(uFadeTex, 0);
        gl.uniform1f(uFadeFade, 1.0);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(fadeVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        raf = requestAnimationFrame(draw);
    };

    // ── Cleanup callback ──
    cleanupFn = () => {
        gl.deleteTexture(atlasTex);
        gl.deleteTexture(fboA.tex);  gl.deleteTexture(fboB.tex);
        gl.deleteFramebuffer(fboA.fbo); gl.deleteFramebuffer(fboB.fbo);
        gl.deleteBuffer(quadBuf); gl.deleteBuffer(unitQuadBuf); gl.deleteBuffer(instBuf);
        gl.deleteVertexArray(fadeVAO); gl.deleteVertexArray(glyphVAO);
        gl.deleteProgram(fadeProg); gl.deleteProgram(glyphProg);
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
    };

    raf = requestAnimationFrame(draw);
}

// ── Matrix Rain — Canvas 2D Fallback ────────────────────────────────────────

function matrixRainCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const cellSize = Math.max(8, Math.min(16, config.letterSize ?? 16));
    const fontSize = cellSize - 1;
    const cols = Math.floor(canvas.width / cellSize);
    const rows = Math.floor(canvas.height / cellSize);
    const drops = new Array(cols).fill(-1);
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

    const maskEnabled = config.maskEnabled !== false && !!config.maskImage;
    const intensity = Math.max(10, Math.min(100, config.maskIntensity ?? 50));
    const maskDecay = 0.92 + (intensity / 100) * 0.07;
    const maskAlphaMul = 0.3 + (intensity / 100) * 0.7;
    const speedPct = Math.max(20, Math.min(200, config.rainSpeed ?? 100));
    const msPerTick = 1000 / (60 * speedPct / 100);
    const style = config.colorStyle || 'classic-green';
    const rainOpacity = Math.max(0.2, Math.min(1, (config.rainOpacity ?? 100) / 100));

    const columnHues = new Array(cols);
    const rgbHues = [0, 120, 240];
    const columnRgb = new Array(cols);
    for (let i = 0; i < cols; i++) {
        columnHues[i] = Math.floor(Math.random() * 360);
        columnRgb[i] = rgbHues[Math.floor(Math.random() * 3)];
    }
    function pickRgbHue() { return rgbHues[Math.floor(Math.random() * 3)]; }

    function rainColor(col) {
        switch (style) {
            case 'neon-blue': return `hsla(200, 100%, ${50 + Math.random() * 30}%, ${rainOpacity})`;
            case 'amber': return `hsla(35, 100%, ${50 + Math.random() * 25}%, ${rainOpacity})`;
            case 'random-all': return `hsla(${Math.floor(Math.random() * 360)}, 100%, ${50 + Math.random() * 30}%, ${rainOpacity})`;
            case 'random-column':
            case 'random-column-mask': return `hsla(${columnHues[col]}, 100%, ${50 + Math.random() * 30}%, ${rainOpacity})`;
            case 'rgb-column': return `hsla(${columnRgb[col]}, 100%, ${50 + Math.random() * 20}%, ${rainOpacity})`;
            case 'rgb-char': return `hsla(${pickRgbHue()}, 100%, ${50 + Math.random() * 20}%, ${rainOpacity})`;
            default: return `hsla(120, 100%, ${50 + Math.random() * 30}%, ${rainOpacity})`;
        }
    }

    function maskColor(alpha, lightness, now, col) {
        switch (style) {
            case 'neon-blue': return `hsla(200, 100%, ${lightness}%, ${alpha})`;
            case 'amber': return `hsla(35, 100%, ${lightness}%, ${alpha})`;
            case 'random-all': return `hsla(${Math.floor(Math.random() * 360)}, 100%, ${lightness}%, ${alpha})`;
            case 'random-column': return `hsla(${Math.floor(Math.random() * 360)}, 100%, ${lightness}%, ${alpha})`;
            case 'random-column-mask': return `hsla(${columnHues[col]}, 100%, ${lightness}%, ${alpha})`;
            case 'rgb-column': return `hsla(${columnRgb[col]}, 100%, ${lightness}%, ${alpha})`;
            case 'rgb-char': return `hsla(${pickRgbHue()}, 100%, ${lightness}%, ${alpha})`;
            case 'green-rain-rainbow-mask': return `hsla(${Math.floor(Math.random() * 360)}, 100%, ${lightness}%, ${alpha})`;
            case 'green-rain-rgb-mask': return `hsla(${pickRgbHue()}, 100%, ${lightness}%, ${alpha})`;
            case 'green-rain-scrolling-rainbow-mask': return `hsla(${((col / cols) * 360 + now / 20) % 360}, 100%, ${lightness}%, ${alpha})`;
            default: return `hsla(120, 100%, ${lightness}%, ${alpha})`;
        }
    }

    const cellData = [];
    for (let c = 0; c < cols; c++) {
        cellData[c] = [];
        for (let r = 0; r < rows; r++) {
            cellData[c][r] = { char: '', brightness: 0 };
        }
    }

    let mask = null;
    const startTime = Date.now();
    const revealDelay = 4000;
    let lastTick = performance.now();
    let accumulator = 0;
    if (maskEnabled) {
        buildMask(canvas, config.maskImage, cellSize, (m) => { mask = m; });
    }

    const draw = (now) => {
        accumulator += now - lastTick;
        lastTick = now;
        if (accumulator > 200) accumulator = 200;
        while (accumulator >= msPerTick) {
            accumulator -= msPerTick;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = fontSize + 'px monospace';
            for (let i = 0; i < drops.length; i++) {
                const ch = chars[Math.floor(Math.random() * chars.length)];
                const row = drops[i];
                ctx.fillStyle = rainColor(i);
                ctx.fillText(ch, i * cellSize, row * cellSize);
                if (row >= 0 && row < rows) {
                    cellData[i][row].char = ch;
                    cellData[i][row].brightness = 1.0;
                }
                if (drops[i] * cellSize > canvas.height && Math.random() > 0.975) {
                    drops[i] = -1;
                    columnHues[i] = Math.floor(Math.random() * 360);
                    columnRgb[i] = rgbHues[Math.floor(Math.random() * 3)];
                }
                drops[i]++;
            }
            const elapsed = Date.now() - startTime;
            if (mask && elapsed > revealDelay) {
                const ramp = Math.min(1, (elapsed - revealDelay) / 2000);
                for (let c = 0; c < cols; c++) {
                    for (let r = 0; r < rows; r++) {
                        const density = mask[c][r];
                        if (density <= 0) continue;
                        const cell = cellData[c][r];
                        if (cell.brightness <= 0.03 || !cell.char) continue;
                        const cellDecay = 1 - (1 - maskDecay) / density;
                        cell.brightness *= Math.max(0.90, Math.min(cellDecay, maskDecay));
                        const alpha = cell.brightness * ramp * maskAlphaMul * Math.sqrt(density);
                        const lightness = 45 + alpha * 35;
                        ctx.fillStyle = maskColor(alpha, lightness, now, c);
                        ctx.fillText(cell.char, c * cellSize, r * cellSize);
                    }
                }
            } else {
                for (let c = 0; c < cols; c++) {
                    for (let r = 0; r < rows; r++) {
                        cellData[c][r].brightness *= 0.90;
                    }
                }
            }
        }
        raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
}

// ── Starfield ───────────────────────────────────────────────────────────────

function starfield(ctx, canvas) {
    const stars = Array.from({ length: 300 }, () => ({
        x: Math.random() * canvas.width - canvas.width / 2,
        y: Math.random() * canvas.height - canvas.height / 2,
        z: Math.random() * canvas.width
    }));
    const draw = () => {
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2, cy = canvas.height / 2;
        for (const star of stars) {
            star.z -= 4;
            if (star.z <= 0) { star.z = canvas.width; star.x = Math.random() * canvas.width - cx; star.y = Math.random() * canvas.height - cy; }
            const sx = (star.x / star.z) * cx + cx;
            const sy = (star.y / star.z) * cy + cy;
            const r = Math.max(0, (1 - star.z / canvas.width) * 3);
            const a = Math.max(0, (1 - star.z / canvas.width));
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${a})`;
            ctx.fill();
        }
        raf = requestAnimationFrame(draw);
    };
    draw();
}

// ── Clock ───────────────────────────────────────────────────────────────────

function clockMode(ctx, canvas) {
    const draw = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const now = new Date();
        const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(n => String(n).padStart(2, '0')).join(':');
        ctx.fillStyle = '#fff';
        ctx.font = '600 80px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(time, canvas.width / 2, canvas.height / 2);
        const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        ctx.font = '300 20px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(date, canvas.width / 2, canvas.height / 2 + 60);
        raf = requestAnimationFrame(draw);
    };
    draw();
}
