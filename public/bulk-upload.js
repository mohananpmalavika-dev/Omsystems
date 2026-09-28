// API Base URL
const API_BASE_URL = window.location.origin;

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

function appendResultSummary(container, { success, heading, rows, note }) {
    const summary = createElement('div', { className: `result-summary ${success ? 'success' : 'error'}` });
    summary.appendChild(createElement('h3', { text: heading }));
    rows.forEach(([label, value]) => addResultRow(summary, label, value));
    if (note) {
        const noteElement = createElement('p', { text: `⚠️ ${note}` });
        noteElement.style.cssText = 'margin-top: 10px; color: #d69e2e; font-weight: 600;';
        summary.appendChild(noteElement);
    }
    container.appendChild(summary);
}

function renderResultSummary(container, summary) {
    container.replaceChildren();
    appendResultSummary(container, summary);
}

function appendDetails(container, text, background) {
    const details = createElement('details');
    details.style.marginTop = '15px';
    const summary = createElement('summary', { text });
    summary.style.cssText = `cursor: pointer; padding: 10px; background: ${background}; border-radius: 6px;`;
    const content = createElement('div');
    details.append(summary, content);
    container.appendChild(details);
    return content;
}

function rowNumber(value) {
    const index = Number(value);
    return Number.isFinite(index) ? index + 2 : 'unknown';
}

function appendErrorDetails(container, errors, identityField) {
    if (!Array.isArray(errors) || errors.length === 0) return;
    const content = appendDetails(container, `View ${errors.length} error(s)`, '#fed7d7');
    const list = createElement('ul');
    list.style.cssText = 'margin-top: 10px; padding-left: 20px;';
    errors.forEach(error => {
        const item = createElement('li');
        const identity = displayValue(error?.[identityField]);
        item.appendChild(createElement('strong', { text: `Row ${rowNumber(error?.index)}` }));
        item.appendChild(document.createTextNode(identity ? ` (${identity}): ` : ': '));
        const nestedErrors = Array.isArray(error?.errors) ? error.errors : null;
        if (nestedErrors) {
            const nestedList = createElement('ul');
            nestedErrors.forEach(message => nestedList.appendChild(createElement('li', { text: message })));
            item.appendChild(nestedList);
        } else {
            item.appendChild(document.createTextNode(displayValue(error?.error, 'Unknown error')));
        }
        list.appendChild(item);
    });
    content.appendChild(list);
}

function renderFailure(container, heading, error) {
    renderResultSummary(container, {
        success: false,
        heading,
        rows: [],
        note: displayValue(error?.message, 'Unknown error'),
    });
}

document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupForms();
    loadStats();
});

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        if (btn.tagName === 'A') return;
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            tabBtns.forEach(button => {
                if (button.tagName !== 'A') button.classList.remove('active');
            });
            tabContents.forEach(content => content.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
}

function setupForms() {
    document.getElementById('branchesForm').addEventListener('submit', async event => {
        event.preventDefault();
        await uploadBranches();
    });
    document.getElementById('employeesForm').addEventListener('submit', async event => {
        event.preventDefault();
        await uploadEmployees();
    });
    document.getElementById('branchesFile').addEventListener('change', event => {
        document.querySelector('#branchesFile + label .file-text').textContent = event.target.files[0]?.name || 'Choose branches CSV or drag here';
    });
    document.getElementById('employeesFile').addEventListener('change', event => {
        document.querySelector('#employeesFile + label .file-text').textContent = event.target.files[0]?.name || 'Choose employees CSV or drag here';
    });
}

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

async function parseCSV(file) {
    const text = await file.text();
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.trim());
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(value => value.trim());
        const row = {};
        headers.forEach((header, index) => {
            const value = values[index];
            row[header] = value === '' || value === undefined ? undefined : value;
            if (header === 'latitude' || header === 'longitude') row[header] = value ? parseFloat(value) : undefined;
        });
        data.push(row);
    }
    return data;
}

