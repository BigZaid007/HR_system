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
                errors: result.errors,
                duplicates: result.duplicates
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

// Process CSV file with proper UTF-8 encoding
function processCSV(filePath) {
    return new Promise((resolve, reject) => {
        const employees = [];

        // Read file with UTF-8 encoding and detect BOM
        let fileContent = fs.readFileSync(filePath, 'utf8');

        // Remove BOM if present
        if (fileContent.charCodeAt(0) === 0xFEFF) {
            fileContent = fileContent.slice(1);
        }

        // Write cleaned content back to temporary file
        const tempPath = filePath + '.temp';
        fs.writeFileSync(tempPath, fileContent, 'utf8');

        fs.createReadStream(tempPath, { encoding: 'utf8' })
            .pipe(csv({
                skipEmptyLines: true,
                skipLinesWithError: true
            }))
            .on('data', (data) => {
                // Clean up any encoding issues
                const cleanData = {};
                Object.keys(data).forEach(key => {
                    const cleanKey = key.trim();
                    const cleanValue = data[key] ? data[key].toString().trim() : '';
                    cleanData[cleanKey] = cleanValue;
                });
                employees.push(cleanData);
            })
            .on('end', () => {
                // Clean up temp file
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
                resolve(employees);
            })
            .on('error', (error) => {
                // Clean up temp file
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
                reject(error);
            });
    });
}

// Process Excel file with proper encoding
function processExcel(filePath) {
    return new Promise((resolve, reject) => {
        try {
            const workbook = xlsx.readFile(filePath, {
                type: 'file',
                codepage: 65001, // UTF-8
                cellText: true,
                cellDates: true
            });

            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON with proper encoding
            const employees = xlsx.utils.sheet_to_json(worksheet, {
                defval: '',
                blankrows: false,
                raw: false // This ensures text is properly formatted
            });

            // Clean up the data
            const cleanedEmployees = employees.map(emp => {
                const cleanData = {};
                Object.keys(emp).forEach(key => {
                    const cleanKey = key.trim();
                    const cleanValue = emp[key] ? emp[key].toString().trim() : '';
                    cleanData[cleanKey] = cleanValue;
                });
                return cleanData;
            });

            resolve(cleanedEmployees);
        } catch (error) {
            reject(error);
        }
    });
}

// Insert employees into database with duplicate checking
async function insertEmployees(employeesData) {
    const requiredFields = ['name', 'department', 'total_leaves', 'available_leaves'];
    const validEmployees = [];
    const errors = [];
    const duplicates = [];
    let skipped = 0;

    // Get existing employees to check for duplicates
    const { data: existingEmployees, error: fetchError } = await supabase
        .from('employees')
        .select('name, department');

    if (fetchError) {
        throw new Error(`Error fetching existing employees: ${fetchError.message}`);
    }

    // Create a Set for faster duplicate checking (name + department combination)
    const existingEmployeesSet = new Set(
        existingEmployees.map(emp =>
            `${emp.name.toLowerCase().trim()}|${emp.department.toLowerCase().trim()}`
        )
    );

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

            // Clean and validate data - ensure proper UTF-8 handling
            const cleanName = emp.name.toString().trim();
            const cleanDepartment = emp.department.toString().trim();
            const totalLeaves = parseInt(emp.total_leaves);
            const availableLeaves = parseInt(emp.available_leaves);

            // Validate name and department are not empty after cleaning
            if (!cleanName || !cleanDepartment) {
                errors.push(`Row ${rowNum}: Name and department cannot be empty`);
                skipped++;
                continue;
            }

            // Validate data types
            if (isNaN(totalLeaves) || isNaN(availableLeaves)) {
                errors.push(`Row ${rowNum}: Invalid number format for leave values`);
                skipped++;
                continue;
            }

            if (availableLeaves > totalLeaves) {
                errors.push(`Row ${rowNum}: Available leaves (${availableLeaves}) cannot exceed total leaves (${totalLeaves})`);
                skipped++;
                continue;
            }

            if (totalLeaves < 0 || availableLeaves < 0) {
                errors.push(`Row ${rowNum}: Leave values cannot be negative`);
                skipped++;
                continue;
            }

            // Check for duplicates (name + department combination)
            const employeeKey = `${cleanName.toLowerCase()}|${cleanDepartment.toLowerCase()}`;

            if (existingEmployeesSet.has(employeeKey)) {
                duplicates.push(`${cleanName} (${cleanDepartment})`);
                errors.push(`Row ${rowNum}: Employee "${cleanName}" in department "${cleanDepartment}" already exists`);
                skipped++;
                continue;
            }

            // Add to existing set to prevent duplicates within the import file itself
            existingEmployeesSet.add(employeeKey);

            validEmployees.push({
                name: cleanName,
                department: cleanDepartment,
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
            // Insert employees in batches to avoid timeout
            const batchSize = 50;
            let allInsertedEmployees = [];

            for (let i = 0; i < validEmployees.length; i += batchSize) {
                const batch = validEmployees.slice(i, i + batchSize);

                const { data: insertedEmployees, error } = await supabase
                    .from('employees')
                    .insert(batch)
                    .select();

                if (error) {
                    throw new Error(`Database error: ${error.message}`);
                }

                allInsertedEmployees = allInsertedEmployees.concat(insertedEmployees);
            }

            imported = allInsertedEmployees.length;
        } catch (dbError) {
            errors.push(`Database error: ${dbError.message}`);
        }
    }

    return {
        imported,
        skipped,
        errors,
        duplicates: duplicates.length > 0 ? duplicates : null
    };
}

module.exports = router;