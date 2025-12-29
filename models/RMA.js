// backend/models/RMA.js
const mongoose = require('mongoose');

const rmaItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: {
    type: String,
    required: true
  },
  sku: String,
  batchNumber: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true
  },
  totalValue: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  condition: {
    type: String,
    enum: ['defective', 'damaged', 'unopened', 'expired', 'wrong_product'],
    default: 'defective'
  }
});

const rmaSchema = new mongoose.Schema({
  // Organization
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  
  // RMA Number (auto-generated)
  rmaNumber: {
    type: String,
    unique: true,
    // Don't set required - it's auto-generated in pre-save hook
  },
  
  // Type
  type: {
    type: String,
    enum: ['customer_return', 'supplier_return', 'internal_damage', 'recall'],
    default: 'customer_return',
    required: true
  },
  
  // Related Documents
  relatedInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  relatedTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  invoiceNumber: String,
  
  // Customer Information
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
  
  // Items Being Returned
  items: [rmaItemSchema],
  
  // Total Value
  totalValue: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Return Reason
  returnReason: {
    type: String,
    enum: [
      'quality_issue',      // Mold, contamination, poor quality
      'wrong_product',      // Wrong strain, wrong size
      'damaged',            // Packaging damaged
      'expired',            // Past expiration date
      'recall',             // Regulatory recall
      'customer_error',     // Customer changed mind
      'supplier_defect',    // Defect from supplier
      'other'
    ],
    required: true
  },
  detailedReason: {
    type: String,
    required: true
  },
  customerComplaint: String,
  
  // Status
  status: {
    type: String,
    enum: [
      'pending_approval',
      'approved',
      'rejected',
      'received',
      'inspecting',
      'inspected',
      'refund_processing',
      'replacement_ordered',
      'credit_issued',
      'resolved',
      'closed',
      'cancelled'
    ],
    default: 'pending_approval',
    required: true
  },
  
  // Approval
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  
  // Inspection (after product received)
  receivedAt: Date,
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  inspectionDate: Date,
  inspectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  inspectionNotes: String,
  inspectionPhotos: [String],
  inspectionResult: {
    type: String,
    enum: ['confirmed_defective', 'customer_error', 'acceptable', 'partial_defect', 'pending'],
    default: 'pending'
  },
  
  // Resolution
  resolutionType: {
    type: String,
    enum: ['refund', 'replacement', 'store_credit', 'reject', 'pending'],
    default: 'pending'
  },
  resolutionDate: Date,
  refundAmount: {
    type: Number,
    default: 0
  },
  replacementOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  creditMemoNumber: String,
  creditAmount: {
    type: Number,
    default: 0
  },
  
  // Inventory Impact
  inventoryAdjusted: {
    type: Boolean,
    default: false
  },
  adjustmentType: {
    type: String,
    enum: ['quarantine', 'waste', 'restock', 'none'],
    default: 'none'
  },
  wasteReportId: String,
  
  // Compliance
  regulatoryNotificationRequired: {
    type: Boolean,
    default: false
  },
  regulatoryNotificationSent: {
    type: Boolean,
    default: false
  },
  regulatoryNotificationDate: Date,
  stateTrackingId: String,  // METRC or state system ID
  
  // Supplier Notification (for supplier defects)
  supplierNotified: {
    type: Boolean,
    default: false
  },
  supplierNotificationDate: Date,
  supplierRMANumber: String,
  
  // Notes & Attachments
  internalNotes: String,
  attachments: [String],
  
  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  closedAt: Date,
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
rmaSchema.index({ organizationId: 1, createdAt: -1 });
rmaSchema.index({ organizationId: 1, status: 1 });
rmaSchema.index({ organizationId: 1, rmaNumber: 1 });
rmaSchema.index({ organizationId: 1, customerId: 1 });
rmaSchema.index({ organizationId: 1, returnReason: 1 });

// Auto-generate RMA Number
rmaSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.rmaNumber) {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      
      // Find the last RMA for this organization this month
      const lastRMA = await this.constructor
        .findOne({
          organizationId: this.organizationId,
          rmaNumber: new RegExp(`^RMA-${year}${month}-`)
        })
        .sort({ rmaNumber: -1 })
        .lean();
      
      let sequence = 1;
      if (lastRMA && lastRMA.rmaNumber) {
        const parts = lastRMA.rmaNumber.split('-');
        const lastSequence = parseInt(parts[parts.length - 1]);
        if (!isNaN(lastSequence)) {
          sequence = lastSequence + 1;
        }
      }
      
      this.rmaNumber = `RMA-${year}${month}-${String(sequence).padStart(4, '0')}`;
      console.log('✅ Generated RMA Number:', this.rmaNumber);
    }
    next();
  } catch (error) {
    console.error('❌ Error generating RMA number:', error);
    next(error);
  }
});