async function validateBranches() {
    const file = document.getElementById('branchesFile').files[0];
    if (!file) return alert('Please select a CSV file');
    const resultsDiv = document.getElementById('branchResults');
    resultsDiv.replaceChildren(createElement('p', { text: 'Validating...' }));
    try {
        const branches = await parseCSV(file);
        const response = await fetch(`${API_BASE_URL}/api/bulk/branches/validate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branches }),
        });
        const result = await response.json();
        renderResultSummary(resultsDiv, {
            success: Boolean(result.ready), heading: result.ready ? '✅ CSV is Valid' : '⚠️ Validation Errors',
            rows: [['Total Rows:', result.total], ['✅ Valid:', result.valid], ['❌ Invalid:', result.invalid]],
        });
        appendErrorDetails(resultsDiv, result.errors, 'name');
    } catch (error) {
        renderFailure(resultsDiv, '❌ Validation Failed', error);
    }
}

function appendCreatedBranches(container, branches) {
    if (!Array.isArray(branches) || branches.length === 0) return;
    const content = appendDetails(container, `View ${branches.length} created branch(es)`, '#c6f6d5');
    const table = createElement('table', { className: 'credentials-table' });
    table.style.marginTop = '10px';
    const thead = createElement('thead');
    const headerRow = createElement('tr');
    ['Row', 'Branch ID', 'Name'].forEach(label => headerRow.appendChild(createElement('th', { text: label })));
    thead.appendChild(headerRow);
    const tbody = createElement('tbody');
    branches.forEach(branch => {
        const row = createElement('tr');
        const idCell = createElement('td');
        idCell.appendChild(createElement('code', { text: branch?.id }));
        row.append(createElement('td', { text: rowNumber(branch?.index) }), idCell, createElement('td', { text: branch?.name }));
        tbody.appendChild(row);
    });
    table.append(thead, tbody);
    content.appendChild(table);
}

async function uploadBranches() {
    const file = document.getElementById('branchesFile').files[0];
    if (!file) return alert('Please select a CSV file');
    const progressContainer = document.getElementById('branchProgress');
    const progressFill = document.getElementById('branchProgressFill');
    const progressText = document.getElementById('branchProgressText');
    const resultsDiv = document.getElementById('branchResults');
    progressContainer.style.display = 'block';
    resultsDiv.replaceChildren();
    progressFill.style.width = '0%';
    try {
        const branches = await parseCSV(file);
        progressText.textContent = `Processing ${branches.length} branches...`;
        progressFill.style.width = '50%';
        const response = await fetch(`${API_BASE_URL}/api/bulk/branches`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branches }),
        });
        const result = await response.json();
        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';
        renderResultSummary(resultsDiv, {
            success: Boolean(result.success), heading: result.success ? '✅ Import Successful' : '⚠️ Import Completed with Errors',
            rows: [['Total:', result.total], ['✅ Created:', result.created], ['❌ Failed:', result.failed]],
        });
        appendCreatedBranches(resultsDiv, result.created_branches);
        appendErrorDetails(resultsDiv, result.errors, 'name');
        loadStats();
        setTimeout(() => { progressContainer.style.display = 'none'; }, 3000);
    } catch (error) {
        progressContainer.style.display = 'none';
        renderFailure(resultsDiv, '❌ Upload Failed', error);
    }
}

async function validateEmployees() {
    const file = document.getElementById('employeesFile').files[0];
    if (!file) return alert('Please select a CSV file');
    const resultsDiv = document.getElementById('employeeResults');
    resultsDiv.replaceChildren(createElement('p', { text: 'Validating...' }));
    try {
        const employees = await parseCSV(file);
        const response = await fetch(`${API_BASE_URL}/api/bulk/employees/validate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employees }),
        });
        const result = await response.json();
        renderResultSummary(resultsDiv, {
            success: Boolean(result.ready), heading: result.ready ? '✅ CSV is Valid' : '⚠️ Validation Errors',
            rows: [['Total Rows:', result.total], ['✅ Valid:', result.valid], ['❌ Invalid:', result.invalid]],
        });
        if (Array.isArray(result.duplicates) && result.duplicates.length > 0) {
            const duplicateSummary = createElement('div', { className: 'result-summary error' });
            duplicateSummary.style.marginTop = '15px';
            duplicateSummary.appendChild(createElement('h4', { text: '⚠️ Duplicate Emails Found' }));
            const list = createElement('ul');
            list.style.paddingLeft = '20px';
            result.duplicates.forEach(duplicate => list.appendChild(createElement('li', {
                text: `Row ${rowNumber(duplicate?.index)}: ${displayValue(duplicate?.email)}`,
            })));
            duplicateSummary.appendChild(list);
            resultsDiv.appendChild(duplicateSummary);
        }
        appendErrorDetails(resultsDiv, result.errors, 'email');
    } catch (error) {
        renderFailure(resultsDiv, '❌ Validation Failed', error);
    }
}

