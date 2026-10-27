const SAGEOS_WORKSPACE_LAYOUT_KEY = 'sageos-workspace-layout-v1';

const WEBSHARK_PRODUCTS = [
    { id: 'webshark-ui', name: 'WebShark UI', url: 'https://sagexmeta.github.io/WebSharkUI/', icon: '🎨' },
    { id: 'data-studio', name: 'WebShark Data Studio', url: 'https://sagexmeta.github.io/WebSharkDataStudio/', icon: '🧬' },
    { id: 'manager', name: 'WebShark Manager', url: 'https://sagexmeta.github.io/WebShark-Manager/', icon: '♟️' },
    { id: 'marimo-copilot', name: 'Marimo Copilot', url: 'https://github.com/sagexmeta/WebShark-Marimo-Copilot', icon: '🤖' },
    { id: 'labor-market', name: 'Labor Market Research', url: 'https://sagexmeta.github.io/WebShark-LaborMarketSuite/', icon: '🛠️' },
    { id: 'global-insights', name: 'Global Insights', url: 'https://sagexmeta-insight-engine-docker.hf.space', icon: '🌍' },
    { id: 'communication', name: 'WebShark Communication', url: 'https://sagexmeta.github.io/WebShark-Communication-Strategy/', icon: '🗪' },
    { id: 'corr-ai', name: 'Correlation Engine', url: 'https://sagexmeta.github.io/Corr.ai/', icon: '🔀' },
    { id: 'reverie', name: 'Reverie.ai', url: 'https://sagexmeta.github.io/reverie/', icon: '🧠' },
    { id: 'infinity-mail', name: 'Infinity Mail', url: 'https://webshark-email.pages.dev/', icon: '📧' },
    { id: 'library-ai', name: 'Library.AI', url: 'https://sagexmeta.github.io/WebShark-Library-AI/', icon: '🏛️' },
    { id: 'seashore', name: 'Seashore Simulator', url: 'https://sagexmeta.github.io/thesea/', icon: '🌊' },
    { id: 'nature-sim', name: 'Nature Simulator', url: 'https://sagexmeta.github.io/RTH.db/', icon: '🌐' },
    { id: 'influence', name: 'Influence Network', url: 'https://sagexmeta.github.io/ArtistInfluence.ai/', icon: '🕸️' },
    { id: 'rocks', name: 'WebShark Rocks', url: 'https://sagexmeta.github.io/rocks/', icon: '💎' },
    { id: 'pathways', name: 'WebShark Pathways', url: 'https://sagexmeta.github.io/WebSharkPathways/', icon: '🧭' },
    { id: 'oliver', name: 'Oliver.ai Tribute', url: 'https://sagexmeta.github.io/Oliver.AI/', icon: '🛴' },
    { id: 'risk', name: 'WebShark Risk', url: 'https://sagexmeta.github.io/WebShark-Risk/', icon: '💵' },
    { id: 'mind', name: 'WebShark Mind', url: 'https://sagexmeta.github.io/WebShark-Mind/', icon: '🌀' },
    { id: 'designer', name: 'WebShark Designer', url: 'https://sagexmeta.github.io/WebShark-Designer/', icon: '🖋️' }
];

