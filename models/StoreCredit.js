// backend/models/StoreCredit.js
// Store credit tracking for RMA refunds and customer loyalty

const mongoose = require('mongoose');

const storeCreditSchema = new mongoose.Schema({
  // Organization (multi-tenant)
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  
  // Credit Memo Number (unique per org)
  creditMemoNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Customer
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: String,
  customerPhone: String,
  
  // Credit Amounts
  originalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  remainingBalance: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'partially_used', 'fully_used', 'expired', 'voided'],
    default: 'active',
    required: true
  },
  
  // Source (where did this credit come from?)
  sourceType: {
    type: String,
    enum: ['rma_refund', 'promotional', 'compensation', 'loyalty', 'manual'],
    required: true
  },
  sourceReferenceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RMA' // Usually links to RMA
  },
  sourceDescription: String,
  
  // Dates
  issuedDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  expirationDate: {
    type: Date
  },
  
  // Usage History
  usageHistory: [{
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction'
    },
    amountUsed: {
      type: Number,
      required: true
    },
    remainingAfterUse: {
      type: Number,
      required: true
    },
    usedAt: {
      type: Date,
      default: Date.now
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registerId: String,
    notes: String
  }],
  
  // Compliance Notes
  internalNotes: String,
  
  // Audit Trail
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  voidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  voidedAt: Date,
  voidReason: String
}, {
  timestamps: true
});

// Indexes for performance
storeCreditSchema.index({ organizationId: 1, customerId: 1 });
storeCreditSchema.index({ organizationId: 1, status: 1 });
storeCreditSchema.index({ organizationId: 1, creditMemoNumber: 1 }, { unique: true });
storeCreditSchema.index({ organizationId: 1, expirationDate: 1 });
storeCreditSchema.index({ createdAt: -1 });

// Virtual: Is credit expired?
storeCreditSchema.virtual('isExpired').get(function() {
  if (!this.expirationDate) return false;
  return new Date() > this.expirationDate;
});

// Virtual: Is credit available to use?
storeCreditSchema.virtual('isAvailable').get(function() {
  return (
    this.status === 'active' || this.status === 'partially_used'
  ) && 
  this.remainingBalance > 0 && 
  !this.isExpired;
});

// Method: Apply credit to transaction
storeCreditSchema.methods.applyCredit = async function(amount, transactionId, userId, registerId) {
  if (amount > this.remainingBalance) {
    throw new Error(`Cannot apply $${amount}. Only $${this.remainingBalance} available.`);
  }
  
  if (!this.isAvailable) {
    throw new Error('Credit is not available for use');
  }
  
  // Update balance
  this.remainingBalance -= amount;
  
  // Update status
  if (this.remainingBalance === 0) {
    this.status = 'fully_used';
  } else if (this.remainingBalance < this.originalAmount) {
    this.status = 'partially_used';
  }
  
  // Add to usage history
  this.usageHistory.push({
    transactionId: transactionId,
    amountUsed: amount,
    remainingAfterUse: this.remainingBalance,
    usedAt: new Date(),
    usedBy: userId,
    registerId: registerId
  });
  
  return await this.save();
};

// Method: Void credit
storeCreditSchema.methods.void = async function(userId, reason) {
  if (this.status === 'fully_used') {
    throw new Error('Cannot void a fully used credit');
  }
  
  this.status = 'voided';
  this.voidedBy = userId;
  this.voidedAt = new Date();
  this.voidReason = reason;
  this.remainingBalance = 0;
  
  return await this.save();
};

// Static: Get customer's total available credit
storeCreditSchema.statics.getCustomerBalance = async function(customerId, organizationId) {
  const credits = await this.find({
    customerId: customerId,
    organizationId: organizationId,
    status: { $in: ['active', 'partially_used'] },
    $or: [
      { expirationDate: null },
      { expirationDate: { $gt: new Date() } }
    ]
  });
  
  const totalBalance = credits.reduce((sum, credit) => sum + credit.remainingBalance, 0);
  
  return {
    totalBalance: totalBalance,
    credits: credits,
    count: credits.length
  };
};

// Static: Auto-generate credit memo number
storeCreditSchema.statics.generateCreditMemoNumber = async function(organizationId) {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  
  // Find the last credit memo for this organization this month
  const lastCredit = await this.findOne({
    organizationId: organizationId,
    creditMemoNumber: new RegExp(`^CM-${year}${month}-`)
  })
    .sort({ creditMemoNumber: -1 })
    .lean();
  
  let sequence = 1;
  if (lastCredit && lastCredit.creditMemoNumber) {
    const parts = lastCredit.creditMemoNumber.split('-');
    const lastSequence = parseInt(parts[parts.length - 1]);
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }
  
  return `CM-${year}${month}-${String(sequence).padStart(4, '0')}`;
};

// Static: Check for expired credits (for cleanup job)
storeCreditSchema.statics.expireCredits = async function() {
  const result = await this.updateMany(
    {
      status: { $in: ['active', 'partially_used'] },
      expirationDate: { $lte: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
  
  return result;
};

module.exports = mongoose.model('StoreCredit', storeCreditSchema);