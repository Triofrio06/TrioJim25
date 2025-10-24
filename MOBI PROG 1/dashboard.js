// MOBIPAY Dashboard JavaScript

// Global variables
let authToken = localStorage.getItem('mobipay_token');
let currentSection = 'overview';
let refreshInterval = null;
let charts = {};

// API Configuration
const API_BASE = '/api/dashboard';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    if (authToken) {
        showDashboard();
    } else {
        showLogin();
    }
});

// Authentication functions
function showLogin() {
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('dashboardContent').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'block';
    showSection('overview');
    startAutoRefresh();
}

function logout() {
    localStorage.removeItem('mobipay_token');
    authToken = null;
    stopAutoRefresh();
    showLogin();
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        showLoading(true);
        
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            localStorage.setItem('mobipay_token', authToken);
            document.getElementById('currentUser').textContent = data.user.username;
            showDashboard();
        } else {
            showError('loginError', data.error);
        }
    } catch (error) {
        showError('loginError', 'Login failed. Please try again.');
    } finally {
        showLoading(false);
    }
});

// Utility functions
function showLoading(show = true) {
    document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 5000);
}

// API helper
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...options.headers
    };
    
    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        if (response.status === 401 || response.status === 403) {
            logout();
            return null;
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        return null;
    }
}

// Section navigation
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // Remove active from nav items
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.classList.remove('active');
    });
    
    // Show selected section
    const targetSection = document.getElementById(`${sectionName}Section`);
    if (targetSection) {
        targetSection.style.display = 'block';
        targetSection.classList.add('active');
        currentSection = sectionName;
        
        // Add active to nav item
        const navLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
        if (navLink) {
            navLink.classList.add('active');
        }
        
        // Load section data
        loadSectionData(sectionName);
    }
}

// Load section-specific data
async function loadSectionData(section) {
    switch (section) {
        case 'overview':
            await loadOverview();
            break;
        case 'transactions':
            await loadTransactions();
            break;
        case 'matatus':
            await loadMatatus();
            break;
        case 'analytics':
            await loadAnalytics();
            break;
        case 'settings':
            await loadSettings();
            break;
        case 'logs':
            await loadLogs();
            break;
        case 'database':
            await loadDatabase();
            break;
    }
}

// Overview functions
async function loadOverview() {
    try {
        const data = await apiCall('/overview');
        if (!data || !data.success) return;
        
        const stats = data.data;
        
        // Update stat cards
        document.getElementById('totalTransactions').textContent = stats.totalTransactions || 0;
        document.getElementById('completedTransactions').textContent = stats.completedTransactions || 0;
        document.getElementById('pendingTransactions').textContent = stats.pendingTransactions || 0;
        document.getElementById('failedTransactions').textContent = stats.failedTransactions || 0;
        document.getElementById('totalRevenue').textContent = `KSh ${(stats.totalRevenue || 0).toLocaleString()}`;
        document.getElementById('developerShare').textContent = `KSh ${(stats.developerShare || 0).toLocaleString()}`;
        
        // Update recent transactions table
        updateRecentTransactionsTable(stats.recentTransactions || []);
        
    } catch (error) {
        console.error('Failed to load overview:', error);
    }
}

function updateRecentTransactionsTable(transactions) {
    const tbody = document.getElementById('recentTransactionsBody');
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No recent transactions</td></tr>';
        return;
    }
    
    tbody.innerHTML = transactions.map(tx => `
        <tr>
            <td>${tx.transaction_id}</td>
            <td>${tx.matatu_code} - ${tx.route_name || 'Unknown Route'}</td>
            <td>KSh ${tx.amount}</td>
            <td><span class="status-badge status-${tx.status.toLowerCase()}">${tx.status}</span></td>
            <td>${moment(tx.created_at).fromNow()}</td>
        </tr>
    `).join('');
}

async function refreshOverview() {
    await loadOverview();
}

// Transactions functions
let currentTransactionsPage = 1;

