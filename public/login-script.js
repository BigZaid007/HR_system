// login-script.js - Login Page JavaScript

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', function () {
    initializeLoginPage();
});

function initializeLoginPage() {
    setupEventListeners();
    checkAuthStatus();
    focusUsernameField();
}

// ==================== EVENT LISTENERS ====================
function setupEventListeners() {
    // Login form submission
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', handleLoginSubmit);

    // Password toggle functionality
    const passwordToggle = document.getElementById('password-toggle');
    passwordToggle.addEventListener('click', togglePasswordVisibility);

    // Input field enhancements
    setupInputFieldListeners();

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Demo credentials click-to-fill
    setupDemoCredentialClickHandlers();
}

function setupInputFieldListeners() {
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');

    // Add input validation and styling
    [usernameField, passwordField].forEach(field => {
        field.addEventListener('input', validateField);
        field.addEventListener('focus', handleFieldFocus);
        field.addEventListener('blur', handleFieldBlur);
    });

    // Enter key navigation
    usernameField.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            passwordField.focus();
        }
    });
}

function setupDemoCredentialClickHandlers() {
    // Make demo credentials clickable for easy testing
    const credentialItems = document.querySelectorAll('.credential-item code');
    credentialItems.forEach((item, index) => {
        item.style.cursor = 'pointer';
        item.title = 'Click to copy to clipboard';

        item.addEventListener('click', function () {
            const text = this.textContent;
            navigator.clipboard.writeText(text).then(() => {
                // Visual feedback
                const originalBg = this.style.backgroundColor;
                this.style.backgroundColor = '#dcfce7';
                setTimeout(() => {
                    this.style.backgroundColor = originalBg;
                }, 1000);

                // Auto-fill if clicked
                if (index === 0) {
                    document.getElementById('username').value = text;
                } else if (index === 1) {
                    document.getElementById('password').value = text;
                }

                showNotification('Copied to clipboard!', 'success');
            }).catch(() => {
                // Fallback for older browsers
                if (index === 0) {
                    document.getElementById('username').value = text;
                } else if (index === 1) {
                    document.getElementById('password').value = text;
                }
                showNotification('Filled automatically!', 'info');
            });
        });
    });

    // Add auto-fill all button
    const credentialsBox = document.querySelector('.credentials-box');
    const autoFillBtn = document.createElement('button');
    autoFillBtn.type = 'button';
    autoFillBtn.className = 'auto-fill-btn';
    autoFillBtn.innerHTML = '<i class="fas fa-magic"></i> Auto-fill credentials';
    autoFillBtn.style.cssText = `
        width: 100%;
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: var(--primary-color);
        color: white;
        border: none;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s ease;
    `;

    autoFillBtn.addEventListener('click', function () {
        document.getElementById('username').value = 'Reyam';
        document.getElementById('password').value = 'SugarHamburger';
        showNotification('Demo credentials filled!', 'success');
        document.getElementById('username').focus();
    });

    autoFillBtn.addEventListener('mouseenter', function () {
        this.style.backgroundColor = 'var(--primary-hover)';
        this.style.transform = 'translateY(-1px)';
    });

    autoFillBtn.addEventListener('mouseleave', function () {
        this.style.backgroundColor = 'var(--primary-color)';
        this.style.transform = 'translateY(0)';
    });

    credentialsBox.appendChild(autoFillBtn);
}

// ==================== AUTHENTICATION ====================
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                window.location.href = '/dashboard';
                return;
            }
        }
    } catch (error) {
        console.log('Auth check failed, proceeding with login');
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    // Clear any existing errors
    hideError();

    // Validate inputs
    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }

    // Show loading state
    setLoadingState(true);

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showSuccess('Login successful! Redirecting...');

            // Add a short delay for user feedback
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            throw new Error(result.message || 'Invalid credentials');
        }

    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed. Please try again.');

        // Shake animation for login card
        const loginCard = document.querySelector('.login-card');
        loginCard.style.animation = 'shake 0.5s ease-out';
        setTimeout(() => {
            loginCard.style.animation = '';
        }, 500);

    } finally {
        setLoadingState(false);
    }
}

