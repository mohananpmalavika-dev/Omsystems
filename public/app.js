// API Base URL - Update this to match your backend
const API_BASE_URL = window.location.origin;

let currentPage = 1;
const itemsPerPage = 50;

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
    resultsDiv.innerHTML = '';

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

        // Show results
        resultsDiv.innerHTML = `
            <div class="result-summary ${result.success ? 'success' : 'error'}">
                <h3>${result.success ? '✅ Import Successful' : '⚠️ Import Completed with Errors'}</h3>
                <div class="result-row">
                    <span>Total Records:</span>
                    <strong>${result.total}</strong>
                </div>
                <div class="result-row">
                    <span>✅ Imported:</span>
                    <strong>${result.imported}</strong>
                </div>
                <div class="result-row">
                    <span>❌ Failed:</span>
                    <strong>${result.failed}</strong>
                </div>
            </div>
        `;

        if (result.errors && result.errors.length > 0) {
            resultsDiv.innerHTML += `
                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; padding: 10px; background: #fed7d7; border-radius: 6px;">
                        View ${result.errors.length} error(s)
                    </summary>
                    <ul style="margin-top: 10px; padding-left: 20px;">
                        ${result.errors.map(e => `<li>Line ${e.index + 2}: ${e.error}</li>`).join('')}
                    </ul>
                </details>
            `;
        }

        form.reset();
        document.querySelector('.file-text').textContent = 'Choose CSV file or drag here';
        loadStats();

        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressFill.style.width = '0%';
        }, 3000);

    } catch (error) {
        progressContainer.style.display = 'none';
        resultsDiv.innerHTML = `
            <div class="result-summary error">
                <h3>❌ Upload Failed</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Load credentials list
async function loadCredentials(page = 1) {
    currentPage = page;
    const searchTerm = document.getElementById('searchInput').value;
    const branchFilter = document.getElementById('branchFilter').value;

    const tableBody = document.getElementById('credentialsTableBody');
    tableBody.innerHTML = '<tr><td colspan="7" class="loading">Loading...</td></tr>';

    try {
        let url = `${API_BASE_URL}/api/credentials?page=${page}&limit=${itemsPerPage}`;
        if (branchFilter) url += `&branch_id=${branchFilter}`;

        const response = await fetch(url);
        const data = await response.json();

        // Filter by search term (client-side)
        let credentials = data.credentials;
        if (searchTerm) {
            credentials = credentials.filter(c =>
                c.ip_address?.includes(searchTerm) ||
                c.username?.includes(searchTerm)
            );
        }

        if (credentials.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="loading">No credentials found</td></tr>';
            return;
        }

        tableBody.innerHTML = credentials.map(cred => `
            <tr>
                <td><code>${cred.branch_id.substring(0, 8)}...</code></td>
                <td>${cred.ip_address || '<em>Default</em>'}</td>
                <td>${cred.username}</td>
                <td class="password-mask">••••••••</td>
                <td><span class="scope-badge ${cred.scope}">${cred.scope}</span></td>
                <td>${new Date(cred.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="openEditModal('${cred.id}', '${cred.ip_address || ''}', '${cred.username}')">
                        ✏️ Edit
                    </button>
                    <button class="btn btn-danger btn-small" onclick="deleteCredential('${cred.id}')">
                        🗑️ Delete
                    </button>
                </td>
            </tr>
        `).join('');

        renderPagination(data.pagination);

    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="7" class="loading">Error: ${error.message}</td></tr>`;
    }
}

// Render pagination
function renderPagination(pagination) {
    const paginationDiv = document.getElementById('pagination');
    const { page, totalPages } = pagination;

    let html = '';

    if (page > 1) {
        html += `<button onclick="loadCredentials(${page - 1})">← Previous</button>`;
    }

    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
        html += `<button class="${i === page ? 'active' : ''}" onclick="loadCredentials(${i})">${i}</button>`;
    }

    if (page < totalPages) {
        html += `<button onclick="loadCredentials(${page + 1})">Next →</button>`;
    }

    paginationDiv.innerHTML = html;
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
