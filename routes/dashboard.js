const express = require('express');
const supabase = require('../config/supabase');
const router = express.Router();

// Middleware to check authentication and session timeout
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/');
    }

    // Check session timeout (24 hours)
    const loginTime = new Date(req.session.user.loginTime);
    const currentTime = new Date();
    const timeDifference = currentTime - loginTime;
    const hoursDifference = timeDifference / (1000 * 60 * 60); // Convert to hours

    if (hoursDifference > 24) {
        console.log(`Session expired for user ${req.session.user.username}`);
        req.session.destroy((err) => {
            if (err) console.error('Session destruction error:', err);
        });
        return res.redirect('/');
    }

    next();
};

// Apply auth middleware to all dashboard routes
router.use(requireAuth);

// GET /dashboard - Dashboard home
router.get('/', async (req, res) => {
    try {
        // Get employees with their leave statistics
        const { data: employees, error: employeesError } = await supabase
            .from('employees')
            .select('*')
            .order('name', { ascending: true });

        if (employeesError) {
            console.error('Error fetching employees:', employeesError);
            return res.render('dashboard', {
                title: 'Dashboard - HR Leave Management',
                user: req.session.user,
                employees: [],
                error: 'Error loading employees data'
            });
        }

        // Get leave statistics
        const { data: leaveStats, error: leaveStatsError } = await supabase
            .rpc('get_leave_statistics');

        const stats = {
            totalEmployees: employees?.length || 0,
            activeLeaves: 0,
            pendingRequests: 0,
            thisMonth: 0
        };

        res.render('dashboard', {
            title: 'Dashboard - HR Leave Management',
            user: req.session.user,
            employees: employees || [],
            stats,
            error: null
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('dashboard', {
            title: 'Dashboard - HR Leave Management',
            user: req.session.user,
            employees: [],
            stats: { totalEmployees: 0, activeLeaves: 0, pendingRequests: 0, thisMonth: 0 },
            error: 'An error occurred loading the dashboard'
        });
    }
});

// GET /dashboard/employees - Employee management page
router.get('/employees', async (req, res) => {
    try {
        const { data: employees, error } = await supabase
            .from('employees')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching employees:', error);
            return res.render('employees', {
                title: 'Employee Management - HR Leave Management',
                user: req.session.user,
                employees: [],
                error: 'Error loading employees data'
            });
        }

        res.render('employees', {
            title: 'Employee Management - HR Leave Management',
            user: req.session.user,
            employees: employees || [],
            error: null
        });

    } catch (error) {
        console.error('Employees page error:', error);
        res.render('employees', {
            title: 'Employee Management - HR Leave Management',
            user: req.session.user,
            employees: [],
            error: 'An error occurred loading employees'
        });
    }
});

// GET /dashboard/employee/:id/leaves - Get employee leave details
router.get('/employee/:id/leaves', async (req, res) => {
    try {
        const employeeId = req.params.id;

        // Get employee info
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (empError || !employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // Get employee leaves
        const { data: leaves, error: leavesError } = await supabase
            .from('leaves')
            .select('*')
            .eq('employee_id', employeeId)
            .order('created_at', { ascending: false });

        if (leavesError) {
            return res.status(500).json({ error: 'Error fetching leaves' });
        }

        res.json({
            employee,
            leaves: leaves || []
        });

    } catch (error) {
        console.error('Employee leaves error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /dashboard/add-leave - Add leave for employee
router.post('/add-leave', async (req, res) => {
    try {
        const { employee_id, start_date, end_date, days, reason } = req.body;

        // Validate input
        if (!employee_id || !start_date || !end_date || !days || !reason) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Convert to integers
        const employeeId = parseInt(employee_id);
        const leaveDays = parseInt(days);

        if (isNaN(employeeId) || isNaN(leaveDays) || leaveDays <= 0) {
            return res.status(400).json({ error: 'Invalid employee ID or number of days' });
        }

        // Check if employee exists and has enough leaves
        const { data: employee, error: empError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (empError) {
            console.error('Error fetching employee:', empError);
            return res.status(500).json({ error: 'Error fetching employee data' });
        }

        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        if (employee.available_leaves < leaveDays) {
            return res.status(400).json({
                error: `Insufficient available leaves. Employee has ${employee.available_leaves} days available, but ${leaveDays} days requested.`
            });
        }

        // Validate dates
        const startDateObj = new Date(start_date);
        const endDateObj = new Date(end_date);

        if (startDateObj > endDateObj) {
            return res.status(400).json({ error: 'Start date cannot be after end date' });
        }

        // Add the leave record
        const { data: newLeave, error: leaveError } = await supabase
            .from('leaves')
            .insert([{
                employee_id: employeeId,
                start_date,
                end_date,
                days: leaveDays,
                reason,
                status: 'approved'
            }])
            .select()
            .single();

        if (leaveError) {
            console.error('Error adding leave:', leaveError);
            return res.status(500).json({ error: 'Error adding leave record' });
        }

        // Update employee's available leaves
        const newAvailableLeaves = employee.available_leaves - leaveDays;
        const { error: updateError } = await supabase
            .from('employees')
            .update({
                available_leaves: newAvailableLeaves
            })
            .eq('id', employeeId);

        if (updateError) {
            console.error('Error updating employee leaves:', updateError);
            // Rollback the leave addition if update fails
            await supabase.from('leaves').delete().eq('id', newLeave.id);
            return res.status(500).json({ error: 'Error updating employee leave balance' });
        }

        console.log(`Leave added successfully for employee ${employee.name}: ${leaveDays} days for ${reason}`);

        res.json({
            success: true,
            message: `Leave added successfully! ${employee.name} now has ${newAvailableLeaves} days remaining.`,
            leave: newLeave,
            remaining_leaves: newAvailableLeaves
        });

    } catch (error) {
        console.error('Add leave error:', error);
        res.status(500).json({ error: 'Server error occurred while adding leave' });
    }
});

// GET /dashboard/download-template - Download employee import template
router.get('/download-template', (req, res) => {
    const csvContent = 'name,department,total_leaves,available_leaves\n' +
        'أحمد محمد,تقنية المعلومات,25,25\n' +
        'فاطمة علي,الموارد البشرية,30,30\n' +
        'John Smith,Finance,25,25\n' +
        'سارة أحمد,التسويق,28,28';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=employee_import_template.csv');
    res.send('\uFEFF' + csvContent); // Add BOM for proper UTF-8 encoding
});

// GET /dashboard/export-employees - Export employees to Excel
router.get('/export-employees', async (req, res) => {
    try {
        const { data: employees, error } = await supabase
            .from('employees')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            return res.status(500).json({ error: 'Error fetching employees' });
        }

        // Convert to CSV format with proper UTF-8 encoding
        let csvContent = 'Name,Department,Total Leaves,Available Leaves,Used Leaves\n';
        employees.forEach(emp => {
            const usedLeaves = emp.total_leaves - emp.available_leaves;
            csvContent += `"${emp.name}","${emp.department}",${emp.total_leaves},${emp.available_leaves},${usedLeaves}\n`;
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=employees_export.csv');
        res.send('\uFEFF' + csvContent); // Add BOM for proper UTF-8 encoding

    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /dashboard/import-employees - Import employees from file
router.post('/import-employees', async (req, res) => {
    try {
        const { employees } = req.body;

        if (!employees || !Array.isArray(employees)) {
            return res.status(400).json({ error: 'Invalid employee data' });
        }

        // Validate required fields
        const requiredFields = ['name', 'department', 'total_leaves', 'available_leaves'];
        const validEmployees = [];

        for (const emp of employees) {
            const missing = requiredFields.filter(field => !emp[field]);
            if (missing.length === 0) {
                validEmployees.push({
                    name: emp.name.trim(),
                    department: emp.department.trim(),
                    total_leaves: parseInt(emp.total_leaves),
                    available_leaves: parseInt(emp.available_leaves)
                });
            }
        }

        if (validEmployees.length === 0) {
            return res.status(400).json({ error: 'No valid employee records found' });
        }

        // Insert employees into database
        const { data: insertedEmployees, error } = await supabase
            .from('employees')
            .insert(validEmployees)
            .select();

        if (error) {
            console.error('Error importing employees:', error);
            return res.status(500).json({ error: 'Error importing employees' });
        }

        res.json({
            success: true,
            message: `Successfully imported ${insertedEmployees.length} employees`,
            imported: insertedEmployees.length,
            skipped: employees.length - validEmployees.length
        });

    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: 'Server error during import' });
    }
});

// DELETE /dashboard/employee/:id - Delete employee
router.delete('/employee/:id', async (req, res) => {
    try {
        const employeeId = parseInt(req.params.id);

        if (isNaN(employeeId)) {
            return res.status(400).json({ error: 'Invalid employee ID' });
        }

        // First, check if employee exists
        const { data: employee, error: fetchError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .single();

        if (fetchError || !employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // Check if employee has any leaves (optional warning)
        const { data: leaves, error: leavesError } = await supabase
            .from('leaves')
            .select('id')
            .eq('employee_id', employeeId);

        if (leavesError) {
            console.error('Error checking employee leaves:', leavesError);
        }

        const leaveCount = leaves ? leaves.length : 0;

        // Delete the employee (cascade will delete leaves automatically due to foreign key)
        const { error: deleteError } = await supabase
            .from('employees')
            .delete()
            .eq('id', employeeId);

        if (deleteError) {
            console.error('Error deleting employee:', deleteError);
            return res.status(500).json({ error: 'Error deleting employee' });
        }

        console.log(`Employee ${employee.name} (ID: ${employeeId}) deleted successfully. ${leaveCount} leave records also removed.`);

        res.json({
            success: true,
            message: `Employee "${employee.name}" deleted successfully.`,
            deleted_leaves: leaveCount
        });

    } catch (error) {
        console.error('Delete employee error:', error);
        res.status(500).json({ error: 'Server error occurred while deleting employee' });
    }
});

// GET /dashboard/leave-reasons - Get available leave reasons from database
router.get('/leave-reasons', async (req, res) => {
    try {
        // Get distinct reasons from existing leaves
        const { data: existingReasons, error } = await supabase
            .from('leaves')
            .select('reason')
            .not('reason', 'is', null);

        if (error) {
            console.error('Error fetching leave reasons:', error);
        }

        // Extract unique reasons and combine with default ones
        const dbReasons = existingReasons ? [...new Set(existingReasons.map(l => l.reason))] : [];
        const defaultReasons = ['Personal', 'Medical', 'Vacation', 'Emergency', 'Family', 'Sick Leave', 'Maternity', 'Paternity', 'Study Leave', 'Other'];

        // Combine and remove duplicates
        const allReasons = [...new Set([...defaultReasons, ...dbReasons])].sort();

        res.json({
            success: true,
            reasons: allReasons
        });

    } catch (error) {
        console.error('Leave reasons error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;