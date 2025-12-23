// backend/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Generate JWT token
const generateToken = (userId, organizationId, role, email) => {
  return jwt.sign(
    {
      userId,
      organizationId,
      role,
      email
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, businessName } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create user
    const user = new User({
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      password: password, // Will be hashed by pre-save hook
      businessName: businessName || name || email.split('@')[0],
      // Legacy fields for backward compatibility
      accessLevel: 'full',
      subscriptionStatus: 'active'
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id, null, 'user', user.email);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        businessName: user.businessName
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('🔍 Login attempt for:', email);

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    
    console.log('🔍 User found:', !!user);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    console.log('🔍 User has password:', !!user.password);
    console.log('🔍 Password length in DB:', user.password?.length);
    console.log('🔍 Provided password:', password);

    // Compare password using bcrypt directly (compatible with new User model)
    let isPasswordValid = false;
    
    try {
      // Try the new method first (from updated User model)
      if (typeof user.comparePassword === 'function') {
        console.log('🔍 Using comparePassword method');
        isPasswordValid = await user.comparePassword(password);
      } else {
        // Fallback to direct bcrypt comparison
        console.log('🔍 Using direct bcrypt.compare');
        isPasswordValid = await bcrypt.compare(password, user.password);
      }
    } catch (compareError) {
      console.error('❌ Password comparison error:', compareError);
      return res.status(500).json({ message: 'Authentication error' });
    }

    console.log('🔍 Password valid:', isPasswordValid);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active (if using new User model)
    if (user.isActive === false) {
      return res.status(403).json({ 
        message: 'Your account has been deactivated. Contact your administrator.' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(
      user._id, 
      user.organizationId || null, 
      user.role || 'user', 
      user.email
    );

    console.log('✅ Login successful for:', user.email);

    // Return user info
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        businessName: user.businessName,
        // New fields (if they exist)
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.name,
        role: user.role || 'user',
        isOwner: user.isOwner || false,
        permissions: user.permissions || {},
        organizationId: user.organizationId || null,
        organizationName: user.organizationName || user.businessName,
        subscriptionPlan: user.subscriptionPlan || 'starter',
        subscriptionStatus: user.subscriptionStatus || 'active',
        accessLevel: user.accessLevel || 'full'
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        businessName: user.businessName,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.name,
        role: user.role || 'user',
        isOwner: user.isOwner || false,
        permissions: user.permissions || {},
        organizationId: user.organizationId || null,
        organizationName: user.organizationName || user.businessName,
        subscriptionPlan: user.subscriptionPlan || 'starter',
        subscriptionStatus: user.subscriptionStatus || 'active',
        accessLevel: user.accessLevel || 'full'
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Logout user (client-side mainly)
// @route   POST /api/auth/logout
// @access  Private
exports.logoutUser = (req, res) => {
  // In JWT system, logout is handled client-side by removing token
  // But we can log it for analytics
  console.log('👋 User logged out:', req.user?.email);
  
  res.json({ message: 'Logged out successfully' });
};

module.exports = {
  registerUser: exports.registerUser,
  loginUser: exports.loginUser,
  getMe: exports.getMe,
  logoutUser: exports.logoutUser
};