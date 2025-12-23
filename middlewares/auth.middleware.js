// backend/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');

/**
 * Middleware to verify JWT token and extract user + organization info
 * Attaches: req.userId, req.organizationId, req.userRole, req.user, req.organization
 */
const requireAuth = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'No token provided. Please login.' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          success: false,
          error: 'Token expired. Please login again.' 
        });
      }
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token. Please login again.' 
      });
    }
    
    // Fetch user from database
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'User not found. Please login again.' 
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Your account has been deactivated. Contact your administrator.' 
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
    
    // Check subscription status
    if (organization.subscriptionStatus === 'canceled') {
      return res.status(403).json({ 
        success: false,
        error: 'Your subscription has been canceled. Please renew to continue.' 
      });
    }
    
    if (organization.subscriptionStatus === 'past_due') {
      return res.status(403).json({ 
        success: false,
        error: 'Your subscription payment is past due. Please update your payment method.' 
      });
    }
    
    // Attach to request object
    req.userId = user._id;
    req.organizationId = user.organizationId;
    req.userRole = user.role;
    req.user = user;
    req.organization = organization;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Authentication error. Please try again.' 
    });
  }
};

/**
 * Middleware to check if user has specific permission
 * Usage: requirePermission('canManageInvoices')
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required.' 
      });
    }
    
    // Owners can do everything
    if (req.user.isOwner) {
      return next();
    }
    
    // Check specific permission
    if (!req.user.permissions[permission]) {
      return res.status(403).json({ 
        success: false,
        error: 'You do not have permission to perform this action.' 
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user has specific role
 * Usage: requireRole(['owner', 'admin'])
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required.' 
      });
    }
    
    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        error: `This action requires ${allowedRoles.join(' or ')} role.` 
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user is the owner
 */
const requireOwner = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required.' 
    });
  }
  
  if (!req.user.isOwner) {
    return res.status(403).json({ 
      success: false,
      error: 'Only the account owner can perform this action.' 
    });
  }
  
  next();
};

/**
 * Optional auth - doesn't fail if no token, but adds user info if available
 * Useful for public endpoints that behave differently for logged-in users
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without auth
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (user && user.isActive) {
        req.userId = user._id;
        req.organizationId = user.organizationId;
        req.userRole = user.role;
        req.user = user;
        
        const organization = await Organization.findOne({ 
          organizationId: user.organizationId 
        });
        req.organization = organization;
      }
    } catch (error) {
      // Invalid token, but don't fail - just continue without auth
    }
    
    next();
  } catch (error) {
    next(); // Continue without auth on error
  }
};

module.exports = {
  requireAuth,
  requirePermission,
  requireRole,
  requireOwner,
  optionalAuth
};