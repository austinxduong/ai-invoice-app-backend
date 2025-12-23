// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // CRITICAL: Which organization does this user belong to?
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  
  // Login Credentials
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  
  // User Information
  firstName: {
    type: String,
    // required: true,
    trim: true
  },
  lastName: {
    type: String,
    // required: true,
    trim: true
  },
  
  // Role & Permissions
  role: {
    type: String,
    enum: ['owner', 'admin', 'manager', 'user', 'accountant'],
    default: 'user'
  },
  
  permissions: {
    canManageInvoices: {
      type: Boolean,
      default: true
    },
    canManageProducts: {
      type: Boolean,
      default: true
    },
    canManageCustomers: {
      type: Boolean,
      default: true
    },
    canViewReports: {
      type: Boolean,
      default: true
    },
    canManageUsers: {
      type: Boolean,
      default: false // Only owner/admin
    },
    canManageBilling: {
      type: Boolean,
      default: false // Only owner
    },
    canManageSettings: {
      type: Boolean,
      default: false // Only owner/admin
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isOwner: {
    type: Boolean,
    default: false // First person who created the account
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  
  // Invitation tracking (for team members)
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  inviteToken: {
    type: String,
    default: null
  },
  inviteTokenExpiry: {
    type: Date,
    default: null
  },
  
  // Metadata
  lastLogin: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Legacy fields (for backwards compatibility with your existing data)
  name: String, // Keep for now
  businessName: String, // Keep for now
  accessLevel: String, // Keep for now
  subscriptionStatus: String, // Keep for now
  paymentCompleted: Boolean, // Keep for now
  accountCreatedFromPayment: Boolean, // Keep for now
  stripeCustomerId: String // Keep for now (will move to Organization)
});

// Compound indexes
// Email must be unique PER organization (not globally!)
userSchema.index({ email: 1, organizationId: 1 }, { unique: true });
userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, isActive: 1 });
userSchema.index({ inviteToken: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update timestamp on save
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user can perform action
userSchema.methods.canPerformAction = function(action) {
  const permissionMap = {
    'manage_invoices': this.permissions.canManageInvoices,
    'manage_products': this.permissions.canManageProducts,
    'manage_customers': this.permissions.canManageCustomers,
    'view_reports': this.permissions.canViewReports,
    'manage_users': this.permissions.canManageUsers,
    'manage_billing': this.permissions.canManageBilling,
    'manage_settings': this.permissions.canManageSettings
  };
  
  return permissionMap[action] || false;
};

// Static method to set default permissions by role
userSchema.statics.getDefaultPermissions = function(role) {
  const permissionsByRole = {
    owner: {
      canManageInvoices: true,
      canManageProducts: true,
      canManageCustomers: true,
      canViewReports: true,
      canManageUsers: true,
      canManageBilling: true,
      canManageSettings: true
    },
    admin: {
      canManageInvoices: true,
      canManageProducts: true,
      canManageCustomers: true,
      canViewReports: true,
      canManageUsers: true,
      canManageBilling: false,
      canManageSettings: true
    },
    manager: {
      canManageInvoices: true,
      canManageProducts: true,
      canManageCustomers: true,
      canViewReports: true,
      canManageUsers: false,
      canManageBilling: false,
      canManageSettings: false
    },
    user: {
      canManageInvoices: true,
      canManageProducts: true,
      canManageCustomers: true,
      canViewReports: false,
      canManageUsers: false,
      canManageBilling: false,
      canManageSettings: false
    },
    accountant: {
      canManageInvoices: true,
      canManageProducts: false,
      canManageCustomers: false,
      canViewReports: true,
      canManageUsers: false,
      canManageBilling: false,
      canManageSettings: false
    }
  };
  
  return permissionsByRole[role] || permissionsByRole.user;
};

module.exports = mongoose.model('User', userSchema);
