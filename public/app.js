// API Base URL - Update this to match your backend
const API_BASE_URL = window.location.origin;

let currentPage = 1;
const itemsPerPage = 50;

function displayValue(value, fallback = '') {
    return value === null || value === undefined ? fallback : String(value);
}

function createElement(tagName, { className, text } = {}) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = displayValue(text);
    return element;
}

function addResultRow(container, label, value) {
    const row = createElement('div', { className: 'result-row' });
    row.append(createElement('span', { text: label }), createElement('strong', { text: value }));
    container.appendChild(row);
}

function renderResultSummary(container, { success, heading, rows, message }) {
    const summary = createElement('div', { className: `result-summary ${success ? 'success' : 'error'}` });
    summary.appendChild(createElement('h3', { text: heading }));
    rows.forEach(([label, value]) => addResultRow(summary, label, value));
    if (message) summary.appendChild(createElement('p', { text: message }));
    container.replaceChildren(summary);
}

function appendErrorDetails(container, errors) {
    if (!Array.isArray(errors) || errors.length === 0) return;

    const details = createElement('details');
    details.style.marginTop = '15px';
    const summary = createElement('summary', { text: `View ${errors.length} error(s)` });
    summary.style.cssText = 'cursor: pointer; padding: 10px; background: #fed7d7; border-radius: 6px;';
    const list = createElement('ul');
    list.style.cssText = 'margin-top: 10px; padding-left: 20px;';

    errors.forEach(error => {
        const index = Number(error?.index);
        list.appendChild(createElement('li', {
            text: `Line ${Number.isFinite(index) ? index + 2 : 'unknown'}: ${displayValue(error?.error, 'Unknown error')}`,
        }));
    });

    details.append(summary, list);
    container.appendChild(details);
}

function setCredentialsTableMessage(tableBody, message) {
    const row = createElement('tr');
    const cell = createElement('td', { className: 'loading', text: message });
    cell.colSpan = 7;
    row.appendChild(cell);
    tableBody.replaceChildren(row);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupForms();
    loadStats();
    loadCredentials();
});

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            // Update active states
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');

            // Load data when switching to list tab
            if (tabName === 'list') {
                loadCredentials();
            }
        });
    });
}

// Setup form handlers
function setupForms() {
    // Single credential form
    document.getElementById('singleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitSingleCredential(e.target);
    });

    // Bulk upload form
    document.getElementById('bulkForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitBulkUpload(e.target);
    });

    // Edit form
    document.getElementById('editForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateCredential(e.target);
    });

    // File input change
    document.getElementById('csvFile').addEventListener('change', (e) => {
        const fileName = e.target.files[0]?.name || 'Choose CSV file or drag here';
        document.querySelector('.file-text').textContent = fileName;
    });
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/credentials/stats`);
        const stats = await response.json();

        document.getElementById('totalCredentials').textContent = stats.total || 0;
        document.getElementById('totalBranches').textContent = stats.branches || 0;
        document.getElementById('hostSpecific').textContent = stats.hostSpecific || 0;
        document.getElementById('defaultCreds').textContent = stats.default || 0;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Submit single credential
async function submitSingleCredential(form) {
    const formData = new FormData(form);
    const data = {
        branch_id: formData.get('branch_id'),
        edge_agent_id: formData.get('edge_agent_id') || undefined,
        ip_address: formData.get('ip_address') || undefined,
        username: formData.get('username'),
        password: formData.get('password'),
    };

    showMessage('singleMessage', 'Adding credential...', 'info');

    try {
        const response = await fetch(`${API_BASE_URL}/api/credentials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
            showMessage('singleMessage', '✅ Credential added successfully!', 'success');
            form.reset();
            loadStats();
        } else {
            throw new Error(result.error || 'Failed to add credential');
        }
    } catch (error) {
        showMessage('singleMessage', `❌ Error: ${error.message}`, 'error');
    }
}

