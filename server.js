// server.js
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
const PORT = 3000;

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

// Database setup
const db = new sqlite3.Database('./hr_system.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
function initializeDatabase() {
    // Create employees table
    db.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department TEXT,
    total_leaves INTEGER NOT NULL,
    available_leaves INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

    // Create leaves table
    db.run(`CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'approved',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees (id)
  )`);

    // Insert sample data if tables are empty
    db.get("SELECT COUNT(*) as count FROM employees", (err, row) => {
        if (!err && row.count === 0) {
            insertSampleData();
        }
    });
}

function insertSampleData() {
    console.log('Inserting sample data...');

    const sampleEmployees = [
        { name: "John Doe", department: "IT", total_leaves: 25, available_leaves: 20 },
        { name: "Jane Smith", department: "HR", total_leaves: 30, available_leaves: 22 },
        { name: "Mike Johnson", department: "Finance", total_leaves: 25, available_leaves: 25 },
        { name: "Sarah Wilson", department: "Marketing", total_leaves: 28, available_leaves: 15 }
    ];

    sampleEmployees.forEach(emp => {
        db.run("INSERT INTO employees (name, department, total_leaves, available_leaves) VALUES (?, ?, ?, ?)",
            [emp.name, emp.department, emp.total_leaves, emp.available_leaves]);
    });

    // Sample leaves
    const sampleLeaves = [
        { employee_id: 1, start_date: "2024-01-15", end_date: "2024-01-17", days: 3, reason: "Personal" },
        { employee_id: 1, start_date: "2024-02-20", end_date: "2024-02-21", days: 2, reason: "Medical" },
        { employee_id: 2, start_date: "2024-01-10", end_date: "2024-01-14", days: 5, reason: "Vacation" },
        { employee_id: 2, start_date: "2024-03-05", end_date: "2024-03-07", days: 3, reason: "Personal" },
        { employee_id: 4, start_date: "2024-02-01", end_date: "2024-02-10", days: 10, reason: "Vacation" },
        { employee_id: 4, start_date: "2024-03-15", end_date: "2024-03-17", days: 3, reason: "Medical" }
    ];

    sampleLeaves.forEach(leave => {
        db.run("INSERT INTO leaves (employee_id, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?)",
            [leave.employee_id, leave.start_date, leave.end_date, leave.days, leave.reason]);
    });

    console.log('Sample data inserted');
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: 'hr-system-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.authenticated) {
        return next();
    }
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    res.redirect('/login');
}

// Routes
app.get('/', (req, res) => {
    if (req.session.authenticated) {
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    if (req.session.authenticated) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== AUTHENTICATION ROUTES ====================

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username === 'Reyam' && password === 'SugarHamburger') {
        req.session.authenticated = true;
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
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
    res.json({ authenticated: !!req.session.authenticated });
});

// ==================== EMPLOYEE ROUTES ====================

// Get all employees with their leave summary
app.get('/api/employees', requireAuth, (req, res) => {
    const query = `
    SELECT 
      e.id,
      e.name,
      e.department,
      e.total_leaves,
      e.available_leaves,
      e.created_at,
      (e.total_leaves - e.available_leaves) as used_leaves,
      COUNT(l.id) as total_leave_requests
    FROM employees e
    LEFT JOIN leaves l ON e.id = l.employee_id
    GROUP BY e.id, e.name, e.department, e.total_leaves, e.available_leaves, e.created_at
    ORDER BY e.name
  `;

    db.all(query, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

// Get employee by ID with detailed leave history
app.get('/api/employees/:id', requireAuth, (req, res) => {
    const employeeId = req.params.id;

    // Get employee details
    db.get("SELECT * FROM employees WHERE id = ?", [employeeId], (err, employee) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // Get employee's leave history
        db.all(`
      SELECT * FROM leaves 
      WHERE employee_id = ? 
      ORDER BY created_at DESC
    `, [employeeId], (err, leaves) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                ...employee,
                used_leaves: employee.total_leaves - employee.available_leaves,
                leaves: leaves
            });
        });
    });
});