// ==================== UI HELPER FUNCTIONS ====================
function setLoadingState(isLoading) {
    const loginBtn = document.getElementById('login-btn');
    const loadingOverlay = document.getElementById('loading-overlay');

    if (isLoading) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span class="btn-text">Signing in...</span>
        `;
        loadingOverlay.classList.add('show');
    } else {
        loginBtn.disabled = false;
        loginBtn.innerHTML = `
            <span class="btn-text">Sign In</span>
            <i class="fas fa-arrow-right btn-icon"></i>
        `;
        loadingOverlay.classList.remove('show');
    }
}

function showError(message) {
    const errorElement = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    errorText.textContent = message;
    errorElement.classList.add('show');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    const errorElement = document.getElementById('error-message');
    errorElement.classList.remove('show');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas ${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;

    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        background: ${getNotificationColor(type)};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        font-weight: 500;
        animation: slideInRight 0.3s ease;
    `;

    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        case 'info': return 'fa-info-circle';
        default: return 'fa-info-circle';
    }
}

function getNotificationColor(type) {
    switch (type) {
        case 'success': return '#10b981';
        case 'error': return '#ef4444';
        case 'warning': return '#f59e0b';
        case 'info': return '#06b6d4';
        default: return '#06b6d4';
    }
}

// ==================== INPUT FIELD ENHANCEMENTS ====================
function togglePasswordVisibility() {
    const passwordField = document.getElementById('password');
    const toggleIcon = document.querySelector('#password-toggle i');

    if (passwordField.type === 'password') {
        passwordField.type = 'text';
        toggleIcon.classList.remove('fa-eye');
        toggleIcon.classList.add('fa-eye-slash');
    } else {
        passwordField.type = 'password';
        toggleIcon.classList.remove('fa-eye-slash');
        toggleIcon.classList.add('fa-eye');
    }
}

function validateField(e) {
    const field = e.target;
    const value = field.value.trim();

    // Remove any existing validation classes
    field.classList.remove('field-valid', 'field-invalid');

    if (value.length > 0) {
        if (field.id === 'username') {
            // Username validation
            if (value.length >= 2) {
                field.classList.add('field-valid');
            } else {
                field.classList.add('field-invalid');
            }
        } else if (field.id === 'password') {
            // Password validation
            if (value.length >= 4) {
                field.classList.add('field-valid');
            } else {
                field.classList.add('field-invalid');
            }
        }
    }
}

function handleFieldFocus(e) {
    const container = e.target.closest('.input-container');
    container.classList.add('field-focused');
    hideError();
}

function handleFieldBlur(e) {
    const container = e.target.closest('.input-container');
    container.classList.remove('field-focused');
}

function focusUsernameField() {
    setTimeout(() => {
        document.getElementById('username').focus();
    }, 500);
}

// ==================== KEYBOARD SHORTCUTS ====================
function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + Enter to submit form
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('login-form').dispatchEvent(new Event('submit'));
    }

    // Escape to clear form
    if (e.key === 'Escape') {
        document.getElementById('login-form').reset();
        hideError();
        document.getElementById('username').focus();
    }

    // F1 to auto-fill demo credentials
    if (e.key === 'F1') {
        e.preventDefault();
        document.getElementById('username').value = 'Reyam';
        document.getElementById('password').value = 'SugarHamburger';
        showNotification('Demo credentials filled! (Press F1 again)', 'info');
    }
}

// ==================== FORM PERSISTENCE ====================
function saveFormData() {
    const rememberMe = document.getElementById('remember-me').checked;
    const username = document.getElementById('username').value;

    if (rememberMe && username) {
        localStorage.setItem('rememberedUsername', username);
    } else {
        localStorage.removeItem('rememberedUsername');
    }
}

function loadSavedFormData() {
    const rememberedUsername = localStorage.getItem('rememberedUsername');
    if (rememberedUsername) {
        document.getElementById('username').value = rememberedUsername;
        document.getElementById('remember-me').checked = true;
    }
}