// Submit bulk upload
async function submitBulkUpload(form) {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file');
        return;
    }

    const progressContainer = document.getElementById('bulkProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultsDiv = document.getElementById('bulkResults');

    progressContainer.style.display = 'block';
    resultsDiv.replaceChildren();

    try {
        // Parse CSV
        const text = await file.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        const credentials = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const credential = {};

            headers.forEach((header, index) => {
                credential[header] = values[index] || null;
            });

            credentials.push(credential);
        }

        progressText.textContent = `Processing ${credentials.length} credentials...`;

        // Send to API
        const response = await fetch(`${API_BASE_URL}/api/credentials/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credentials }),
        });

        const result = await response.json();

        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';

        renderResultSummary(resultsDiv, {
            success: Boolean(result.success),
            heading: result.success ? '✅ Import Successful' : '⚠️ Import Completed with Errors',
            rows: [
                ['Total Records:', result.total],
                ['✅ Imported:', result.imported],
                ['❌ Failed:', result.failed],
            ],
        });
        appendErrorDetails(resultsDiv, result.errors);

        form.reset();
        document.querySelector('.file-text').textContent = 'Choose CSV file or drag here';
        loadStats();

        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressFill.style.width = '0%';
        }, 3000);

    } catch (error) {
        progressContainer.style.display = 'none';
        renderResultSummary(resultsDiv, {
            success: false,
            heading: '❌ Upload Failed',
            rows: [],
            message: displayValue(error?.message, 'Unknown error'),
        });
    }
}

// Load credentials list
async function loadCredentials(page = 1) {
    currentPage = page;
    const searchTerm = document.getElementById('searchInput').value;
    const branchFilter = document.getElementById('branchFilter').value;

    const tableBody = document.getElementById('credentialsTableBody');
    setCredentialsTableMessage(tableBody, 'Loading...');

    try {
        let url = `${API_BASE_URL}/api/credentials?page=${page}&limit=${itemsPerPage}`;
        if (branchFilter) url += `&branch_id=${branchFilter}`;

        const response = await fetch(url);
        const data = await response.json();

        // Filter by search term (client-side)
        let credentials = Array.isArray(data.credentials) ? data.credentials : [];
        if (searchTerm) {
            credentials = credentials.filter(c =>
                c?.ip_address?.includes(searchTerm) ||
                c?.username?.includes(searchTerm)
            );
        }

        if (credentials.length === 0) {
            setCredentialsTableMessage(tableBody, 'No credentials found');
            return;
        }

        const rows = document.createDocumentFragment();
        credentials.forEach(credential => {
            const cred = credential || {};
            const row = createElement('tr');
            const branchCell = createElement('td');
            branchCell.appendChild(createElement('code', { text: `${displayValue(cred.branch_id).slice(0, 8)}...` }));
            const ipCell = createElement('td');
            ipCell.appendChild(cred.ip_address
                ? createElement('span', { text: cred.ip_address })
                : createElement('em', { text: 'Default' }));
            const usernameCell = createElement('td', { text: cred.username });
            const passwordCell = createElement('td', { className: 'password-mask', text: '••••••••' });
            const scopeCell = createElement('td');
            const scopeClass = ['default', 'host-specific'].includes(cred.scope) ? `scope-badge ${cred.scope}` : 'scope-badge';
            scopeCell.appendChild(createElement('span', { className: scopeClass, text: cred.scope }));
            const date = new Date(cred.created_at);
            const dateCell = createElement('td', { text: Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString() });
            const actionsCell = createElement('td');
            const editButton = createElement('button', { className: 'btn btn-primary btn-small', text: '✏️ Edit' });
            editButton.type = 'button';
            editButton.addEventListener('click', () => openEditModal(cred.id, cred.ip_address || '', cred.username));
            const deleteButton = createElement('button', { className: 'btn btn-danger btn-small', text: '🗑️ Delete' });
            deleteButton.type = 'button';
            deleteButton.addEventListener('click', () => deleteCredential(cred.id));
            actionsCell.append(editButton, deleteButton);
            row.append(branchCell, ipCell, usernameCell, passwordCell, scopeCell, dateCell, actionsCell);
            rows.appendChild(row);
        });
        tableBody.replaceChildren(rows);

        renderPagination(data.pagination);

    } catch (error) {
        setCredentialsTableMessage(tableBody, `Error: ${displayValue(error?.message, 'Unknown error')}`);
    }
}

// Render pagination
function renderPagination(pagination = {}) {
    const paginationDiv = document.getElementById('pagination');
    const page = Math.max(1, Number(pagination.page) || 1);
    const totalPages = Math.max(1, Number(pagination.totalPages) || 1);
    const buttons = document.createDocumentFragment();
    const addPageButton = (label, targetPage, active = false) => {
        const button = createElement('button', { className: active ? 'active' : '', text: label });
        button.type = 'button';
        button.addEventListener('click', () => loadCredentials(targetPage));
        buttons.appendChild(button);
    };

    if (page > 1) addPageButton('← Previous', page - 1);
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) addPageButton(i, i, i === page);
    if (page < totalPages) addPageButton('Next →', page + 1);
    paginationDiv.replaceChildren(buttons);
}

// Open edit modal
function openEditModal(id, ipAddress, username) {
    document.getElementById('edit_id').value = id;
    document.getElementById('edit_ip_address').value = ipAddress;
    document.getElementById('edit_username').value = username;
    document.getElementById('edit_password').value = '';

    document.getElementById('editModal').classList.add('show');
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    document.getElementById('editForm').reset();
}

// Update credential
async function updateCredential(form) {
    const formData = new FormData(form);
    const id = formData.get('edit_id');
    const data = {
        ip_address: formData.get('ip_address') || undefined,
        username: formData.get('username'),
        password: formData.get('password'),
    };

    try {
        const response = await fetch(`${API_BASE_URL}/api/credentials/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Credential updated successfully!');
            closeEditModal();
            loadCredentials(currentPage);
        } else {
            throw new Error(result.error || 'Failed to update');
        }
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

// Delete credential
async function deleteCredential(id) {
    if (!confirm('Are you sure you want to delete this credential?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/credentials/${id}`, {
            method: 'DELETE',
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Credential deleted successfully!');
            loadCredentials(currentPage);
            loadStats();
        } else {
            throw new Error(result.error || 'Failed to delete');
        }
    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    }
}

// Show message
function showMessage(elementId, message, type) {
    const msgDiv = document.getElementById(elementId);
    msgDiv.textContent = message;
    msgDiv.className = `message ${type} show`;

    setTimeout(() => {
        msgDiv.classList.remove('show');
    }, 5000);
}

// Download CSV template
function downloadTemplate() {
    const template = `branch_id,edge_agent_id,ip_address,username,password,location_name
00000000-0000-4000-8000-000000000104,6a570d4a-2c71-415f-b59a-643cf50d55c5,,admin,4344@RaM4,Branch-BLR-001-Default
00000000-0000-4000-8000-000000000104,6a570d4a-2c71-415f-b59a-643cf50d55c5,192.168.29.171,admin,4344@RaM4,Camera-BLR-001-CAM-01`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'camera-credentials-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// Search and filter handlers
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('searchInput')?.addEventListener('input', () => {
        loadCredentials(1);
    });

    document.getElementById('branchFilter')?.addEventListener('change', () => {
        loadCredentials(1);
    });
});