function appendCreatedEmployees(container, employees) {
    if (!Array.isArray(employees) || employees.length === 0) return;
    const content = appendDetails(container, `View ${employees.length} created employee(s) & temporary passwords`, '#c6f6d5');
    const warning = createElement('div');
    warning.style.cssText = 'margin-top: 10px; padding: 15px; background: #fff3cd; border-radius: 6px;';
    const warningText = createElement('p', { text: '⚠️ Important: Save these temporary passwords! They won\'t be shown again.' });
    warningText.style.cssText = 'color: #856404; margin-bottom: 10px;';
    const downloadButton = createElement('button', { className: 'btn btn-secondary btn-small', text: '💾 Download Passwords' });
    downloadButton.type = 'button';
    downloadButton.addEventListener('click', () => downloadPasswords(employees));
    warning.append(warningText, downloadButton);
    const table = createElement('table', { className: 'credentials-table' });
    table.style.marginTop = '10px';
    const thead = createElement('thead');
    const headerRow = createElement('tr');
    ['Row', 'Email', 'Temporary Password'].forEach(label => headerRow.appendChild(createElement('th', { text: label })));
    thead.appendChild(headerRow);
    const tbody = createElement('tbody');
    employees.forEach(employee => {
        const row = createElement('tr');
        const passwordCell = createElement('td');
        passwordCell.appendChild(createElement('code', { text: employee?.temp_password }));
        row.append(createElement('td', { text: rowNumber(employee?.index) }), createElement('td', { text: employee?.email }), passwordCell);
        tbody.appendChild(row);
    });
    table.append(thead, tbody);
    content.append(warning, table);
}

async function uploadEmployees() {
    const file = document.getElementById('employeesFile').files[0];
    if (!file) return alert('Please select a CSV file');
    const progressContainer = document.getElementById('employeeProgress');
    const progressFill = document.getElementById('employeeProgressFill');
    const progressText = document.getElementById('employeeProgressText');
    const resultsDiv = document.getElementById('employeeResults');
    progressContainer.style.display = 'block';
    resultsDiv.replaceChildren();
    progressFill.style.width = '0%';
    try {
        const employees = await parseCSV(file);
        progressText.textContent = `Processing ${employees.length} employees...`;
        progressFill.style.width = '50%';
        const response = await fetch(`${API_BASE_URL}/api/bulk/employees`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employees }),
        });
        const result = await response.json();
        progressFill.style.width = '100%';
        progressText.textContent = 'Complete!';
        renderResultSummary(resultsDiv, {
            success: Boolean(result.success), heading: result.success ? '✅ Import Successful' : '⚠️ Import Completed with Errors',
            rows: [['Total:', result.total], ['✅ Created:', result.created], ['❌ Failed:', result.failed]], note: result.note,
        });
        appendCreatedEmployees(resultsDiv, result.created_employees);
        appendErrorDetails(resultsDiv, result.errors, 'email');
        loadStats();
        setTimeout(() => { progressContainer.style.display = 'none'; }, 3000);
    } catch (error) {
        progressContainer.style.display = 'none';
        renderFailure(resultsDiv, '❌ Upload Failed', error);
    }
}

function downloadBranchTemplate() {
    const template = `name,parent_id,branch_type,address,city,state,country,postal_code,phone,email,manager_name,latitude,longitude
Head Office,,headquarters,123 Main St,Mumbai,Maharashtra,India,400001,+91-22-12345678,hq@example.com,John Doe,19.0760,72.8777
Mumbai Branch,<parent-branch-id>,branch,456 Andheri,Mumbai,Maharashtra,India,400058,+91-22-23456789,mumbai@example.com,Jane Smith,19.1136,72.8697
Delhi Zone,<parent-branch-id>,zone,789 Connaught Place,New Delhi,Delhi,India,110001,+91-22-23456789,delhi@example.com,Bob Wilson,28.6139,77.2090`;
    downloadCsv(template, 'branches-template.csv');
}

function downloadEmployeeTemplate() {
    const template = `email,full_name,role,branch_id,phone,employee_id,department,designation
john.doe@example.com,John Doe,admin,<branch-uuid>,+91-9876543210,EMP001,IT,System Administrator
jane.smith@example.com,Jane Smith,operator,<branch-uuid>,+91-9876543211,EMP002,Operations,Operator
bob.wilson@example.com,Bob Wilson,viewer,<branch-uuid>,+91-9876543212,EMP003,Security,Security Officer`;
    downloadCsv(template, 'employees-template.csv');
}

function downloadPasswords(employees) {
    const csv = `Email,Temporary Password\n${employees.map(employee => `${displayValue(employee?.email)},${displayValue(employee?.temp_password)}`).join('\n')}`;
    downloadCsv(csv, `employee-passwords-${new Date().toISOString().split('T')[0]}.csv`);
}

function downloadCsv(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
}
