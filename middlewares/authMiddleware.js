const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {

        // get token from header
        token = req.headers.authorization.split(' ')[1];

        // verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // get user from token
        req.user = await User.findById(decoded.id).select('-password');

  
        next();

        } catch (error) {
            return res.status(401).json({message: 'Not authorized, token failed' });

        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// Access control middleware - checks if user has paid access
const requireAccess = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        
        // Update last login tracking
        req.user.lastLoginAt = new Date();
        req.user.loginCount = (req.user.loginCount || 0) + 1;
        await req.user.save();
        
        // Check if user has access using the method we added to User model
        if (!req.user.hasAccess()) {
            return res.status(403).json({ 
                message: 'Access denied',
                accessMessage: req.user.getAccessMessage(),
                accessLevel: req.user.accessLevel,
                subscriptionStatus: req.user.subscriptionStatus,
                requiresDemoBooking: true
            });
        }
        
        next();
    } catch (error) {
        console.error('Access control error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Admin only middleware
const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        
        if (req.user.accessLevel !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }
        
        next();
    } catch (error) {
        console.error('Admin access error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Sales team middleware
const requireSalesAccess = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        
        if (!['admin', 'sales'].includes(req.user.accessLevel)) {
            return res.status(403).json({ message: 'Sales access required' });
        }
        
        next();
    } catch (error) {
        console.error('Sales access error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Export all functions - UPDATE THIS LINE
module.exports = { 
    protect, 
    requireAccess, 
    requireAdmin, 
    requireSalesAccess 
};
