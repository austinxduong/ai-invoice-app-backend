// backend/models/Organization.js
const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  // Unique Customer Code (auto-generated)
  organizationId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    default: function() {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 6).toUpperCase();
      return `ORG-${timestamp}-${random}`;
    }
    // Example: ORG-1703012345678-A7F3D2
  },
  
  // Company Information
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  industry: {
    type: String,
    default: 'cannabis'
  },
  
  // Billing Information
  billingEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  stripeCustomerId: {
    type: String,
    default: null
  },
  stripeSubscriptionId: {
    type: String,
    default: null
  },
  
  // Subscription Details
  subscriptionPlan: {
    type: String,
    enum: ['starter', 'professional', 'enterprise'],
    default: 'starter'
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'trial', 'past_due', 'canceled', 'trialing'],
    default: 'trialing'
  },
  
  // User License Management
  maxUsers: {
    type: Number,
    default: 1,
    min: 1
  },
  currentUsers: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Pricing
  basePlan: {
    type: Number,
    default: 299 // $299/month base price
  },
  pricePerUser: {
    type: Number,
    default: 149 // $149 per additional user
  },
  
  // Owner Information (first person who paid)
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Trial & Dates
  trialEndsAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Settings
  settings: {
    timezone: {
      type: String,
      default: 'America/Los_Angeles'
    },
    currency: {
      type: String,
      default: 'USD'
    },
    dateFormat: {
      type: String,
      default: 'MM/DD/YYYY'
    },
    logo: {
      type: String,
      default: null
    }
  },
  
  // Feature flags (for different plans)
  features: {
    hasAdvancedReporting: {
      type: Boolean,
      default: false
    },
    hasApiAccess: {
      type: Boolean,
      default: false
    },
    hasMultiLocation: {
      type: Boolean,
      default: false
    },
    hasCustomIntegrations: {
      type: Boolean,
      default: false
    }
  },
  
  // For testing purposes
  isTestData: {
    type: Boolean,
    default: function() {
      return process.env.NODE_ENV !== 'production';
    }
  }
});

// Indexes for performance
organizationSchema.index({ billingEmail: 1 });
organizationSchema.index({ stripeCustomerId: 1 });
organizationSchema.index({ subscriptionStatus: 1 });

// Methods
organizationSchema.methods.calculateMonthlyPrice = function() {
  if (this.currentUsers <= 1) {
    return this.basePlan;
  }
  
  const additionalUsers = this.currentUsers - 1;
  return this.basePlan + (additionalUsers * this.pricePerUser);
};

organizationSchema.methods.canAddUser = function() {
  return this.currentUsers < this.maxUsers;
};

organizationSchema.methods.incrementUserCount = async function() {
  if (!this.canAddUser()) {
    throw new Error(`Maximum user limit of ${this.maxUsers} reached`);
  }
  this.currentUsers += 1;
  await this.save();
};

organizationSchema.methods.decrementUserCount = async function() {
  if (this.currentUsers > 0) {
    this.currentUsers -= 1;
    await this.save();
  }
};

// Update timestamp on save
organizationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Organization', organizationSchema);