// API Base URL
const API_BASE_URL = window.location.origin;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupForms();
    loadStats();
});

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        if (btn.tagName === 'A') return; // Skip navigation links

        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            tabBtns.forEach(b => {
                if (b.tagName !== 'A') b.classList.remove('active');
            });
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

// Setup forms
function setupForms() {
    document.getElementById('branchesForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await uploadBranches();
    });

    document.getElementById('employeesForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await uploadEmployees();
    });

    // File input changes
    document.getElementById('branchesFile').addEventListener('change', (e) => {
        const fileName = e.target.files[0]?.name || 'Choose branches CSV or drag here';
        document.querySelector('#branchesFile + label .file-text').textContent = fileName;
    });

    document.getElementById('employeesFile').addEventListener('change', (e) => {
        const fileName = e.target.files[0]?.name || 'Choose employees CSV or drag here';
        document.querySelector('#employeesFile + label .file-text').textContent = fileName;
    });
}

// Load statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/bulk/stats`);
        const stats = await response.json();

        document.getElementById('totalBranches').textContent = stats.branches || 0;
        document.getElementById('totalEmployees').textContent = stats.employees || 0;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Parse CSV file
async function parseCSV(file) {
    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue; // Skip empty lines

        const values = lines[i].split(',').map(v => v.trim());
        const row = {};

        headers.forEach((header, index) => {
            const value = values[index];
            // Convert empty strings to undefined
            row[header] = value === '' || value === undefined ? undefined : value;
            
            // Convert numbers
            if (header === 'latitude' || header === 'longitude') {
                row[header] = value ? parseFloat(value) : undefined;
            }
        });

        data.push(row);
    }

    return data;
}

