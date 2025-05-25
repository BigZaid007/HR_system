const express = require('express');
const bcrypt = require('bcrypt');
const supabase = require('../config/supabase');

const router = express.Router();

// Middleware to check if user is already logged in
const redirectIfLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    next();
};

// GET / - Login page (root route)
router.get('/', redirectIfLoggedIn, (req, res) => {
    res.render('login', {
        title: 'Login - HR Leave Management',
        error: req.session.error || null
    });
    delete req.session.error; // Clear error after displaying
});

// POST /login - Handle login
router.post('/login', redirectIfLoggedIn, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            req.session.error = 'Please provide both username and password';
            return res.redirect('/');
        }

        // Query user from Supabase
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .limit(1);

        if (error) {
            console.error('Supabase error:', error);
            req.session.error = 'Database error occurred';
            return res.redirect('/');
        }

        if (!users || users.length === 0) {
            req.session.error = 'Invalid username or password';
            return res.redirect('/');
        }

        const user = users[0];

        // For this implementation, we're checking plain text password
        // In production, you should hash passwords and use bcrypt.compare()
        if (password !== user.password) {
            req.session.error = 'Invalid username or password';
            return res.redirect('/');
        }

        // Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            loginTime: new Date()
        };

        console.log(`User ${username} logged in successfully`);
        res.redirect('/dashboard');

    } catch (error) {
        console.error('Login error:', error);
        req.session.error = 'An error occurred during login';
        res.redirect('/');
    }
});

// GET /logout - Handle logout
router.get('/logout', (req, res) => {
    if (req.session.user) {
        console.log(`User ${req.session.user.username} logged out`);
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.clearCookie('connect.sid'); // Clear session cookie
        res.redirect('/');
    });
});

module.exports = router;