function safeReadStorage(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeWriteStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

function safeReadJSON(key) {
    const raw = safeReadStorage(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function escapeHtml(text) {
    const node = document.createElement('div');
    node.textContent = text;
    return node.innerHTML;
}

(function initWorkspaceDesktop() {
    const title = document.getElementById('workspace-title');
    const meta = document.getElementById('workspace-meta');
    const picker = document.getElementById('product-picker');
    const saveButton = document.getElementById('save-workspace');
    const resetButton = document.getElementById('reset-workspace');
    const canvas = document.getElementById('desktop-canvas');

    if (!title || !meta || !picker || !saveButton || !resetButton || !canvas) return;

    const params = new URLSearchParams(window.location.search);
    const user = (params.get('user') || 'Guest').trim().slice(0, 32) || 'Guest';
    const role = (params.get('role') || 'Executive Strategist').trim().slice(0, 64) || 'Executive Strategist';
    const instanceName = (params.get('instance') || `${role} Workspace`).trim().slice(0, 64) || `${role} Workspace`;
    const instanceId = (params.get('instanceId') || 'default-instance').trim().slice(0, 96) || 'default-instance';
    const workspaceKey = `${user}::${instanceId}`;

    title.textContent = instanceName;
    meta.textContent = `${user} · ${role}`;

    function readLayouts() {
        const payload = safeReadJSON(SAGEOS_WORKSPACE_LAYOUT_KEY);
        return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    }

    function writeLayouts(nextLayouts) {
        safeWriteStorage(SAGEOS_WORKSPACE_LAYOUT_KEY, JSON.stringify(nextLayouts));
    }

    function getDefaultApps() {
        return WEBSHARK_PRODUCTS.slice(0, 4).map((product, index) => ({
            id: product.id,
            x: 80 + ((index % 4) * 160),
            y: 80 + (Math.floor(index / 4) * 160)
        }));
    }

    function normalizeApp(rawApp, index) {
        if (!rawApp || typeof rawApp !== 'object') return null;
        const match = WEBSHARK_PRODUCTS.find((item) => item.id === rawApp.id);
        if (!match) return null;
        const x = Number.isFinite(Number(rawApp.x)) ? Number(rawApp.x) : 80 + ((index % 6) * 150);
        const y = Number.isFinite(Number(rawApp.y)) ? Number(rawApp.y) : 80 + (Math.floor(index / 6) * 150);
        return { id: match.id, x: Math.max(10, Math.min(2260, x)), y: Math.max(10, Math.min(1460, y)) };
    }

    function loadWorkspaceState() {
        const layouts = readLayouts();
        const saved = layouts[workspaceKey];
        const baseApps = Array.isArray(saved?.apps) ? saved.apps : getDefaultApps();
        const apps = baseApps.map((app, index) => normalizeApp(app, index)).filter(Boolean);
        return { apps };
    }

    let state = loadWorkspaceState();
    let dragState = null;

    function saveWorkspaceState() {
        const layouts = readLayouts();
        layouts[workspaceKey] = { apps: state.apps };
        writeLayouts(layouts);
    }

    function isAppEnabled(productId) {
        return state.apps.some((app) => app.id === productId);
    }

    function renderPicker() {
        picker.innerHTML = WEBSHARK_PRODUCTS.map((product) => `
            <label class="picker-item" for="pick-${product.id}">
                <input type="checkbox" id="pick-${product.id}" data-product-id="${escapeHtml(product.id)}" ${isAppEnabled(product.id) ? 'checked' : ''}>
                <strong>${escapeHtml(product.name)}</strong>
                <span>${escapeHtml(product.icon)}</span>
            </label>
        `).join('');
    }

    function renderDesktop() {
        canvas.innerHTML = state.apps.map((app) => {
            const product = WEBSHARK_PRODUCTS.find((item) => item.id === app.id);
            if (!product) return '';
            return `
                <article class="workspace-icon" data-app-id="${escapeHtml(app.id)}" style="left: ${app.x}px; top: ${app.y}px;">
                    <span class="emoji">${escapeHtml(product.icon)}</span>
                    <span class="name">${escapeHtml(product.name)}</span>
                    <button type="button" data-open-id="${escapeHtml(app.id)}">Open</button>
                </article>
            `;
        }).join('');
    }

    function addProduct(productId) {
        if (isAppEnabled(productId)) return;
        state.apps.push({
            id: productId,
            x: 80 + ((state.apps.length % 6) * 150),
            y: 80 + (Math.floor(state.apps.length / 6) * 150)
        });
        renderDesktop();
    }

    function removeProduct(productId) {
        state.apps = state.apps.filter((app) => app.id !== productId);
        renderDesktop();
    }

    picker.addEventListener('change', (event) => {
        const input = event.target.closest('input[type="checkbox"]');
        if (!input) return;
        const productId = input.dataset.productId || '';
        if (!productId) return;
        if (input.checked) addProduct(productId); else removeProduct(productId);
        saveWorkspaceState();
        renderPicker();
    });

    canvas.addEventListener('click', (event) => {
        const openButton = event.target.closest('button[data-open-id]');
        if (!openButton) return;
        const productId = openButton.dataset.openId || '';
        const product = WEBSHARK_PRODUCTS.find((item) => item.id === productId);
        if (!product) return;
        window.open(product.url, '_blank', 'noopener');
    });

    canvas.addEventListener('pointerdown', (event) => {
        const icon = event.target.closest('.workspace-icon');
        if (!icon) return;
        if (event.target.closest('button')) return;

        const appId = icon.dataset.appId || '';
        const app = state.apps.find((item) => item.id === appId);
        if (!app) return;

        dragState = {
            appId,
            startX: event.clientX,
            startY: event.clientY,
            originX: app.x,
            originY: app.y
        };

        icon.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!dragState) return;
        const app = state.apps.find((item) => item.id === dragState.appId);
        if (!app) return;

        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        app.x = Math.max(10, Math.min(2260, dragState.originX + dx));
        app.y = Math.max(10, Math.min(1460, dragState.originY + dy));
        renderDesktop();
    });

    function releaseDrag() {
        if (!dragState) return;
        dragState = null;
        saveWorkspaceState();
    }

    canvas.addEventListener('pointerup', releaseDrag);
    canvas.addEventListener('pointercancel', releaseDrag);

    saveButton.addEventListener('click', () => {
        saveWorkspaceState();
    });

    resetButton.addEventListener('click', () => {
        state = { apps: getDefaultApps() };
        renderPicker();
        renderDesktop();
        saveWorkspaceState();
    });

    renderPicker();
    renderDesktop();
    saveWorkspaceState();
})();
