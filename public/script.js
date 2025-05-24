// script.js - Main Application JavaScript

// ==================== GLOBAL VARIABLES ====================
let allEmployees = [];
let allLeaves = [];
let currentEmployee = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    loadDashboardData();
    loadEmployees();
    loadLeaves();
    setDefaultDates();

    // Show dashboard by default
    showTab('dashboard');
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = e.target.getAttribute('data-tab');
            showTab(tabName);
        });
    });

    // Logout functionality
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Employee form
    document.getElementById('employee-form').addEventListener('submit', handleEmployeeSubmit);
    document.getElementById('refresh-employees').addEventListener('click', loadEmployees);

    // Leave form
    document.getElementById('leave-form').addEventListener('submit', handleLeaveSubmit);
    document.getElementById('refresh-leaves').addEventListener('click', loadLeaves);

    // Import functionality
    document.getElementById('download-template').addEventListener('click', downloadTemplate);
    document.getElementById('browse-file').addEventListener('click', () => {
        document.getElementById('excel-file').click();
    });
    document.getElementById('excel-file').addEventListener('change', handleFileSelect);
    document.getElementById('import-form').addEventListener('submit', handleImportSubmit);
    document.getElementById('remove-file').addEventListener('click', removeSelectedFile);

    // File drag and drop
    const fileUploadArea = document.getElementById('file-upload-area');
    fileUploadArea.addEventListener('dragover', handleDragOver);
    fileUploadArea.addEventListener('dragleave', handleDragLeave);
    fileUploadArea.addEventListener('drop', handleFileDrop);
    fileUploadArea.addEventListener('click', () => {
        document.getElementById('excel-file').click();
    });
}

// ==================== TAB NAVIGATION ====================
function showTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });

    // Show selected tab content
    const targetTab = document.getElementById(`${tabName}-tab`);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // Add active class to selected tab button
    const targetButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }

    // Load data based on tab
    switch (tabName) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'employees':
            loadEmployees();
            break;
        case 'leaves':
            loadLeaves();
            populateEmployeeDropdown();
            break;
        case 'import':
            // Import tab doesn't need initial data loading
            break;
    }
}

// ==================== AUTHENTICATION ====================
async function logout() {
    try {
        showAlert('Logging out...', 'info');

        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (response.ok) {
            window.location.href = '/login';
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect even if logout request fails
        window.location.href = '/login';
    }
}

// ==================== DASHBOARD FUNCTIONS ====================
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) throw new Error('Failed to load dashboard data');

        const stats = await response.json();
        updateDashboardStats(stats);
        updateDepartmentChart(stats.departments || []);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showAlert('Error loading dashboard data', 'error');
    }
}

function updateDashboardStats(stats) {
    document.getElementById('total-employees').textContent = stats.totalEmployees || 0;
    document.getElementById('total-leaves-year').textContent = stats.totalLeavesThisYear || 0;
    document.getElementById('total-days-year').textContent = stats.totalDaysThisYear || 0;
    document.getElementById('total-departments').textContent = stats.departments ? stats.departments.length : 0;
}

function updateDepartmentChart(departments) {
    const chartContainer = document.getElementById('department-chart');

    if (departments.length === 0) {
        chartContainer.innerHTML = '<p class="text-center text-gray-500">No department data available</p>';
        return;
    }

    const maxEmployees = Math.max(...departments.map(d => d.employee_count));

    chartContainer.innerHTML = departments.map(dept => `
        <div class="department-bar" style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <span style="font-weight: 500; color: var(--gray-700);">${dept.department}</span>
                <span style="font-size: 0.875rem; color: var(--gray-600);">${dept.employee_count} employees</span>
            </div>
            <div style="background: var(--gray-200); border-radius: 0.5rem; height: 8px; overflow: hidden;">
                <div style="background: var(--primary-color); height: 100%; width: ${(dept.employee_count / maxEmployees) * 100}%; transition: width 0.3s ease;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 0.25rem; font-size: 0.75rem; color: var(--gray-500);">
                <span>Available: ${dept.available_leaves}</span>
                <span>Total: ${dept.total_leaves}</span>
            </div>
        </div>
    `).join('');
}

