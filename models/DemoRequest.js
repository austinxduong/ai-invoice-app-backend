const mongoose = require('mongoose');

const DemoRequestSchema = new mongoose.Schema({
  // Company Information
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  
  website: {
    type: String,
    trim: true
  },
  
  industry: {
    type: String,
    required: true,
    enum: ['dispensary', 'cultivation', 'manufacturing', 'testing', 'distribution', 'integrated']
  },
  
  numberOfLocations: {
    type: String,
    required: true
  },
  
  // Contact Information
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  
  phone: {
    type: String,
    required: true,
    trim: true
  },
  
  jobTitle: {
    type: String,
    trim: true
  },
  
  // Business Details
  annualRevenue: {
    type: String
  },
  
  numberOfEmployees: {
    type: String
  },
  
  currentSoftware: {
    type: String,
    trim: true
  },
  
  // Cannabis Specific
  licenseTypes: [{
    type: String,
    required: true
  }],
  
  states: {
    type: String,
    required: true,
    trim: true
  },
  
  complianceNeeds: [{
    type: String
  }],
  
  // Discovery Questions
  primaryPainPoints: {
    type: String,
    required: true,
    trim: true
  },
  
  timeline: {
    type: String,
    enum: ['immediate', '1-3months', '3-6months', '6+months', 'exploring']
  },
  
  budget: {
    type: String,
    enum: ['<10k', '10-25k', '25-50k', '50-100k', '100k+', 'tbd']
  },
  
  decisionMakers: {
    type: String,
    trim: true
  },
  
  // Demo Preferences
  preferredDemoType: {
    type: String,
    enum: ['live', 'recorded', 'self-guided'],
    default: 'live'
  },
  
  timePreference: {
    type: String,
    enum: ['morning', 'afternoon', 'evening']
  },
  
  timezone: {
    type: String,
    default: 'America/Los_Angeles'
  },
  
  // Marketing
  howDidYouHear: {
    type: String,
    trim: true
  },
  
  marketingConsent: {
    type: Boolean,
    default: false
  },
  
  // Status Tracking
  status: {
    type: String,
    enum: ['pending', 'qualified', 'demo_scheduled', 'demo_completed', 'proposal_sent', 'closed_won', 'closed_lost'],
    default: 'pending'
  },
  
  // Lead Scoring
  leadScore: {
    type: Number,
    default: 0
  },
  
  qualificationNotes: {
    type: String,
    trim: true
  },
  
  // Demo Information
  demoScheduledAt: {
    type: Date
  },
  
  demoCompletedAt: {
    type: Date
  },
  
  demoNotes: {
    type: String,
    trim: true
  },
  
  // Sales Information
  assignedSalesRep: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  proposalSentAt: {
    type: Date
  },
  
  closedAt: {
    type: Date
  },
  
  closedReason: {
    type: String,
    trim: true
  },
  
  // Follow-up
  nextFollowUp: {
    type: Date
  },
  
  // User Account
  userAccountCreated: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Payment Link Fields
    paymentToken: {
    type: String,
    unique: true,
    sparse: true  // Allows multiple null values
    },

    paymentLinkExpires: {
    type: Date
    },

    paymentLinkClicked: {
    type: Boolean,
    default: false
    },

    paymentLinkClickedAt: {
    type: Date
    }
  
}, {
  timestamps: true
});

// Auto-calculate lead score
DemoRequestSchema.pre('save', function(next) {
  if (this.isModified('budget') || this.isModified('timeline') || this.isModified('numberOfLocations')) {
    this.leadScore = calculateLeadScore(this);
  }
  next();
});

// Lead scoring function
function calculateLeadScore(request) {
  let score = 0;
  
  // Budget scoring
  const budgetScores = {
    '100k+': 100,
    '50-100k': 80,
    '25-50k': 60,
    '10-25k': 40,
    '<10k': 20,
    'tbd': 30
  };
  score += budgetScores[request.budget] || 0;
  
  // Timeline scoring
  const timelineScores = {
    'immediate': 100,
    '1-3months': 80,
    '3-6months': 60,
    '6+months': 30,
    'exploring': 10
  };
  score += timelineScores[request.timeline] || 0;
  
  // Company size scoring
  const locationScores = {
    '25+': 100,
    '11-25': 80,
    '6-10': 60,
    '2-5': 40,
    '1': 20
  };
  score += locationScores[request.numberOfLocations] || 0;
  
  // Industry type scoring
  const industryScores = {
    'integrated': 100,
    'dispensary': 80,
    'cultivation': 70,
    'manufacturing': 70,
    'testing': 60,
    'distribution': 50
  };
  score += industryScores[request.industry] || 0;
  
  return Math.round(score / 4); // Average the scores
}

module.exports = mongoose.model('DemoRequest', DemoRequestSchema);