const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'employees-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and Excel files are allowed'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

// POST /upload/employees - Upload and process employee file
router.post('/employees', requireAuth, upload.single('employeeFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const fileExt = path.extname(req.file.originalname).toLowerCase();

        let employees = [];

        try {
            if (fileExt === '.csv') {
                employees = await processCSV(filePath);
            } else if (fileExt === '.xlsx' || fileExt === '.xls') {
                employees = await processExcel(filePath);
            } else {
                throw new Error('Unsupported file format');
            }

            // Clean up uploaded file
            fs.unlinkSync(filePath);

            if (employees.length === 0) {
                return res.status(400).json({ error: 'No valid employee data found in file' });
            }

            // Validate and insert employees
            const result = await insertEmployees(employees);

            res.json({
                success: true,
                message: `Successfully imported ${result.imported} employees`,
                imported: result.imported,
                skipped: result.skipped,
                errors: result.errors
            });

        } catch (processingError) {
            // Clean up uploaded file on error
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            throw processingError;
        }

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message || 'Error processing file' });
    }
});

// Process CSV file
function processCSV(filePath) {
    return new Promise((resolve, reject) => {
        const employees = [];

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                employees.push(data);
            })
            .on('end', () => {
                resolve(employees);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}

// Process Excel file
function processExcel(filePath) {
    return new Promise((resolve, reject) => {
        try {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON
            const employees = xlsx.utils.sheet_to_json(worksheet);

            resolve(employees);
        } catch (error) {
            reject(error);
        }
    });
}

// Insert employees into database
async function insertEmployees(employeesData) {
    const requiredFields = ['name', 'department', 'total_leaves', 'available_leaves'];
    const validEmployees = [];
    const errors = [];
    let skipped = 0;

    for (let i = 0; i < employeesData.length; i++) {
        const emp = employeesData[i];
        const rowNum = i + 2; // Assuming first row is header

        try {
            // Check for required fields
            const missing = requiredFields.filter(field => {
                const value = emp[field];
                return !value || value.toString().trim() === '';
            });

            if (missing.length > 0) {
                errors.push(`Row ${rowNum}: Missing required fields: ${missing.join(', ')}`);
                skipped++;
                continue;
            }

            // Validate and convert data types
            const totalLeaves = parseInt(emp.total_leaves);
            const availableLeaves = parseInt(emp.available_leaves);

            if (isNaN(totalLeaves) || isNaN(availableLeaves)) {
                errors.push(`Row ${rowNum}: Invalid number format for leave values`);
                skipped++;
                continue;
            }

            if (availableLeaves > totalLeaves) {
                errors.push(`Row ${rowNum}: Available leaves cannot exceed total leaves`);
                skipped++;
                continue;
            }

            validEmployees.push({
                name: emp.name.toString().trim(),
                department: emp.department.toString().trim(),
                total_leaves: totalLeaves,
                available_leaves: availableLeaves
            });

        } catch (error) {
            errors.push(`Row ${rowNum}: ${error.message}`);
            skipped++;
        }
    }

    let imported = 0;

    if (validEmployees.length > 0) {
        try {
            const { data: insertedEmployees, error } = await supabase
                .from('employees')
                .insert(validEmployees)
                .select();

            if (error) {
                throw new Error(`Database error: ${error.message}`);
            }

            imported = insertedEmployees.length;
        } catch (dbError) {
            errors.push(`Database error: ${dbError.message}`);
        }
    }

    return {
        imported,
        skipped,
        errors
    };
}

module.exports = router;