// server.js - HR Leave Management System with Supabase
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3001; // Changed port to 3001

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// Check if Supabase credentials are provided
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials!');
    console.log('📋 Please create a .env file with:');
    console.log('   SUPABASE_URL=https://your-project-id.supabase.co');
    console.log('   SUPABASE_ANON_KEY=your-anon-key-here');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') ||
            file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Please upload only Excel files'), false);
        }
    }
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to force clear any existing sessions/cookies
app.use((req, res, next) => {
    // Force clear any session cookies
    if (req.headers.cookie) {
        console.log('🍪 Found existing cookies, clearing them...');
        res.clearCookie('connect.sid');
        res.clearCookie('hr-system-session');
        // Clear any other session cookies
        const cookies = req.headers.cookie.split(';');
        cookies.forEach(cookie => {
            const cookieName = cookie.split('=')[0].trim();
            res.clearCookie(cookieName);
        });
    }
    next();
});

// Session configuration - with different session name
app.use(session({
    name: 'hr-system-session', // Custom session name
    secret: 'hr-system-secret-key-2024-new',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
    }
}));

// Authentication middleware
function requireAuth(req, res, next) {
    console.log('🔐 Auth check - Session authenticated:', req.session.authenticated);
    if (req.session.authenticated === true) {
        return next();
    }
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    console.log('🚫 Not authenticated, redirecting to login');
    res.redirect('/login');
}

// ==================== ROUTES ====================

// Root route - FORCE redirect to login with cache busting
app.get('/', (req, res) => {
    console.log('🏠 === ROOT PATH ACCESSED === 🏠');
    console.log('🕐 Time:', new Date().toISOString());
    console.log('👤 User-Agent:', req.headers['user-agent']);
    console.log('🔗 Referer:', req.headers.referer);
    console.log('🆔 Session ID:', req.sessionID);
    console.log('🔐 Session authenticated:', req.session.authenticated);
    console.log('📄 Full session:', JSON.stringify(req.session, null, 2));
    console.log('➡️  Forcing redirect to /login');

    // Destroy any existing session
    req.session.destroy((err) => {
        if (err) console.log('❌ Session destroy error:', err);

        // Force redirect with aggressive cache busting
        res.writeHead(302, {
            'Location': '/login',
            'Cache-Control': 'no-cache, no-store, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Clear-Site-Data': '"cache", "cookies", "storage"'
        });
        res.end();
    });
});

// Login page
app.get('/login', (req, res) => {
    console.log('=== LOGIN PATH ACCESSED ===');
    console.log('Session authenticated:', req.session.authenticated);

    if (req.session.authenticated) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Dashboard
app.get('/dashboard', requireAuth, (req, res) => {
    console.log('=== DASHBOARD PATH ACCESSED ===');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Debug routes
app.get('/clear-session', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).send('Error clearing session');
        } else {
            res.send('Session cleared. <a href="/">Go to home</a>');
        }
    });
});

app.get('/debug-session', (req, res) => {
    res.json({
        sessionID: req.sessionID,
        authenticated: req.session.authenticated,
        session: req.session
    });
});

// ==================== AUTHENTICATION ROUTES ====================

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Check user credentials in Supabase
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('password', password) // In production, use hashed passwords
            .single();

        if (error || !data) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Set session
        req.session.authenticated = true;
        req.session.userId = data.id;
        req.session.username = data.username;

        res.json({
            success: true,
            message: 'Login successful',
            user: { id: data.id, username: data.username, role: data.role }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).json({ success: false, message: 'Logout failed' });
        } else {
            res.json({ success: true, message: 'Logged out successfully' });
        }
    });
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
    res.json({
        authenticated: !!req.session.authenticated,
        username: req.session.username
    });
});

// ==================== EMPLOYEE ROUTES ====================