// Add new employee
app.post('/api/employees', requireAuth, (req, res) => {
    const { name, department, totalLeaves } = req.body;

    if (!name || !totalLeaves) {
        return res.status(400).json({ error: 'Name and total leaves are required' });
    }

    const availableLeaves = parseInt(totalLeaves);

    db.run(
        "INSERT INTO employees (name, department, total_leaves, available_leaves) VALUES (?, ?, ?, ?)",
        [name, department || 'Not Specified', parseInt(totalLeaves), availableLeaves],
        function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({
                    id: this.lastID,
                    name,
                    department: department || 'Not Specified',
                    total_leaves: parseInt(totalLeaves),
                    available_leaves: availableLeaves,
                    used_leaves: 0,
                    total_leave_requests: 0
                });
            }
        }
    );
});

// Update employee
app.put('/api/employees/:id', requireAuth, (req, res) => {
    const { name, department, totalLeaves } = req.body;
    const employeeId = req.params.id;

    if (!name || !totalLeaves) {
        return res.status(400).json({ error: 'Name and total leaves are required' });
    }

    // Get current employee data to calculate new available leaves
    db.get("SELECT * FROM employees WHERE id = ?", [employeeId], (err, employee) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const usedLeaves = employee.total_leaves - employee.available_leaves;
        const newAvailableLeaves = parseInt(totalLeaves) - usedLeaves;

        db.run(
            "UPDATE employees SET name = ?, department = ?, total_leaves = ?, available_leaves = ? WHERE id = ?",
            [name, department, parseInt(totalLeaves), newAvailableLeaves, employeeId],
            function (err) {
                if (err) {
                    res.status(500).json({ error: err.message });
                } else {
                    res.json({
                        message: 'Employee updated successfully',
                        id: employeeId,
                        name,
                        department,
                        total_leaves: parseInt(totalLeaves),
                        available_leaves: newAvailableLeaves
                    });
                }
            }
        );
    });
});

// Delete employee
app.delete('/api/employees/:id', requireAuth, (req, res) => {
    const employeeId = req.params.id;

    // First delete all leaves for this employee
    db.run("DELETE FROM leaves WHERE employee_id = ?", [employeeId], (err) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // Then delete the employee
        db.run("DELETE FROM employees WHERE id = ?", [employeeId], function (err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (this.changes === 0) {
                res.status(404).json({ error: 'Employee not found' });
            } else {
                res.json({ message: 'Employee deleted successfully' });
            }
        });
    });
});

// ==================== LEAVE ROUTES ====================

// Get all leaves with employee information
app.get('/api/leaves', requireAuth, (req, res) => {
    const query = `
    SELECT 
      l.*,
      e.name as employee_name,
      e.department as employee_department
    FROM leaves l
    JOIN employees e ON l.employee_id = e.id
    ORDER BY l.created_at DESC
  `;

    db.all(query, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

// Get leaves for specific employee
app.get('/api/employees/:id/leaves', requireAuth, (req, res) => {
    const employeeId = req.params.id;

    db.all(
        "SELECT * FROM leaves WHERE employee_id = ? ORDER BY created_at DESC",
        [employeeId],
        (err, rows) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json(rows);
            }
        }
    );
});

// Add new leave
app.post('/api/leaves', requireAuth, (req, res) => {
    const { employeeId, startDate, endDate, reason, status } = req.body;

    if (!employeeId || !startDate || !endDate || !reason) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Get employee info
    db.get("SELECT * FROM employees WHERE id = ?", [employeeId], (err, employee) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
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

        // Check if employee has enough available leaves
        if (days > employee.available_leaves) {
            return res.status(400).json({
                error: `Insufficient leave balance. Available: ${employee.available_leaves}, Requested: ${days}`
            });
        }

        // Add leave
        db.run(
            "INSERT INTO leaves (employee_id, start_date, end_date, days, reason, status) VALUES (?, ?, ?, ?, ?, ?)",
            [employeeId, startDate, endDate, days, reason, status || 'approved'],
            function (err) {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                // Update employee's available leaves
                db.run(
                    "UPDATE employees SET available_leaves = available_leaves - ? WHERE id = ?",
                    [days, employeeId],
                    (err) => {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }

                        res.json({
                            id: this.lastID,
                            employee_id: parseInt(employeeId),
                            employee_name: employee.name,
                            employee_department: employee.department,
                            start_date: startDate,
                            end_date: endDate,
                            days,
                            reason,
                            status: status || 'approved',
                            created_at: new Date().toISOString()
                        });
                    }
                );
            }
        );
    });
});

