const SAGEOS_INSTANCE_STORAGE_KEY = 'sageos-instances-v1';

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

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 1e7)}`;
}

function escapeHtml(text) {
    const node = document.createElement('div');
    node.textContent = text;
    return node.innerHTML;
}

(function initSageOSLaunch() {
    const title = document.getElementById('boot-title');
    const subtitle = document.getElementById('boot-subtitle');
    const progressFill = document.getElementById('progress-fill');
    const progressLabel = document.getElementById('progress-label');
    const bootLog = document.getElementById('boot-log');
    const bootScreen = document.getElementById('boot-screen');
    const desktopScreen = document.getElementById('desktop-screen');
    const desktopTitle = document.getElementById('desktop-title');
    const desktopMeta = document.getElementById('desktop-meta');
    const desktopRole = document.getElementById('desktop-role');
    const newButton = document.getElementById('desktop-new');
    const duplicateButton = document.getElementById('desktop-duplicate');
    const saveButton = document.getElementById('desktop-save');
    const deleteButton = document.getElementById('desktop-delete');
    const activeNote = document.getElementById('desktop-active-note');
    const instancesWrap = document.getElementById('desktop-instances');

    if (
        !title
        || !subtitle
        || !progressFill
        || !progressLabel
        || !bootLog
        || !bootScreen
        || !desktopScreen
        || !desktopTitle
        || !desktopMeta
        || !desktopRole
        || !newButton
        || !duplicateButton
        || !saveButton
        || !deleteButton
        || !activeNote
        || !instancesWrap
    ) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const user = (params.get('user') || 'Guest').trim().slice(0, 32) || 'Guest';
    const initialRole = (params.get('role') || 'Executive Strategist').trim().slice(0, 60) || 'Executive Strategist';
    const initialInstance = (params.get('instance') || `${initialRole} Workspace`).trim().slice(0, 60);
    const initialInstanceId = (params.get('instanceId') || createId()).trim().slice(0, 90);
    let selectedInstanceId = initialInstanceId;

    if ([...desktopRole.options].some((option) => option.value === initialRole)) {
        desktopRole.value = initialRole;
    }

    title.textContent = `Launching ${initialRole} workspace...`;
    subtitle.textContent = `Preparing persona runtime for ${user}.`;

    const baseLogLines = [
        'Validating access token envelope...',
        'Establishing encrypted workspace channel...',
        'Resolving persona capability pack...',
        'Mounting app bundle graph for WebShark products...',
        'Syncing profile preferences and command palette...',
        'Hydrating role-specific desktop widgets...',
        'Linking data adapters, AI engines, and workflow nodes...',
        'Running policy guardrails and telemetry checks...',
        'Starting secure service mesh and workspace listeners...',
        'Finalizing startup state...'
    ];

    function appendLog(message) {
        const row = document.createElement('p');
        row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        bootLog.appendChild(row);
        bootLog.scrollTop = bootLog.scrollHeight;
    }

    function readAllInstances() {
        const payload = safeReadJSON(SAGEOS_INSTANCE_STORAGE_KEY);
        return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    }

    function writeAllInstances(nextPayload) {
        safeWriteStorage(SAGEOS_INSTANCE_STORAGE_KEY, JSON.stringify(nextPayload));
    }

    function normalizeInstance(raw, index) {
        if (!raw || typeof raw !== 'object') return null;
        const role = typeof raw.role === 'string' && raw.role.trim() ? raw.role.trim().slice(0, 60) : desktopRole.value;
        const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : `${role} Workspace ${index + 1}`;
        return {
            id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createId(),
            name,
            role,
            status: typeof raw.status === 'string' && raw.status.trim() ? raw.status.trim().slice(0, 16) : 'active',
            createdAt: typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt.trim() : new Date().toLocaleString(),
            savedAt: typeof raw.savedAt === 'string' ? raw.savedAt.trim().slice(0, 64) : ''
        };
    }

    function getInstances() {
        const all = readAllInstances();
        const raw = Array.isArray(all[user]) ? all[user] : [];
        return raw.map((entry, index) => normalizeInstance(entry, index)).filter(Boolean);
    }

    function setInstances(nextInstances) {
        const all = readAllInstances();
        all[user] = nextInstances.slice(0, 100);
        writeAllInstances(all);
    }

    function getSelected(instances) {
        return instances.find((entry) => entry.id === selectedInstanceId) || null;
    }

    function renderInstances() {
        const instances = getInstances();
        if (instances.length === 0) {
            selectedInstanceId = '';
            activeNote.textContent = 'No instances available yet. Create one from the controls above.';
            instancesWrap.innerHTML = '';
            return;
        }

        if (!instances.some((entry) => entry.id === selectedInstanceId)) {
            selectedInstanceId = instances[0].id;
        }

        const selected = getSelected(instances);
        if (selected) {
            desktopRole.value = selected.role;
            activeNote.textContent = selected.savedAt
                ? `${selected.name} · ${selected.role} · saved ${selected.savedAt}`
                : `${selected.name} · ${selected.role} · ${selected.status}`;
        }

        instancesWrap.innerHTML = instances.map((instance) => `
            <button type="button" class="desktop-instance-item ${instance.id === selectedInstanceId ? 'is-active' : ''}" data-id="${escapeHtml(instance.id)}">
                <strong>${escapeHtml(instance.name)}</strong>
                <span>${escapeHtml(instance.role)}</span>
            </button>
        `).join('');
    }

    function createInstance() {
        const instances = getInstances();
        const role = desktopRole.value;
        const entry = {
            id: createId(),
            name: `${role} Workspace ${instances.length + 1}`.slice(0, 60),
            role,
            status: 'active',
            createdAt: new Date().toLocaleString(),
            savedAt: ''
        };
        instances.unshift(entry);
        selectedInstanceId = entry.id;
        setInstances(instances);
        renderInstances();
    }

    function duplicateInstance() {
        const instances = getInstances();
        const selected = getSelected(instances);
        if (!selected) return;
        instances.unshift({
            ...selected,
            id: createId(),
            name: `${selected.name} Copy`.slice(0, 60),
            status: 'active',
            createdAt: new Date().toLocaleString(),
            savedAt: ''
        });
        selectedInstanceId = instances[0].id;
        setInstances(instances);
        renderInstances();
    }

    function saveInstance() {
        const instances = getInstances();
        const selected = getSelected(instances);
        if (!selected) return;
        selected.status = 'saved';
        selected.savedAt = new Date().toLocaleString();
        setInstances(instances);
        renderInstances();
    }

    function deleteInstance() {
        const instances = getInstances();
        const index = instances.findIndex((entry) => entry.id === selectedInstanceId);
        if (index === -1) return;
        instances.splice(index, 1);
        selectedInstanceId = instances[0]?.id || '';
        setInstances(instances);
        renderInstances();
    }

    instancesWrap.addEventListener('click', (event) => {
        const button = event.target.closest('.desktop-instance-item');
        if (!button) return;
        selectedInstanceId = button.dataset.id || '';
        renderInstances();
    });

    newButton.addEventListener('click', createInstance);
    duplicateButton.addEventListener('click', duplicateInstance);
    saveButton.addEventListener('click', saveInstance);
    deleteButton.addEventListener('click', deleteInstance);

    desktopRole.addEventListener('change', () => {
        const instances = getInstances();
        const selected = getSelected(instances);
        if (!selected) return;
        selected.role = desktopRole.value;
        selected.status = 'active';
        setInstances(instances);
        renderInstances();
    });

    let progress = 0;
    let logIndex = 0;
    appendLog(`Persona selected: ${initialRole}`);
    appendLog(`Workspace instance: ${initialInstance}`);
    appendLog(`Starting boot sequence for ${user}...`);

    const timer = window.setInterval(() => {
        const increment = Math.max(1, Math.ceil(Math.random() * 4));
        progress = Math.min(100, progress + increment);
        progressFill.style.width = `${progress}%`;
        progressLabel.textContent = `${progress}%`;

        const passes = Math.max(1, Math.ceil(Math.random() * 3));
        for (let index = 0; index < passes; index += 1) {
            const line = baseLogLines[(logIndex + index) % baseLogLines.length];
            appendLog(`${line} (${Math.min(100, progress + index)}%)`);
        }
        logIndex += passes;

        if (progress < 100) return;

        window.clearInterval(timer);
        appendLog('Workspace launch complete.');
        desktopTitle.textContent = `${initialRole} desktop ready`;
        desktopMeta.textContent = `${user} · ${initialInstance}`;

        const currentInstances = getInstances();
        if (!currentInstances.some((instance) => instance.id === initialInstanceId)) {
            currentInstances.unshift({
                id: initialInstanceId,
                name: initialInstance,
                role: initialRole,
                status: 'active',
                createdAt: new Date().toLocaleString(),
                savedAt: ''
            });
            setInstances(currentInstances);
        }
        selectedInstanceId = initialInstanceId;
        renderInstances();

        window.setTimeout(() => {
            document.body.classList.add('flash');
            window.setTimeout(() => {
                bootScreen.hidden = true;
                desktopScreen.hidden = false;
                requestAnimationFrame(() => {
                    desktopScreen.classList.add('is-visible');
                });
                document.body.classList.remove('flash');
            }, 860);
        }, 280);
    }, 95);
})();