// ==================== SECURITY ENHANCEMENTS ====================
function preventBruteForce() {
    const maxAttempts = 5;
    const lockoutTime = 5 * 60 * 1000; // 5 minutes

    let attempts = parseInt(sessionStorage.getItem('loginAttempts') || '0');
    let lockoutUntil = parseInt(sessionStorage.getItem('lockoutUntil') || '0');

    // Check if still locked out
    if (lockoutUntil > Date.now()) {
        const remainingTime = Math.ceil((lockoutUntil - Date.now()) / 1000);
        showError(`Too many failed attempts. Try again in ${remainingTime} seconds.`);
        setLoadingState(true);

        setTimeout(() => {
            setLoadingState(false);
            sessionStorage.removeItem('lockoutUntil');
            sessionStorage.removeItem('loginAttempts');
        }, lockoutUntil - Date.now());

        return false;
    }

    return true;
}

function recordFailedAttempt() {
    let attempts = parseInt(sessionStorage.getItem('loginAttempts') || '0') + 1;
    sessionStorage.setItem('loginAttempts', attempts.toString());

    if (attempts >= 5) {
        const lockoutUntil = Date.now() + (5 * 60 * 1000);
        sessionStorage.setItem('lockoutUntil', lockoutUntil.toString());
        showError('Too many failed attempts. Account locked for 5 minutes.');
    }
}

function clearFailedAttempts() {
    sessionStorage.removeItem('loginAttempts');
    sessionStorage.removeItem('lockoutUntil');
}

// ==================== ERROR HANDLING ====================
window.addEventListener('error', function (e) {
    console.error('JavaScript error:', e.error);
    showNotification('An unexpected error occurred. Please refresh the page.', 'error');
});

window.addEventListener('unhandledrejection', function (e) {
    console.error('Unhandled promise rejection:', e.reason);
    showNotification('An unexpected error occurred. Please try again.', 'error');
});

// ==================== PAGE LIFECYCLE ====================
window.addEventListener('beforeunload', function () {
    saveFormData();
});

window.addEventListener('load', function () {
    loadSavedFormData();
});

// ==================== ACCESSIBILITY ENHANCEMENTS ====================
function setupAccessibilityFeatures() {
    // Add ARIA labels
    document.getElementById('username').setAttribute('aria-label', 'Username');
    document.getElementById('password').setAttribute('aria-label', 'Password');

    // Announce errors to screen readers
    const errorElement = document.getElementById('error-message');
    errorElement.setAttribute('role', 'alert');
    errorElement.setAttribute('aria-live', 'polite');

    // Add keyboard navigation for custom elements
    document.querySelectorAll('.credential-item code').forEach(item => {
        item.setAttribute('tabindex', '0');
        item.setAttribute('role', 'button');

        item.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
    });
}

// Initialize accessibility features
document.addEventListener('DOMContentLoaded', setupAccessibilityFeatures);

// ==================== PERFORMANCE OPTIMIZATION ====================
// Debounce validation to improve performance
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

// Debounced validation
const debouncedValidateField = debounce(validateField, 300);

// Replace immediate validation with debounced version for better performance
document.addEventListener('DOMContentLoaded', function () {
    const fields = ['username', 'password'];
    fields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.removeEventListener('input', validateField);
            field.addEventListener('input', debouncedValidateField);
        }
    });
});

// ==================== BROWSER COMPATIBILITY ====================
// Polyfill for older browsers
if (!window.fetch) {
    showNotification('Your browser is not supported. Please update to a modern browser.', 'warning');
}

// Add CSS for validation states
const validationStyles = document.createElement('style');
validationStyles.textContent = `
    .field-valid {
        border-color: #10b981 !important;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1) !important;
    }
    
    .field-invalid {
        border-color: #ef4444 !important;
        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
    }
    
    .field-focused {
        transform: scale(1.02);
    }
    
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(validationStyles);