// Delete leave
app.delete('/api/leaves/:id', requireAuth, (req, res) => {
    const leaveId = req.params.id;

    // Get leave info first
    db.get("SELECT * FROM leaves WHERE id = ?", [leaveId], (err, leave) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!leave) {
            return res.status(404).json({ error: 'Leave not found' });
        }

        // Delete leave
        db.run("DELETE FROM leaves WHERE id = ?", [leaveId], function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Restore employee's available leaves
            db.run(
                "UPDATE employees SET available_leaves = available_leaves + ? WHERE id = ?",
                [leave.days, leave.employee_id],
                (err) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }

                    res.json({ message: 'Leave deleted successfully and balance restored' });
                }
            );
        });
    });
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
app.post('/api/import-employees', requireAuth, upload.single('excelFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Read the uploaded Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        if (data.length === 0) {
            return res.status(400).json({ error: 'Excel file is empty' });
        }

        // Validate required columns
        const requiredColumns = ['name', 'department', 'total_leaves', 'available_leaves'];
        const firstRow = data[0];
        const missingColumns = requiredColumns.filter(col =>
            !Object.keys(firstRow).some(key => key.toLowerCase().includes(col.toLowerCase()))
        );

        if (missingColumns.length > 0) {
            return res.status(400).json({
                error: `Missing required columns: ${missingColumns.join(', ')}. Required columns: name, department, total_leaves, available_leaves`
            });
        }

        let imported = 0;
        let errors = [];

        // Process each row
        const processRow = (index) => {
            if (index >= data.length) {
                return res.json({
                    message: `Import completed. ${imported} employees imported successfully.`,
                    imported,
                    errors: errors.length > 0 ? errors : undefined
                });
            }

            const row = data[index];
            const name = row.name || row.Name || row.NAME;
            const department = row.department || row.Department || row.DEPARTMENT;
            const totalLeaves = parseInt(row.total_leaves || row['total leaves'] || row['Total Leaves'] || row.TOTAL_LEAVES);
            const availableLeaves = parseInt(row.available_leaves || row['available leaves'] || row['Available Leaves'] || row.AVAILABLE_LEAVES);

            // Validate row data
            if (!name || !totalLeaves || isNaN(totalLeaves)) {
                errors.push(`Row ${index + 2}: Missing or invalid name or total_leaves`);
                return processRow(index + 1);
            }

            if (isNaN(availableLeaves) || availableLeaves > totalLeaves) {
                errors.push(`Row ${index + 2}: Invalid available_leaves (should be <= total_leaves)`);
                return processRow(index + 1);
            }

            // Insert employee
            db.run(
                "INSERT INTO employees (name, department, total_leaves, available_leaves) VALUES (?, ?, ?, ?)",
                [name, department || 'Not Specified', totalLeaves, availableLeaves],
                function (err) {
                    if (err) {
                        errors.push(`Row ${index + 2}: Database error - ${err.message}`);
                    } else {
                        imported++;
                    }
                    processRow(index + 1);
                }
            );
        };

        processRow(0);

    } catch (error) {
        // Clean up uploaded file in case of error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Error processing Excel file: ' + error.message });
    }
});

// ==================== STATISTICS & REPORTS ====================

// Get dashboard statistics
app.get('/api/dashboard/stats', requireAuth, (req, res) => {
    const stats = {};

    // Get total employees
    db.get("SELECT COUNT(*) as total FROM employees", (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.totalEmployees = result.total;

        // Get total leaves taken this year
        db.get(`
      SELECT COUNT(*) as total, SUM(days) as totalDays 
      FROM leaves 
      WHERE strftime('%Y', created_at) = strftime('%Y', 'now')
    `, (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            stats.totalLeavesThisYear = result.total || 0;
            stats.totalDaysThisYear = result.totalDays || 0;

            // Get department statistics
            db.all(`
        SELECT 
          department,
          COUNT(*) as employee_count,
          SUM(total_leaves) as total_leaves,
          SUM(available_leaves) as available_leaves
        FROM employees 
        GROUP BY department
      `, (err, departments) => {
                if (err) return res.status(500).json({ error: err.message });
                stats.departments = departments;

                res.json(stats);
            });
        });
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 HR Leave Management System running on http://localhost:${PORT}`);
    console.log(`📊 Database: hr_system.db`);
    console.log(`🔐 Login with - Username: Reyam, Password: SugarHamburger`);
});