// Get all employees with leave summary
app.get('/api/employees', requireAuth, async (req, res) => {
    try {
        const { data: employees, error } = await supabase
            .from('employees')
            .select(`
        id,
        name,
        department,
        total_leaves,
        available_leaves,
        created_at,
        leaves:leaves(id)
      `)
            .order('name');

        if (error) throw error;

        // Calculate used leaves and total leave requests
        const employeesWithStats = employees.map(emp => ({
            ...emp,
            used_leaves: emp.total_leaves - emp.available_leaves,
            total_leave_requests: emp.leaves ? emp.leaves.length : 0
        }));

        res.json(employeesWithStats);
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get employee by ID with leave history
app.get('/api/employees/:id', requireAuth, async (req, res) => {
    const employeeId = req.params.id;

    try {
        // Get employee details
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (empError) throw empError;
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // Get employee's leave history
        const { data: leaves, error: leavesError } = await supabase
            .from('leaves')
            .select('*')
            .eq('employee_id', employeeId)
            .order('created_at', { ascending: false });

        if (leavesError) throw leavesError;

        res.json({
            ...employee,
            used_leaves: employee.total_leaves - employee.available_leaves,
            leaves: leaves || []
        });
    } catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add new employee
app.post('/api/employees', requireAuth, async (req, res) => {
    const { name, department, totalLeaves } = req.body;

    if (!name || !totalLeaves) {
        return res.status(400).json({ error: 'Name and total leaves are required' });
    }

    try {
        const { data, error } = await supabase
            .from('employees')
            .insert([{
                name,
                department: department || 'Not Specified',
                total_leaves: parseInt(totalLeaves),
                available_leaves: parseInt(totalLeaves)
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({
            ...data,
            used_leaves: 0,
            total_leave_requests: 0
        });
    } catch (error) {
        console.error('Error adding employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update employee
app.put('/api/employees/:id', requireAuth, async (req, res) => {
    const { name, department, totalLeaves } = req.body;
    const employeeId = req.params.id;

    if (!name || !totalLeaves) {
        return res.status(400).json({ error: 'Name and total leaves are required' });
    }

    try {
        // Get current employee data
        const { data: currentEmp, error: fetchError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (fetchError) throw fetchError;
        if (!currentEmp) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const usedLeaves = currentEmp.total_leaves - currentEmp.available_leaves;
        const newAvailableLeaves = parseInt(totalLeaves) - usedLeaves;

        const { data, error } = await supabase
            .from('employees')
            .update({
                name,
                department,
                total_leaves: parseInt(totalLeaves),
                available_leaves: newAvailableLeaves
            })
            .eq('id', employeeId)
            .select()
            .single();

        if (error) throw error;

        res.json({
            message: 'Employee updated successfully',
            ...data
        });
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete employee
app.delete('/api/employees/:id', requireAuth, async (req, res) => {
    const employeeId = req.params.id;

    try {
        // First delete all leaves for this employee
        const { error: leavesError } = await supabase
            .from('leaves')
            .delete()
            .eq('employee_id', employeeId);

        if (leavesError) throw leavesError;

        // Then delete the employee
        const { error: empError } = await supabase
            .from('employees')
            .delete()
            .eq('id', employeeId);

        if (empError) throw empError;

        res.json({ message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== LEAVE ROUTES ====================

// Get all leaves with employee information
app.get('/api/leaves', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leaves')
            .select(`
        *,
        employees:employee_id (
          name,
          department
        )
      `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Format the response
        const formattedLeaves = data.map(leave => ({
            ...leave,
            employee_name: leave.employees?.name || 'Unknown',
            employee_department: leave.employees?.department || 'Not Specified'
        }));

        res.json(formattedLeaves);
    } catch (error) {
        console.error('Error fetching leaves:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get leaves for specific employee
app.get('/api/employees/:id/leaves', requireAuth, async (req, res) => {
    const employeeId = req.params.id;

    try {
        const { data, error } = await supabase
            .from('leaves')
            .select('*')
            .eq('employee_id', employeeId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error fetching employee leaves:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add new leave
app.post('/api/leaves', requireAuth, async (req, res) => {
    const { employeeId, startDate, endDate, reason, status } = req.body;

    if (!employeeId || !startDate || !endDate || !reason) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // Get employee info
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (empError) throw empError;
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // Calculate days
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (days <= 0) {
            return res.status(400).json({ error: 'Invalid date range' });
        }

        // Check available leaves
        if (days > employee.available_leaves) {
            return res.status(400).json({
                error: `Insufficient leave balance. Available: ${employee.available_leaves}, Requested: ${days}`
            });
        }

        // Add leave
        const { data: leave, error: leaveError } = await supabase
            .from('leaves')
            .insert([{
                employee_id: employeeId,
                start_date: startDate,
                end_date: endDate,
                days,
                reason,
                status: status || 'approved'
            }])
            .select()
            .single();

        if (leaveError) throw leaveError;

        // Update employee's available leaves
        const { error: updateError } = await supabase
            .from('employees')
            .update({ available_leaves: employee.available_leaves - days })
            .eq('id', employeeId);

        if (updateError) throw updateError;

        res.json({
            ...leave,
            employee_name: employee.name,
            employee_department: employee.department
        });
    } catch (error) {
        console.error('Error adding leave:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete leave
app.delete('/api/leaves/:id', requireAuth, async (req, res) => {
    const leaveId = req.params.id;

    try {
        // Get leave info
        const { data: leave, error: leaveError } = await supabase
            .from('leaves')
            .select('*')
            .eq('id', leaveId)
            .single();

        if (leaveError) throw leaveError;
        if (!leave) {
            return res.status(404).json({ error: 'Leave not found' });
        }

        // Delete leave
        const { error: deleteError } = await supabase
            .from('leaves')
            .delete()
            .eq('id', leaveId);

        if (deleteError) throw deleteError;

        // Restore employee's available leaves
        const { error: updateError } = await supabase
            .from('employees')
            .update({
                available_leaves: supabase.raw('available_leaves + ?', [leave.days])
            })
            .eq('id', leave.employee_id);

        if (updateError) {
            // Alternative approach if raw doesn't work
            const { data: employee, error: fetchError } = await supabase
                .from('employees')
                .select('available_leaves')
                .eq('id', leave.employee_id)
                .single();

            if (!fetchError && employee) {
                await supabase
                    .from('employees')
                    .update({ available_leaves: employee.available_leaves + leave.days })
                    .eq('id', leave.employee_id);
            }
        }

        res.json({ message: 'Leave deleted successfully and balance restored' });
    } catch (error) {
        console.error('Error deleting leave:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== CSV EXPORT ROUTE ====================

// Export employees data to CSV
app.get('/api/export-csv', requireAuth, async (req, res) => {
    try {
        const { data: employees, error } = await supabase
            .from('employees')
            .select('*')
            .order('name');

        if (error) throw error;

        // Prepare CSV data
        const csvData = employees.map(emp => ({
            'Employee Name': emp.name,
            'Department': emp.department || 'Not Specified',
            'Total Leaves': emp.total_leaves,
            'Available Leaves': emp.available_leaves,
            'Used Leaves': emp.total_leaves - emp.available_leaves
        }));

        // Create workbook and worksheet
        const ws = XLSX.utils.json_to_sheet(csvData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Employees');

        // Generate CSV buffer
        const csvBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'csv' });

        // Set headers for download
        res.setHeader('Content-Disposition', 'attachment; filename=employees_export.csv');
        res.setHeader('Content-Type', 'text/csv');
        res.send(csvBuffer);

    } catch (error) {
        console.error('Error exporting CSV:', error);
        res.status(500).json({ error: 'Failed to export CSV' });
    }
});

// ==================== EXCEL IMPORT ROUTE ====================

// Excel template download
app.get('/api/download-template', requireAuth, (req, res) => {
    const template = [
        { name: 'John Doe', department: 'IT', total_leaves: 25, available_leaves: 25 },
        { name: 'Jane Smith', department: 'HR', total_leaves: 30, available_leaves: 30 }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Template');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=employee_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

// Import employees from Excel
app.post('/api/import-employees', requireAuth, upload.single('excelFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Read Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        if (data.length === 0) {
            return res.status(400).json({ error: 'Excel file is empty' });
        }

        // Validate and prepare data
        const employees = [];
        const errors = [];

        data.forEach((row, index) => {
            const name = row.name || row.Name || row.NAME;
            const department = row.department || row.Department || row.DEPARTMENT;
            const totalLeaves = parseInt(row.total_leaves || row['total leaves'] || row['Total Leaves'] || row.TOTAL_LEAVES);
            const availableLeaves = parseInt(row.available_leaves || row['available leaves'] || row['Available Leaves'] || row.AVAILABLE_LEAVES);

            if (!name || !totalLeaves || isNaN(totalLeaves)) {
                errors.push(`Row ${index + 2}: Missing or invalid name or total_leaves`);
                return;
            }

            if (isNaN(availableLeaves) || availableLeaves > totalLeaves) {
                errors.push(`Row ${index + 2}: Invalid available_leaves (should be <= total_leaves)`);
                return;
            }

            employees.push({
                name,
                department: department || 'Not Specified',
                total_leaves: totalLeaves,
                available_leaves: availableLeaves
            });
        });

        // Insert employees into Supabase
        let imported = 0;
        if (employees.length > 0) {
            const { data, error } = await supabase
                .from('employees')
                .insert(employees)
                .select();

            if (error) {
                errors.push(`Database error: ${error.message}`);
            } else {
                imported = data.length;
            }
        }

        res.json({
            message: `Import completed. ${imported} employees imported successfully.`,
            imported,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        // Clean up uploaded file in case of error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Import error:', error);
        res.status(500).json({ error: 'Error processing Excel file: ' + error.message });
    }
});

// ==================== DASHBOARD STATISTICS ====================

// Get dashboard statistics
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
    try {
        // Get total employees
        const { count: totalEmployees, error: empError } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true });

        if (empError) throw empError;

        // Get total leaves this year
        const currentYear = new Date().getFullYear();
        const { data: leavesThisYear, error: leavesError } = await supabase
            .from('leaves')
            .select('days')
            .gte('created_at', `${currentYear}-01-01`)
            .lte('created_at', `${currentYear}-12-31`);

        if (leavesError) throw leavesError;

        const totalLeavesThisYear = leavesThisYear.length;
        const totalDaysThisYear = leavesThisYear.reduce((sum, leave) => sum + leave.days, 0);

        // Get department statistics
        const { data: departments, error: deptError } = await supabase
            .from('employees')
            .select('department, total_leaves, available_leaves')
            .order('department');

        if (deptError) throw deptError;

        // Group by department
        const deptStats = departments.reduce((acc, emp) => {
            const dept = emp.department || 'Not Specified';
            if (!acc[dept]) {
                acc[dept] = {
                    department: dept,
                    employee_count: 0,
                    total_leaves: 0,
                    available_leaves: 0
                };
            }
            acc[dept].employee_count++;
            acc[dept].total_leaves += emp.total_leaves;
            acc[dept].available_leaves += emp.available_leaves;
            return acc;
        }, {});

        res.json({
            totalEmployees,
            totalLeavesThisYear,
            totalDaysThisYear,
            departments: Object.values(deptStats)
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== STARTUP ====================

async function initializeApp() {
    try {
        console.log('🔗 Connecting to Supabase...');

        // Test Supabase connection
        const { data, error } = await supabase.from('employees').select('count', { count: 'exact', head: true });

        if (error) {
            console.error('❌ Supabase connection failed:', error.message);
            console.log('📋 Make sure to:');
            console.log('   1. Set SUPABASE_URL environment variable');
            console.log('   2. Set SUPABASE_ANON_KEY environment variable');
            console.log('   3. Create the required tables in Supabase');
        } else {
            console.log('✅ Supabase connected successfully');
            console.log(`📊 Found ${data || 0} employees in database`);
        }

    } catch (error) {
        console.error('❌ Initialization error:', error);
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 HR Leave Management System running on http://localhost:${PORT}`);
    console.log(`🔐 Login at: http://localhost:${PORT}/login`);
    console.log(`🏠 Home page: http://localhost:${PORT}/`);
    console.log(`📊 Port changed to ${PORT} for fresh start`);
    initializeApp();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});