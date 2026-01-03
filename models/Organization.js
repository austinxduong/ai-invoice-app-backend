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
  
  // ========== TIMEZONE CONFIGURATION ==========
  timezone: {
    type: String,
    default: 'America/Los_Angeles',
    enum: [
      // US Cannabis States (grouped by timezone)
      
      // Pacific Time (PST/PDT UTC-8/-7)
      'America/Los_Angeles',    // CA, NV, WA
      
      // Mountain Time (MST/MDT UTC-7/-6)
      'America/Denver',          // CO, MT, NM, UT, WY
      'America/Phoenix',         // AZ (no DST! UTC-7 year-round)
      'America/Boise',           // ID
      
      // Central Time (CST/CDT UTC-6/-5)
      'America/Chicago',         // IL, MI, MN, MO, ND, OK, SD, WI
      
      // Eastern Time (EST/EDT UTC-5/-4)
      'America/New_York',        // CT, DE, DC, FL, GA, ME, MD, MA, NH, NJ, NY, NC, PA, RI, SC, VT, VA, WV
      
      // Alaska Time (AKST/AKDT UTC-9/-8)
      'America/Anchorage',       // AK
      
      // Hawaii-Aleutian Time (HST UTC-10, no DST!)
      'Pacific/Honolulu',        // HI
      
      // US Territories
      'America/Puerto_Rico',     // PR (AST UTC-4, no DST!)
      'Pacific/Guam',            // GU (ChST UTC+10, no DST!)
      
      // Canada (if expanding north)
      'America/Toronto',         // ON (EST/EDT)
      'America/Vancouver',       // BC (PST/PDT)
      
      // Common international timezones (for future expansion)
      'Europe/London',           // UK (GMT/BST)
      'Europe/Amsterdam',        // Netherlands (CET/CEST)
      'Australia/Sydney',        // AU (AEDT/AEST)
    ],
    required: true
  },
  
  // ========== BUSINESS HOURS ==========
  businessHours: {
    weekdayOpen: {
      type: String,
      default: '09:00',  // 9 AM local time
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/  // HH:MM format
    },
    weekdayClose: {
      type: String,
      default: '21:00',  // 9 PM local time
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    },
    weekendOpen: {
      type: String,
      default: '10:00'
    },
    weekendClose: {
      type: String,
      default: '20:00'
    },
    closed: {
      type: [String],
      default: [],  // e.g., ['Sunday'] for closed Sundays
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    }
  },
  
  // ========== FACILITY LOCATION (UPDATED!) ==========
  location: {
    facilityName: {
      type: String,
      default: '',
      trim: true
    },
    address: {
      type: String,
      default: '',
      trim: true
    },
    city: {
      type: String,
      default: '',
      trim: true
    },
    state: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
      maxLength: 2
    },
    zip: {
      type: String,
      default: '',
      trim: true
    },
    country: {
      type: String,
      default: 'US'
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    licenseNumber: {
      type: String,
      default: '',
      trim: true
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Settings (keeping your existing structure)
  settings: {
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

// ========== EXISTING METHODS ==========
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

// ========== TIMEZONE HELPER METHODS ==========

/**
 * Get current time in organization's local timezone
 */
organizationSchema.methods.getLocalTime = function(utcDate = new Date()) {
  return new Date(utcDate.toLocaleString('en-US', { timeZone: this.timezone }));
};

/**
 * Format datetime for display in local timezone
 */
organizationSchema.methods.formatLocalDateTime = function(utcDate) {
  if (!utcDate) return null;
  
  return new Date(utcDate).toLocaleString('en-US', {
    timeZone: this.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Get business day (local date only, no time)
 * Used for "per day" aggregations
 */
organizationSchema.methods.getBusinessDay = function(utcDate = new Date()) {
  const local = this.getLocalTime(utcDate);
  // Return midnight UTC of that local date (for storage)
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
};

/**
 * Check if currently within business hours
 */
organizationSchema.methods.isCurrentlyOpen = function() {
  const now = new Date();
  const local = this.getLocalTime(now);
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][local.getDay()];
  
  // Check if closed today
  if (this.businessHours?.closed?.includes(dayOfWeek)) {
    return false;
  }
  
  // Get current time in HH:MM format
  const currentTime = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
  
  const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
  const openTime = isWeekend ? this.businessHours?.weekendOpen : this.businessHours?.weekdayOpen;
  const closeTime = isWeekend ? this.businessHours?.weekendClose : this.businessHours?.weekdayClose;
  
  return currentTime >= openTime && currentTime < closeTime;
};

/**
 * Get timezone offset string (e.g., "PST" or "PDT")
 */
organizationSchema.methods.getTimezoneAbbr = function() {
  const now = new Date();
  const formatted = now.toLocaleString('en-US', {
    timeZone: this.timezone,
    timeZoneName: 'short'
  });
  
  // Extract timezone abbreviation (last part)
  const parts = formatted.split(' ');
  return parts[parts.length - 1];
};

// Update timestamp on save
organizationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Organization', organizationSchema);