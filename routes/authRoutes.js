// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');

// Import auth controller functions
const {
  registerUser,
  loginUser,
  getMe,
  logoutUser
} = require('../controllers/authController');

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', registerUser);

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', loginUser);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, getMe);

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', protect, logoutUser);

module.exports = router;