// Validate branches
async function validateBranches() {
    const fileInput = document.getElementById('branchesFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file');
        return;
    }

    const resultsDiv = document.getElementById('branchResults');
    resultsDiv.innerHTML = '<p>Validating...</p>';

    try {
        const branches = await parseCSV(file);

        const response = await fetch(`${API_BASE_URL}/api/bulk/branches/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branches }),
        });

        const result = await response.json();

        resultsDiv.innerHTML = `
            <div class="result-summary ${result.ready ? 'success' : 'error'}">
                <h3>${result.ready ? '✅ CSV is Valid' : '⚠️ Validation Errors'}</h3>
                <div class="result-row">
                    <span>Total Rows:</span>
                    <strong>${result.total}</strong>
                </div>
                <div class="result-row">
                    <span>✅ Valid:</span>
                    <strong>${result.valid}</strong>
                </div>
                <div class="result-row">
                    <span>❌ Invalid:</span>
                    <strong>${result.invalid}</strong>
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
                        ${result.errors.map(e => `
                            <li><strong>Row ${e.index + 2}</strong> (${e.name}): 
                                <ul>${e.errors.map(err => `<li>${err}</li>`).join('')}</ul>
                            </li>
                        `).join('')}
                    </ul>
                </details>
            `;
        }
    } catch (error) {
        resultsDiv.innerHTML = `
            <div class="result-summary error">
                <h3>❌ Validation Failed</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Upload branches
async function uploadBranches() {
    const fileInput = document.getElementById('branchesFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file');
        return;
    }

    const progressContainer = document.getElementById('branchProgress');
    const progressFill = document.getElementById('branchProgressFill');
    const progressText = document.getElementById('branchProgressText');
    const resultsDiv = document.getElementById('branchResults');

    progressContainer.style.display = 'block';
    resultsDiv.innerHTML = '';
    progressFill.style.width = '0%';

    try {
        const branches = await parseCSV(file);
        progressText.textContent = `Processing ${branches.length} branches...`;
        progressFill.style.width = '50%';

        const response = await fetch(`${API_BASE_URL}/api/bulk/branches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branches }),
        });

        const result = await response.json();

        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';

        resultsDiv.innerHTML = `
            <div class="result-summary ${result.success ? 'success' : 'error'}">
                <h3>${result.success ? '✅ Import Successful' : '⚠️ Import Completed with Errors'}</h3>
                <div class="result-row">
                    <span>Total:</span>
                    <strong>${result.total}</strong>
                </div>
                <div class="result-row">
                    <span>✅ Created:</span>
                    <strong>${result.created}</strong>
                </div>
                <div class="result-row">
                    <span>❌ Failed:</span>
                    <strong>${result.failed}</strong>
                </div>
            </div>
        `;

        if (result.created_branches && result.created_branches.length > 0) {
            resultsDiv.innerHTML += `
                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; padding: 10px; background: #c6f6d5; border-radius: 6px;">
                        View ${result.created_branches.length} created branch(es)
                    </summary>
                    <table class="credentials-table" style="margin-top: 10px;">
                        <thead>
                            <tr>
                                <th>Row</th>
                                <th>Branch ID</th>
                                <th>Name</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${result.created_branches.map(b => `
                                <tr>
                                    <td>${b.index + 2}</td>
                                    <td><code>${b.id}</code></td>
                                    <td>${b.name}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </details>
            `;
        }

        if (result.errors && result.errors.length > 0) {
            resultsDiv.innerHTML += `
                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; padding: 10px; background: #fed7d7; border-radius: 6px;">
                        View ${result.errors.length} error(s)
                    </summary>
                    <ul style="margin-top: 10px; padding-left: 20px;">
                        ${result.errors.map(e => `
                            <li><strong>Row ${e.index + 2}</strong> (${e.name}): ${e.error}</li>
                        `).join('')}
                    </ul>
                </details>
            `;
        }

        loadStats();

        setTimeout(() => {
            progressContainer.style.display = 'none';
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

// Validate employees
async function validateEmployees() {
    const fileInput = document.getElementById('employeesFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file');
        return;
    }

    const resultsDiv = document.getElementById('employeeResults');
    resultsDiv.innerHTML = '<p>Validating...</p>';

    try {
        const employees = await parseCSV(file);

        const response = await fetch(`${API_BASE_URL}/api/bulk/employees/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employees }),
        });

        const result = await response.json();

        resultsDiv.innerHTML = `
            <div class="result-summary ${result.ready ? 'success' : 'error'}">
                <h3>${result.ready ? '✅ CSV is Valid' : '⚠️ Validation Errors'}</h3>
                <div class="result-row">
                    <span>Total Rows:</span>
                    <strong>${result.total}</strong>
                </div>
                <div class="result-row">
                    <span>✅ Valid:</span>
                    <strong>${result.valid}</strong>
                </div>
                <div class="result-row">
                    <span>❌ Invalid:</span>
                    <strong>${result.invalid}</strong>
                </div>
            </div>
        `;

        if (result.duplicates && result.duplicates.length > 0) {
            resultsDiv.innerHTML += `
                <div class="result-summary error" style="margin-top: 15px;">
                    <h4>⚠️ Duplicate Emails Found</h4>
                    <ul style="padding-left: 20px;">
                        ${result.duplicates.map(d => `
                            <li>Row ${d.index + 2}: ${d.email}</li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        if (result.errors && result.errors.length > 0) {
            resultsDiv.innerHTML += `
                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; padding: 10px; background: #fed7d7; border-radius: 6px;">
                        View ${result.errors.length} error(s)
                    </summary>
                    <ul style="margin-top: 10px; padding-left: 20px;">
                        ${result.errors.map(e => `
                            <li><strong>Row ${e.index + 2}</strong> (${e.email}): 
                                <ul>${e.errors.map(err => `<li>${err}</li>`).join('')}</ul>
                            </li>
                        `).join('')}
                    </ul>
                </details>
            `;
        }
    } catch (error) {
        resultsDiv.innerHTML = `
            <div class="result-summary error">
                <h3>❌ Validation Failed</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// Upload employees
async function uploadEmployees() {
    const fileInput = document.getElementById('employeesFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a CSV file');
        return;
    }

    const progressContainer = document.getElementById('employeeProgress');
    const progressFill = document.getElementById('employeeProgressFill');
    const progressText = document.getElementById('employeeProgressText');
    const resultsDiv = document.getElementById('employeeResults');

    progressContainer.style.display = 'block';
    resultsDiv.innerHTML = '';
    progressFill.style.width = '0%';

    try {
        const employees = await parseCSV(file);
        progressText.textContent = `Processing ${employees.length} employees...`;
        progressFill.style.width = '50%';

        const response = await fetch(`${API_BASE_URL}/api/bulk/employees`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employees }),
        });

        const result = await response.json();

        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';

        resultsDiv.innerHTML = `
            <div class="result-summary ${result.success ? 'success' : 'error'}">
                <h3>${result.success ? '✅ Import Successful' : '⚠️ Import Completed with Errors'}</h3>
                <div class="result-row">
                    <span>Total:</span>
                    <strong>${result.total}</strong>
                </div>
                <div class="result-row">
                    <span>✅ Created:</span>
                    <strong>${result.created}</strong>
                </div>
                <div class="result-row">
                    <span>❌ Failed:</span>
                    <strong>${result.failed}</strong>
                </div>
                ${result.note ? `<p style="margin-top: 10px; color: #d69e2e; font-weight: 600;">⚠️ ${result.note}</p>` : ''}
            </div>
        `;

        if (result.created_employees && result.created_employees.length > 0) {
            resultsDiv.innerHTML += `
                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; padding: 10px; background: #c6f6d5; border-radius: 6px;">
                        View ${result.created_employees.length} created employee(s) & temporary passwords
                    </summary>
                    <div style="margin-top: 10px; padding: 15px; background: #fff3cd; border-radius: 6px;">
                        <p style="color: #856404; margin-bottom: 10px;">
                            <strong>⚠️ Important:</strong> Save these temporary passwords! They won't be shown again.
                        </p>
                        <button class="btn btn-secondary btn-small" onclick="downloadPasswords(${JSON.stringify(result.created_employees).replace(/"/g, '&quot;')})">
                            💾 Download Passwords
                        </button>
                    </div>
                    <table class="credentials-table" style="margin-top: 10px;">
                        <thead>
                            <tr>
                                <th>Row</th>
                                <th>Email</th>
                                <th>Temporary Password</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${result.created_employees.map(e => `
                                <tr>
                                    <td>${e.index + 2}</td>
                                    <td>${e.email}</td>
                                    <td><code>${e.temp_password}</code></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </details>
            `;
        }

        if (result.errors && result.errors.length > 0) {
            resultsDiv.innerHTML += `
                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; padding: 10px; background: #fed7d7; border-radius: 6px;">
                        View ${result.errors.length} error(s)
                    </summary>
                    <ul style="margin-top: 10px; padding-left: 20px;">
                        ${result.errors.map(e => `
                            <li><strong>Row ${e.index + 2}</strong> (${e.email}): ${e.error}</li>
                        `).join('')}
                    </ul>
                </details>
            `;
        }

        loadStats();

        setTimeout(() => {
            progressContainer.style.display = 'none';
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

// Download branch template
function downloadBranchTemplate() {
    const template = `name,parent_id,branch_type,address,city,state,country,postal_code,phone,email,manager_name,latitude,longitude
Head Office,,headquarters,123 Main St,Mumbai,Maharashtra,India,400001,+91-22-12345678,hq@example.com,John Doe,19.0760,72.8777
Mumbai Branch,<parent-branch-id>,branch,456 Andheri,Mumbai,Maharashtra,India,400058,+91-22-23456789,mumbai@example.com,Jane Smith,19.1136,72.8697
Delhi Zone,<parent-branch-id>,zone,789 Connaught Place,New Delhi,Delhi,India,110001,+91-11-34567890,delhi@example.com,Bob Wilson,28.6139,77.2090`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'branches-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// Download employee template
function downloadEmployeeTemplate() {
    const template = `email,full_name,role,branch_id,phone,employee_id,department,designation
john.doe@example.com,John Doe,admin,<branch-uuid>,+91-9876543210,EMP001,IT,System Administrator
jane.smith@example.com,Jane Smith,operator,<branch-uuid>,+91-9876543211,EMP002,Operations,Operator
bob.wilson@example.com,Bob Wilson,viewer,<branch-uuid>,+91-9876543212,EMP003,Security,Security Officer`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// Download temporary passwords
function downloadPasswords(employees) {
    const csv = `Email,Temporary Password\n${employees.map(e => `${e.email},${e.temp_password}`).join('\n')}`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee-passwords-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}
