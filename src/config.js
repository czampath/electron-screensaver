// Config window logic
let config = {};

window.screensaverAPI.onConfig((cfg) => {
    config = cfg;
    populateUI();
});

function populateUI() {
    // Mode
    document.getElementById('type').value = config.type || 'matrix';
    updateMaskSectionVisibility();

    // Idle timeout
    document.getElementById('idleTimeout').value = config.idleTimeout ?? 5;
    document.getElementById('idleVal').textContent = (config.idleTimeout ?? 5) + ' min';

    // Awake timeout
    const awakeVal = config.awakeTimeout ?? 15;
    document.getElementById('awakeTimeout').value = awakeVal;
    document.getElementById('awakeVal').textContent = awakeVal === 0 ? 'indefinite' : awakeVal + ' min';

    // Only on power
    document.getElementById('onlyOnPower').checked = config.onlyOnPower !== false;

    // Matrix settings
    document.getElementById('letterSize').value = config.letterSize ?? 16;
    document.getElementById('sizeVal').textContent = (config.letterSize ?? 16) + 'px';

    document.getElementById('rainSpeed').value = config.rainSpeed ?? 100;
    document.getElementById('speedVal').textContent = (config.rainSpeed ?? 100) + '%';

    document.getElementById('rainOpacity').value = config.rainOpacity ?? 100;
    document.getElementById('rainOpacityVal').textContent = (config.rainOpacity ?? 100) + '%';

    document.getElementById('colorStyle').value = config.colorStyle || 'classic-green';

    document.getElementById('maskEnabled').checked = config.maskEnabled !== false;

    document.getElementById('maskIntensity').value = config.maskIntensity ?? 50;
    document.getElementById('intensityVal').textContent = (config.maskIntensity ?? 50) + '%';

    // Mask preview
    updateMaskPreview();
}

function updateMaskSectionVisibility() {
    const section = document.getElementById('maskSection');
    section.classList.toggle('hidden', config.type !== 'matrix' && !!config.type);
}

function updateMaskPreview() {
    const preview = document.getElementById('maskPreview');
    const clearBtn = document.getElementById('maskClear');
    if (config.maskImage) {
        preview.innerHTML = `<img src="${sanitizeDataUrl(config.maskImage)}">`;
        clearBtn.disabled = false;
    } else {
        preview.innerHTML = '<span class="empty">No mask image</span>';
        clearBtn.disabled = true;
    }
}

function sanitizeDataUrl(url) {
    // Only allow data: URLs with image MIME types
    if (url && url.startsWith('data:image/')) return url;
    return '';
}

function save() {
    window.screensaverAPI.saveConfig(config);
}

// ── Event Listeners ─────────────────────────────────────────────────────────

document.getElementById('type').addEventListener('change', (e) => {
    config.type = e.target.value;
    updateMaskSectionVisibility();
    save();
});

document.getElementById('idleTimeout').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    config.idleTimeout = val;
    document.getElementById('idleVal').textContent = val + ' min';
    save();
});

document.getElementById('awakeTimeout').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    config.awakeTimeout = val;
    document.getElementById('awakeVal').textContent = val === 0 ? 'indefinite' : val + ' min';
    save();
});

document.getElementById('onlyOnPower').addEventListener('change', (e) => {
    config.onlyOnPower = e.target.checked;
    save();
});

document.getElementById('letterSize').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    config.letterSize = val;
    document.getElementById('sizeVal').textContent = val + 'px';
    save();
});

document.getElementById('rainSpeed').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    config.rainSpeed = val;
    document.getElementById('speedVal').textContent = val + '%';
    save();
});

document.getElementById('rainOpacity').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    config.rainOpacity = val;
    document.getElementById('rainOpacityVal').textContent = val + '%';
    save();
});

document.getElementById('colorStyle').addEventListener('change', (e) => {
    config.colorStyle = e.target.value;
    save();
});

document.getElementById('maskEnabled').addEventListener('change', (e) => {
    config.maskEnabled = e.target.checked;
    save();
});

document.getElementById('maskIntensity').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    config.maskIntensity = val;
    document.getElementById('intensityVal').textContent = val + '%';
    save();
});

// Mask file picker
document.getElementById('maskChoose').addEventListener('click', () => {
    document.getElementById('maskFile').click();
});

document.getElementById('maskFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['image/png', 'image/webp'].includes(file.type)) return;
    if (file.size > 500 * 1024) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        config.maskImage = evt.target.result;
        updateMaskPreview();
        save();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});

document.getElementById('maskClear').addEventListener('click', () => {
    config.maskImage = '';
    updateMaskPreview();
    save();
});

// Launch button
document.getElementById('launch').addEventListener('click', () => {
    window.screensaverAPI.launchScreensaver();
});
