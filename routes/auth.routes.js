// backend/routes/auth.routes.js (COMPLETE with profile update)
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { requireAuth } = require('../middlewares/auth.middleware');

/**
 * @route   POST /api/auth-new/register
 * @desc    Register new user/organization
 * @access  Public
 */
router.post('/register', async (req, res) => {
  try {
    const { 
      email, 
      password, 
      firstName, 
      lastName, 
      companyName,
      billingEmail,
      stripeCustomerId,
      stripeSubscriptionId 
    } = req.body;
    
    // Validation
    if (!email || !password || !firstName || !lastName || !companyName) {
      return res.status(400).json({ 
        success: false,
        error: 'Please provide all required fields' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: 'An account with this email already exists' 
      });
    }
    
    // Create organization first
    const organization = new Organization({
      companyName: companyName,
      billingEmail: billingEmail || email,
      stripeCustomerId: stripeCustomerId,
      stripeSubscriptionId: stripeSubscriptionId,
      subscriptionStatus: 'active',
      currentUsers: 1,
      maxUsers: 5
    });
    
    await organization.save();
    
    // Create owner user
    const user = new User({
      email: email.toLowerCase(),
      password: password,
      firstName: firstName,
      lastName: lastName,
      name: `${firstName} ${lastName}`,
      organizationId: organization.organizationId,
      role: 'owner',
      isOwner: true,
      isActive: true,
      permissions: User.getDefaultPermissions('owner')
    });
    
    await user.save();
    
    // Update organization with ownerId
    organization.ownerId = user._id;
    await organization.save();
    
    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        organizationId: organization.organizationId,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      message: 'Account created successfully',
      token: token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        name: user.name,
        role: user.role,
        isOwner: user.isOwner,
        permissions: user.permissions,
        organizationId: organization.organizationId,
        organizationName: organization.companyName,
        businessName: organization.companyName,
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionStatus: organization.subscriptionStatus
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create account. Please try again.' 
    });
  }
});

/**
 * @route   POST /api/auth-new/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔍 Login attempt for:', email);
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Please provide email and password' 
      });
    }
    
    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Your account has been deactivated. Contact your administrator.' 
      });
    }
    
    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password' 
      });
    }
    
    // Fetch organization
    const organization = await Organization.findOne({ 
      organizationId: user.organizationId 
    });
    
    if (!organization) {
      return res.status(403).json({ 
        success: false,
        error: 'Organization not found. Contact support.' 
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        organizationId: user.organizationId,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login successful:', user.email);
    
    res.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName || user.name?.split(' ')[0] || '',
        lastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || '',
        fullName: (user.firstName && user.lastName) ? `${user.firstName} ${user.lastName}` : user.name,
        name: user.name || `${user.firstName} ${user.lastName}`,
        role: user.role,
        isOwner: user.isOwner,
        permissions: user.permissions,
        organizationId: user.organizationId,
        organizationName: organization.companyName,
        businessName: organization.companyName,
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionStatus: organization.subscriptionStatus,
        accessLevel: user.accessLevel || 'full'
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Login failed. Please try again.' 
    });
  }
});

/**
 * @route   GET /api/auth-new/me
 * @desc    Get current user info
 * @access  Private
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    const organization = await Organization.findOne({ 
      organizationId: user.organizationId 
    });
    
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        name: user.name,
        role: user.role,
        isOwner: user.isOwner,
        permissions: user.permissions,
        organizationId: user.organizationId,
        organizationName: organization?.companyName,
        businessName: organization?.companyName,
        subscriptionPlan: organization?.subscriptionPlan,
        subscriptionStatus: organization?.subscriptionStatus,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user information' 
    });
  }
});

/**
 * @route   PUT /api/auth-new/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { 
      name, 
      firstName, 
      lastName, 
      email, 
      phone, 
      address,
      businessName  // ✅ ADD: Accept businessName from frontend
    } = req.body;
    
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Update user fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (name !== undefined) user.name = name;
    
    // If firstName and lastName are updated, update name too
    if (firstName && lastName) {
      user.name = `${firstName} ${lastName}`;
    }
    
    await user.save();
    
    // ✅ ADD: Update organization if businessName is provided
    const organization = await Organization.findOne({ 
      organizationId: user.organizationId 
    });
    
    if (!organization) {
      return res.status(404).json({ 
        success: false,
        error: 'Organization not found' 
      });
    }
    
    // ✅ UPDATE: Save businessName to organization
    if (businessName !== undefined && user.isOwner) {
      organization.companyName = businessName;
      await organization.save();
      console.log('✅ Organization name updated to:', businessName);
    } else if (businessName !== undefined && !user.isOwner) {
      console.log('⚠️ Non-owner tried to update businessName');
    }
    
    console.log('✅ Profile updated for:', user.email);
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        name: user.name,
        role: user.role,
        isOwner: user.isOwner,
        permissions: user.permissions,
        organizationId: user.organizationId,
        organizationName: organization.companyName,  // ✅ Now returns updated value!
        businessName: organization.companyName,      // ✅ Now returns updated value!
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionStatus: organization.subscriptionStatus
      }
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update profile' 
    });
  }
});

/**
 * @route   PUT /api/auth-new/organization
 * @desc    Update organization details (owner only)
 * @access  Private
 */
router.put('/organization', requireAuth, async (req, res) => {
  try {
    const { companyName, billingEmail } = req.body;
    
    // Check if user is owner
    if (!req.user.isOwner) {
      return res.status(403).json({ 
        success: false,
        error: 'Only the account owner can update organization details' 
      });
    }
    
    const organization = await Organization.findOne({ 
      organizationId: req.organizationId 
    });
    
    if (!organization) {
      return res.status(404).json({ 
        success: false,
        error: 'Organization not found' 
      });
    }
    
    // Update organization fields
    if (companyName) organization.companyName = companyName;
    if (billingEmail) organization.billingEmail = billingEmail;
    
    await organization.save();
    
    console.log('✅ Organization updated:', organization.organizationId);
    
    res.json({
      success: true,
      message: 'Organization updated successfully',
      organization: {
        organizationId: organization.organizationId,
        companyName: organization.companyName,
        billingEmail: organization.billingEmail,
        subscriptionPlan: organization.subscriptionPlan,
        subscriptionStatus: organization.subscriptionStatus
      }
    });
    
  } catch (error) {
    console.error('Update organization error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update organization' 
    });
  }
});

/**
 * @route   POST /api/auth-new/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', requireAuth, async (req, res) => {
  console.log('👋 User logged out:', req.user.email);
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

module.exports = router;