// ==================== EMPLOYEE FUNCTIONS ====================
async function loadEmployees() {
    try {
        showLoading('employees-table');
        const response = await fetch('/api/employees');
        if (!response.ok) throw new Error('Failed to load employees');

        allEmployees = await response.json();
        displayEmployees();
        populateEmployeeDropdown();
    } catch (error) {
        console.error('Error loading employees:', error);
        showAlert('Error loading employees', 'error');
    } finally {
        hideLoading('employees-table');
    }
}

function displayEmployees() {
    const tbody = document.querySelector('#employees-table tbody');

    if (allEmployees.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-gray-500" style="padding: 2rem;">
                    No employees found. Add some employees to get started.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allEmployees.map(employee => `
        <tr>
            <td>${employee.id}</td>
            <td>
                <div style="font-weight: 500;">${employee.name}</div>
            </td>
            <td>
                <span class="status-badge" style="background: var(--gray-100); color: var(--gray-700);">
                    ${employee.department || 'Not Specified'}
                </span>
            </td>
            <td>${employee.total_leaves}</td>
            <td>
                <span class="font-bold ${getAvailableLeaveColor(employee.available_leaves)}">
                    ${employee.available_leaves}
                </span>
            </td>
            <td>${employee.used_leaves}</td>
            <td>${employee.total_leave_requests || 0}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                            onclick="viewEmployeeProfile(${employee.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                            onclick="deleteEmployee(${employee.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getAvailableLeaveColor(available) {
    if (available <= 3) return 'text-danger';
    if (available <= 7) return 'text-warning';
    return 'text-success';
}

async function handleEmployeeSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('employee-name').value.trim(),
        department: document.getElementById('employee-department').value.trim(),
        totalLeaves: parseInt(document.getElementById('total-leaves').value)
    };

    if (!formData.name || !formData.totalLeaves) {
        showAlert('Please fill in all required fields', 'error');
        return;
    }

    try {
        const response = await fetch('/api/employees', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add employee');
        }

        showAlert('Employee added successfully!', 'success');
        document.getElementById('employee-form').reset();
        loadEmployees();
        loadDashboardData();
    } catch (error) {
        console.error('Error adding employee:', error);
        showAlert(error.message, 'error');
    }
}

async function deleteEmployee(employeeId) {
    if (!confirm('Are you sure you want to delete this employee? This will also delete all their leave records.')) {
        return;
    }

    try {
        const response = await fetch(`/api/employees/${employeeId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete employee');
        }

        showAlert('Employee deleted successfully', 'success');
        loadEmployees();
        loadLeaves();
        loadDashboardData();
    } catch (error) {
        console.error('Error deleting employee:', error);
        showAlert(error.message, 'error');
    }
}

async function viewEmployeeProfile(employeeId) {
    try {
        const response = await fetch(`/api/employees/${employeeId}`);
        if (!response.ok) throw new Error('Failed to load employee profile');

        const employee = await response.json();
        showEmployeeModal(employee);
    } catch (error) {
        console.error('Error loading employee profile:', error);
        showAlert('Error loading employee profile', 'error');
    }
}

function showEmployeeModal(employee) {
    currentEmployee = employee;

    // Update modal content
    document.getElementById('modal-employee-name').textContent = employee.name;
    document.getElementById('modal-employee-dept').textContent = employee.department || 'Not Specified';
    document.getElementById('modal-employee-total').textContent = employee.total_leaves;
    document.getElementById('modal-employee-available').textContent = employee.available_leaves;
    document.getElementById('modal-employee-used').textContent = employee.used_leaves;

    // Display leave history
    const tbody = document.querySelector('#modal-leaves-table tbody');
    if (employee.leaves && employee.leaves.length > 0) {
        tbody.innerHTML = employee.leaves.map(leave => `
            <tr>
                <td>${leave.start_date}</td>
                <td>${leave.end_date}</td>
                <td><strong>${leave.days}</strong></td>
                <td>${leave.reason}</td>
                <td>
                    <span class="status-badge status-${leave.status || 'approved'}">
                        ${leave.status || 'approved'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" 
                            onclick="deleteLeaveFromModal(${leave.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-gray-500" style="padding: 1rem;">
                    No leave history found
                </td>
            </tr>
        `;
    }

    // Show modal
    document.getElementById('employee-modal').classList.add('active');
    document.getElementById('modal-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEmployeeModal() {
    document.getElementById('employee-modal').classList.remove('active');
    document.getElementById('modal-overlay').classList.remove('active');
    document.body.style.overflow = 'auto';
    currentEmployee = null;
}

async function deleteLeaveFromModal(leaveId) {
    if (!confirm('Are you sure you want to delete this leave?')) return;

    try {
        const response = await fetch(`/api/leaves/${leaveId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete leave');
        }

        showAlert('Leave deleted successfully', 'success');

        // Refresh modal data
        if (currentEmployee) {
            viewEmployeeProfile(currentEmployee.id);
        }

        // Refresh other data
        loadEmployees();
        loadLeaves();
        loadDashboardData();
    } catch (error) {
        console.error('Error deleting leave:', error);
        showAlert(error.message, 'error');
    }
}

// ==================== LEAVE FUNCTIONS ====================
async function loadLeaves() {
    try {
        showLoading('leaves-table');
        const response = await fetch('/api/leaves');
        if (!response.ok) throw new Error('Failed to load leaves');

        allLeaves = await response.json();
        displayLeaves();
    } catch (error) {
        console.error('Error loading leaves:', error);
        showAlert('Error loading leaves', 'error');
    } finally {
        hideLoading('leaves-table');
    }
}

function displayLeaves() {
    const tbody = document.querySelector('#leaves-table tbody');

    if (allLeaves.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-gray-500" style="padding: 2rem;">
                    No leave records found. Add some leaves to get started.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = allLeaves.map(leave => `
        <tr>
            <td>${leave.id}</td>
            <td>
                <div style="font-weight: 500;">${leave.employee_name}</div>
            </td>
            <td>
                <span class="status-badge" style="background: var(--gray-100); color: var(--gray-700);">
                    ${leave.employee_department || 'Not Specified'}
                </span>
            </td>
            <td>${leave.start_date}</td>
            <td>${leave.end_date}</td>
            <td><strong>${leave.days}</strong></td>
            <td>${leave.reason}</td>
            <td>
                <span class="status-badge status-${leave.status || 'approved'}">
                    ${leave.status || 'approved'}
                </span>
            </td>
            <td>
                <button class="btn btn-danger" onclick="deleteLeave(${leave.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function populateEmployeeDropdown() {
    const select = document.getElementById('leave-employee');
    select.innerHTML = '<option value="">Choose an employee</option>';

    if (allEmployees.length === 0) {
        select.innerHTML += '<option value="" disabled>No employees available</option>';
        return;
    }

    allEmployees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = `${employee.name} (${employee.available_leaves} days available)`;
        if (employee.available_leaves <= 0) {
            option.disabled = true;
            option.textContent += ' - No leave balance';
        }
        select.appendChild(option);
    });
}

async function handleLeaveSubmit(e) {
    e.preventDefault();

    const formData = {
        employeeId: document.getElementById('leave-employee').value,
        startDate: document.getElementById('start-date').value,
        endDate: document.getElementById('end-date').value,
        reason: document.getElementById('leave-reason').value
    };

    if (!formData.employeeId || !formData.startDate || !formData.endDate || !formData.reason) {
        showAlert('Please fill in all fields', 'error');
        return;
    }

    // Validate dates
    const startDate = new Date(formData.startDate);
    const endDate = new Date(formData.endDate);

    if (startDate > endDate) {
        showAlert('Start date cannot be after end date', 'error');
        return;
    }

    if (startDate < new Date().setHours(0, 0, 0, 0)) {
        showAlert('Start date cannot be in the past', 'error');
        return;
    }

    try {
        const response = await fetch('/api/leaves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to add leave');
        }

        showAlert('Leave request added successfully!', 'success');
        document.getElementById('leave-form').reset();
        loadLeaves();
        loadEmployees();
        populateEmployeeDropdown();
        loadDashboardData();
    } catch (error) {
        console.error('Error adding leave:', error);
        showAlert(error.message, 'error');
    }
}

async function deleteLeave(leaveId) {
    if (!confirm('Are you sure you want to delete this leave? The leave balance will be restored.')) {
        return;
    }

    try {
        const response = await fetch(`/api/leaves/${leaveId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete leave');
        }

        showAlert('Leave deleted successfully and balance restored', 'success');
        loadLeaves();
        loadEmployees();
        populateEmployeeDropdown();
        loadDashboardData();
    } catch (error) {
        console.error('Error deleting leave:', error);
        showAlert(error.message, 'error');
    }
}

// ==================== IMPORT FUNCTIONS ====================
async function downloadTemplate() {
    try {
        showAlert('Downloading template...', 'info');

        const response = await fetch('/api/download-template');
        if (!response.ok) throw new Error('Failed to download template');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'employee_template.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showAlert('Template downloaded successfully!', 'success');
    } catch (error) {
        console.error('Error downloading template:', error);
        showAlert('Error downloading template', 'error');
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        displaySelectedFile(file);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            document.getElementById('excel-file').files = files;
            displaySelectedFile(file);
        } else {
            showAlert('Please select an Excel file (.xlsx or .xls)', 'error');
        }
    }
}

function displaySelectedFile(file) {
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const fileSize = document.getElementById('file-size');
    const submitBtn = document.getElementById('import-submit');

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.style.display = 'flex';
    submitBtn.disabled = false;
}

function removeSelectedFile() {
    document.getElementById('excel-file').value = '';
    document.getElementById('file-info').style.display = 'none';
    document.getElementById('import-submit').disabled = true;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleImportSubmit(e) {
    e.preventDefault();

    const fileInput = document.getElementById('excel-file');
    if (!fileInput.files[0]) {
        showAlert('Please select a file to import', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('excelFile', fileInput.files[0]);

    try {
        showImportProgress(true);

        const response = await fetch('/api/import-employees', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Import failed');
        }

        showAlert(result.message, 'success');

        if (result.errors && result.errors.length > 0) {
            showAlert(`Import completed with ${result.errors.length} errors. Check console for details.`, 'warning');
            console.warn('Import errors:', result.errors);
        }

        // Reset form and refresh data
        document.getElementById('import-form').reset();
        removeSelectedFile();
        loadEmployees();
        loadDashboardData();

    } catch (error) {
        console.error('Error importing employees:', error);
        showAlert(error.message, 'error');
    } finally {
        showImportProgress(false);
    }
}

function showImportProgress(show) {
    const progressDiv = document.getElementById('import-progress');
    const submitBtn = document.getElementById('import-submit');

    if (show) {
        progressDiv.style.display = 'block';
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';
    } else {
        progressDiv.style.display = 'none';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-upload"></i> Import Employees';
    }
}

// ==================== UTILITY FUNCTIONS ====================
function setDefaultDates() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    document.getElementById('start-date').value = today.toISOString().split('T')[0];
    document.getElementById('end-date').value = tomorrow.toISOString().split('T')[0];
}

function showLoading(tableId) {
    const table = document.getElementById(tableId);
    if (table) {
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = `
            <tr>
                <td colspan="100%" class="text-center" style="padding: 2rem;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; color: var(--primary-color);"></i>
                    <p style="margin-top: 0.5rem; color: var(--gray-600);">Loading...</p>
                </td>
            </tr>
        `;
    }
}

function hideLoading(tableId) {
    // Loading will be replaced by actual data
}

function showAlert(message, type = 'info') {
    const alertsContainer = document.getElementById('alerts-container');

    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type}`;
    alertElement.innerHTML = `
        <i class="fas ${getAlertIcon(type)}"></i>
        <span>${message}</span>
    `;

    alertsContainer.appendChild(alertElement);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertElement.parentNode) {
            alertElement.style.transform = 'translateX(100%)';
            alertElement.style.opacity = '0';
            setTimeout(() => {
                alertElement.remove();
            }, 300);
        }
    }, 5000);
}

function getAlertIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'info': return 'fa-info-circle';
        default: return 'fa-info-circle';
    }
}

// ==================== MODAL EVENT LISTENERS ====================
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeEmployeeModal();
    }
});

// Close modal when clicking outside
document.getElementById('modal-overlay').addEventListener('click', closeEmployeeModal);

// Prevent modal from closing when clicking inside
document.getElementById('employee-modal').addEventListener('click', function (e) {
    e.stopPropagation();
});

// ==================== ERROR HANDLING ====================
window.addEventListener('error', function (e) {
    console.error('JavaScript error:', e.error);
    showAlert('An unexpected error occurred. Please refresh the page.', 'error');
});

window.addEventListener('unhandledrejection', function (e) {
    console.error('Unhandled promise rejection:', e.reason);
    showAlert('An unexpected error occurred. Please try again.', 'error');
});

// ==================== PERFORMANCE OPTIMIZATION ====================
// Debounce function for search/filter functionality
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}