async function loadTransactions(page = 1) {
    try {
        const statusFilter = document.getElementById('statusFilter').value;
        const searchQuery = document.getElementById('searchTransactions').value;
        
        let url = `/transactions?page=${page}&limit=50`;
        if (statusFilter) url += `&status=${statusFilter}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
        
        const data = await apiCall(url);
        if (!data || !data.success) return;
        
        updateTransactionsTable(data.data.transactions);
        updateTransactionsPagination(data.data.pagination);
        currentTransactionsPage = page;
        
    } catch (error) {
        console.error('Failed to load transactions:', error);
    }
}

function updateTransactionsTable(transactions) {
    const tbody = document.getElementById('transactionsBody');
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No transactions found</td></tr>';
        return;
    }
    
    tbody.innerHTML = transactions.map(tx => `
        <tr>
            <td>${tx.transaction_id}</td>
            <td>${tx.matatu_code}</td>
            <td>${tx.phone_number}</td>
            <td>KSh ${tx.amount}</td>
            <td>KSh ${tx.transaction_charge}</td>
            <td><span class="status-badge status-${tx.status.toLowerCase()}">${tx.status}</span></td>
            <td>Owner: ${tx.owner_share} | Dev: ${tx.developer_share}</td>
            <td>${moment(tx.created_at).format('MMM DD, YYYY HH:mm')}</td>
            <td>
                <button class="btn btn-outline" onclick="viewTransaction('${tx.transaction_id}')">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updateTransactionsPagination(pagination) {
    const container = document.getElementById('transactionsPagination');
    
    let html = '';
    
    // Previous button
    if (pagination.page > 1) {
        html += `<button onclick="loadTransactions(${pagination.page - 1})">&laquo; Previous</button>`;
    }
    
    // Page numbers
    for (let i = Math.max(1, pagination.page - 2); i <= Math.min(pagination.pages, pagination.page + 2); i++) {
        const active = i === pagination.page ? 'active' : '';
        html += `<button class="${active}" onclick="loadTransactions(${i})">${i}</button>`;
    }
    
    // Next button
    if (pagination.page < pagination.pages) {
        html += `<button onclick="loadTransactions(${pagination.page + 1})">Next &raquo;</button>`;
    }
    
    container.innerHTML = html;
}

function filterTransactions() {
    loadTransactions(1);
}

function refreshTransactions() {
    loadTransactions(currentTransactionsPage);
}

function viewTransaction(transactionId) {
    // Open transaction details modal (implement as needed)
    alert(`View transaction: ${transactionId}`);
}

// Matatus functions
async function loadMatatus() {
    try {
        const data = await apiCall('/matatus');
        if (!data || !data.success) return;
        
        updateMatatusTable(data.data);
        
    } catch (error) {
        console.error('Failed to load matatus:', error);
    }
}

function updateMatatusTable(matatus) {
    const tbody = document.getElementById('matatusBody');
    
    if (matatus.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No matatus found</td></tr>';
        return;
    }
    
    tbody.innerHTML = matatus.map(matatu => `
        <tr>
            <td>${matatu.matatu_code}</td>
            <td>${matatu.route_name}</td>
            <td>${matatu.owner_account}</td>
            <td>${matatu.total_transactions || 0}</td>
            <td>KSh ${(matatu.total_revenue || 0).toLocaleString()}</td>
            <td>
                <span class="status-badge ${matatu.is_active ? 'status-completed' : 'status-failed'}">
                    ${matatu.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <button class="btn btn-outline" onclick="editMatatu(${matatu.id})">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function showAddMatatuModal() {
    document.getElementById('addMatatuModal').style.display = 'flex';
}

function closeAddMatatuModal() {
    document.getElementById('addMatatuModal').style.display = 'none';
    document.getElementById('addMatatuForm').reset();
}

// Add matatu form handler
document.getElementById('addMatatuForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = {
        matatu_code: document.getElementById('newMatatuCode').value,
        route_name: document.getElementById('newRouteName').value,
        owner_account: document.getElementById('newOwnerAccount').value
    };
    
    try {
        const data = await apiCall('/matatus', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        if (data && data.success) {
            closeAddMatatuModal();
            await loadMatatus();
            alert('Matatu added successfully!');
        } else {
            alert('Failed to add matatu: ' + (data?.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Failed to add matatu. Please try again.');
    }
});

function editMatatu(matatuId) {
    // Implement matatu editing modal
    alert(`Edit matatu ID: ${matatuId}`);
}

// Analytics functions
async function loadAnalytics() {
    try {
        const period = document.getElementById('analyticsPeriod').value;
        const data = await apiCall(`/analytics?period=${period}`);
        if (!data || !data.success) return;
        
        const analytics = data.data;
        
        // Create charts
        createDailyTransactionsChart(analytics.dailyTransactions);
        createStatusDistributionChart(analytics.statusDistribution);
        createHourlyRevenueChart(analytics.revenueByHour);
        createTopMatatusChart(analytics.topMatatus);
        
    } catch (error) {
        console.error('Failed to load analytics:', error);
    }
}

function createDailyTransactionsChart(data) {
    const ctx = document.getElementById('dailyTransactionsChart').getContext('2d');
    
    if (charts.dailyTransactions) {
        charts.dailyTransactions.destroy();
    }
    
    charts.dailyTransactions = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(item => moment(item.date).format('MMM DD')),
            datasets: [{
                label: 'Transactions',
                data: data.map(item => item.transactions),
                borderColor: '#007bff',
                tension: 0.1
            }, {
                label: 'Revenue (KSh)',
                data: data.map(item => item.revenue),
                borderColor: '#28a745',
                tension: 0.1,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false,
                    },
                }
            }
        }
    });
}

function createStatusDistributionChart(data) {
    const ctx = document.getElementById('statusDistributionChart').getContext('2d');
    
    if (charts.statusDistribution) {
        charts.statusDistribution.destroy();
    }
    
    const colors = {
        'COMPLETED': '#28a745',
        'PENDING': '#ffc107',
        'FAILED': '#dc3545'
    };
    
    charts.statusDistribution = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(item => item.status),
            datasets: [{
                data: data.map(item => item.count),
                backgroundColor: data.map(item => colors[item.status] || '#6c757d')
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function createHourlyRevenueChart(data) {
    const ctx = document.getElementById('hourlyRevenueChart').getContext('2d');
    
    if (charts.hourlyRevenue) {
        charts.hourlyRevenue.destroy();
    }
    
    charts.hourlyRevenue = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => `${item.hour}:00`),
            datasets: [{
                label: 'Revenue (KSh)',
                data: data.map(item => item.revenue),
                backgroundColor: '#17a2b8'
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function createTopMatatusChart(data) {
    const ctx = document.getElementById('topMatatusChart').getContext('2d');
    
    if (charts.topMatatus) {
        charts.topMatatus.destroy();
    }
    
    charts.topMatatus = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(item => `${item.matatu_code} - ${item.route_name || 'Unknown'}`),
            datasets: [{
                label: 'Revenue (KSh)',
                data: data.map(item => item.revenue),
                backgroundColor: '#007bff'
            }]
        },
        options: {
            responsive: true,
            indexAxis: 'y',
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Settings functions
async function loadSettings() {
    try {
        const data = await apiCall('/settings');
        if (!data || !data.success) return;
        
        updateSettingsForm(data.data);
        
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

function updateSettingsForm(settings) {
    const container = document.getElementById('settingsForm');
    
    const html = settings.map(setting => `
        <div class="form-group">
            <label for="setting_${setting.setting_key}">${setting.setting_key.replace(/_/g, ' ').toUpperCase()}</label>
            <div style="display: flex; gap: 10px; align-items: center;">
                <input type="text" 
                       id="setting_${setting.setting_key}" 
                       value="${setting.setting_value}" 
                       data-key="${setting.setting_key}">
                <button class="btn btn-outline" onclick="updateSetting('${setting.setting_key}')">
                    <i class="fas fa-save"></i> Save
                </button>
            </div>
            <small style="color: #6c757d;">${setting.description || ''}</small>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

async function updateSetting(key) {
    try {
        const input = document.getElementById(`setting_${key}`);
        const value = input.value;
        
        const data = await apiCall(`/settings/${key}`, {
            method: 'PUT',
            body: JSON.stringify({ value })
        });
        
        if (data && data.success) {
            alert('Setting updated successfully!');
        } else {
            alert('Failed to update setting: ' + (data?.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Failed to update setting. Please try again.');
    }
}

function refreshSettings() {
    loadSettings();
}

// Logs functions
async function loadLogs() {
    try {
        const data = await apiCall('/logs');
        if (!data || !data.success) return;
        
        updateLogsTable(data.data);
        
    } catch (error) {
        console.error('Failed to load logs:', error);
    }
}

function updateLogsTable(logs) {
    const tbody = document.getElementById('logsBody');
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No logs found</td></tr>';
        return;
    }
    
    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${log.type}</td>
            <td>${log.reference}</td>
            <td><span class="status-badge status-${(log.status || '').toLowerCase()}">${log.status || 'N/A'}</span></td>
            <td>KSh ${log.amount || 0}</td>
            <td>${log.phone_number || 'N/A'}</td>
            <td>${moment(log.created_at).format('MMM DD, YYYY HH:mm')}</td>
        </tr>
    `).join('');
}

function refreshLogs() {
    loadLogs();
}

// Database functions
let currentDatabaseTab = 'transactions';

async function loadDatabase() {
    showDatabaseTab('transactions');
}

function showDatabaseTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[onclick="showDatabaseTab('${tabName}')"]`).classList.add('active');
    
    currentDatabaseTab = tabName;
    loadDatabaseTab(tabName);
}

async function loadDatabaseTab(tabName) {
    const container = document.getElementById('databaseContent');
    container.innerHTML = '<div class="card-content"><div class="loading">Loading database information...</div></div>';
    
    try {
        let endpoint = '';
        switch (tabName) {
            case 'transactions':
                endpoint = '/transactions?limit=100';
                break;
            case 'matatus':
                endpoint = '/matatus';
                break;
            case 'accounts':
                // Implement accounts endpoint
                container.innerHTML = '<div class="card-content"><p>Accounts view coming soon...</p></div>';
                return;
            case 'settings':
                endpoint = '/settings';
                break;
        }
        
        const data = await apiCall(endpoint);
        if (!data || !data.success) return;
        
        displayDatabaseData(tabName, data.data);
        
    } catch (error) {
        console.error(`Failed to load ${tabName}:`, error);
    }
}

function displayDatabaseData(type, data) {
    const container = document.getElementById('databaseContent');
    
    let html = '<div class="card-content">';
    
    if (type === 'transactions') {
        const transactions = data.transactions || data;
        html += `
            <h4>Transactions (${transactions.length} records)</h4>
            <div style="overflow-x: auto; margin-top: 15px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Transaction ID</th>
                            <th>Matatu Code</th>
                            <th>Phone</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transactions.map(tx => `
                            <tr>
                                <td>${tx.id}</td>
                                <td>${tx.transaction_id}</td>
                                <td>${tx.matatu_code}</td>
                                <td>${tx.phone_number}</td>
                                <td>KSh ${tx.amount}</td>
                                <td>${tx.status}</td>
                                <td>${moment(tx.created_at).format('YYYY-MM-DD HH:mm')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else if (type === 'matatus') {
        html += `
            <h4>Matatus (${data.length} records)</h4>
            <div style="overflow-x: auto; margin-top: 15px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Matatu Code</th>
                            <th>Route Name</th>
                            <th>Owner Account</th>
                            <th>Active</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(matatu => `
                            <tr>
                                <td>${matatu.id}</td>
                                <td>${matatu.matatu_code}</td>
                                <td>${matatu.route_name}</td>
                                <td>${matatu.owner_account}</td>
                                <td>${matatu.is_active ? 'Yes' : 'No'}</td>
                                <td>${moment(matatu.created_at).format('YYYY-MM-DD HH:mm')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else if (type === 'settings') {
        html += `
            <h4>System Settings (${data.length} records)</h4>
            <div style="overflow-x: auto; margin-top: 15px;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Key</th>
                            <th>Value</th>
                            <th>Description</th>
                            <th>Updated</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(setting => `
                            <tr>
                                <td>${setting.setting_key}</td>
                                <td>${setting.setting_value}</td>
                                <td>${setting.description || 'N/A'}</td>
                                <td>${moment(setting.updated_at).format('YYYY-MM-DD HH:mm')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function refreshDatabase() {
    loadDatabaseTab(currentDatabaseTab);
}

function exportDatabase() {
    // Implement database export functionality
    alert('Database export functionality coming soon!');
}

// Auto refresh functionality
function startAutoRefresh() {
    // Refresh overview every 30 seconds
    refreshInterval = setInterval(() => {
        if (currentSection === 'overview') {
            loadOverview();
        }
    }, 30000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
            case '1':
                e.preventDefault();
                showSection('overview');
                break;
            case '2':
                e.preventDefault();
                showSection('transactions');
                break;
            case '3':
                e.preventDefault();
                showSection('matatus');
                break;
            case '4':
                e.preventDefault();
                showSection('analytics');
                break;
        }
    }
});