// Calculate total value before saving
rmaSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.totalValue = this.items.reduce((sum, item) => sum + item.totalValue, 0);
  }
  next();
});

// Virtual for status display
rmaSchema.virtual('statusDisplay').get(function() {
  const statusMap = {
    'pending_approval': 'Pending Approval',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'received': 'Received',
    'inspecting': 'Under Inspection',
    'inspected': 'Inspected',
    'refund_processing': 'Processing Refund',
    'replacement_ordered': 'Replacement Ordered',
    'credit_issued': 'Credit Issued',
    'resolved': 'Resolved',
    'closed': 'Closed',
    'cancelled': 'Cancelled'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for days since creation
rmaSchema.virtual('daysOpen').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  const diffTime = Math.abs(now - created);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Methods
rmaSchema.methods.approve = function(userId) {
  this.status = 'approved';
  this.approvedBy = userId;
  this.approvedAt = new Date();
  return this.save();
};

rmaSchema.methods.reject = function(userId, reason) {
  this.status = 'rejected';
  this.approvedBy = userId;
  this.approvedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

rmaSchema.methods.markReceived = function(userId) {
  this.status = 'received';
  this.receivedBy = userId;
  this.receivedAt = new Date();
  return this.save();
};

rmaSchema.methods.completeInspection = function(userId, result, notes) {
  this.status = 'inspected';
  this.inspectedBy = userId;
  this.inspectionDate = new Date();
  this.inspectionResult = result;
  this.inspectionNotes = notes;
  return this.save();
};

rmaSchema.methods.processRefund = function(amount) {
  this.resolutionType = 'refund';
  this.refundAmount = amount;
  this.resolutionDate = new Date();
  this.status = 'resolved';
  return this.save();
};

rmaSchema.methods.processReplacement = function(orderId) {
  this.resolutionType = 'replacement';
  this.replacementOrderId = orderId;
  this.resolutionDate = new Date();
  this.status = 'resolved';
  return this.save();
};

rmaSchema.methods.issueCredit = function(amount, creditMemoNumber) {
  this.resolutionType = 'store_credit';
  this.creditAmount = amount;
  this.creditMemoNumber = creditMemoNumber;
  this.resolutionDate = new Date();
  this.status = 'resolved';
  return this.save();
};

rmaSchema.methods.close = function(userId) {
  this.status = 'closed';
  this.closedBy = userId;
  this.closedAt = new Date();
  return this.save();
};

// Static methods
rmaSchema.statics.getStatusCounts = async function(organizationId) {
  const counts = await this.aggregate([
    { $match: { organizationId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  
  const statusCounts = {
    pending_approval: 0,
    approved: 0,
    received: 0,
    inspected: 0,
    resolved: 0,
    rejected: 0,
    total: 0
  };
  
  counts.forEach(({ _id, count }) => {
    statusCounts[_id] = count;
    statusCounts.total += count;
  });
  
  return statusCounts;
};

rmaSchema.statics.getReasonBreakdown = async function(organizationId, startDate, endDate) {
  const match = { organizationId };
  if (startDate && endDate) {
    match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }
  
  return await this.aggregate([
    { $match: match },
    { $group: { _id: '$returnReason', count: { $sum: 1 }, totalValue: { $sum: '$totalValue' } } },
    { $sort: { count: -1 } }
  ]);
};

rmaSchema.statics.getTopReturnedProducts = async function(organizationId, limit = 10) {
  return await this.aggregate([
    { $match: { organizationId } },
    { $unwind: '$items' },
    { 
      $group: { 
        _id: '$items.productName',
        count: { $sum: '$items.quantity' },
        totalValue: { $sum: '$items.totalValue' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
};

module.exports = mongoose.model('RMA', rmaSchema);