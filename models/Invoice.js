// backend/models/Invoice.js (Updated with Multi-Tenancy)
const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  // CRITICAL: Multi-tenancy field
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  
  // Invoice Information
  invoiceNumber: {
    type: String,
    required: true
  },
  
  // Customer Reference
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String
  },
  
  // Invoice Details
  issueDate: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  
  // Line Items
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    description: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    amount: {
      type: Number,
      required: true
    }
  }],
  
  // Totals
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Payment Information
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit_card', 'bank_transfer', 'check', 'other'],
    default: null
  },
  paidDate: {
    type: Date,
    default: null
  },
  paidAmount: {
    type: Number,
    default: 0
  },
  
  // Notes
  notes: {
    type: String,
    default: ''
  },
  terms: {
    type: String,
    default: ''
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound Indexes for Multi-Tenancy
// Invoice number must be unique PER organization (not globally)
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, status: 1 });
invoiceSchema.index({ organizationId: 1, customerId: 1 });
invoiceSchema.index({ organizationId: 1, createdAt: -1 });
invoiceSchema.index({ organizationId: 1, dueDate: 1 });

// Pre-save middleware
invoiceSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Recalculate totals if items changed
  if (this.isModified('items') || this.isModified('taxRate')) {
    this.subtotal = this.items.reduce((sum, item) => sum + item.amount, 0);
    this.taxAmount = (this.subtotal * this.taxRate) / 100;
    this.total = this.subtotal + this.taxAmount;
  }
  
  next();
});

// Methods
invoiceSchema.methods.markAsPaid = async function(paymentMethod, paidAmount) {
  this.status = 'paid';
  this.paymentMethod = paymentMethod;
  this.paidDate = new Date();
  this.paidAmount = paidAmount || this.total;
  await this.save();
};

invoiceSchema.methods.markAsOverdue = async function() {
  if (this.status !== 'paid' && new Date() > this.dueDate) {
    this.status = 'overdue';
    await this.save();
  }
};

// Static method to get next invoice number for organization
invoiceSchema.statics.getNextInvoiceNumber = async function(organizationId) {
  const lastInvoice = await this.findOne({ organizationId })
    .sort({ createdAt: -1 })
    .select('invoiceNumber');
  
  if (!lastInvoice) {
    return 'INV-0001';
  }
  
  // Extract number from format INV-0001
  const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[1]);
  const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
  
  return `INV-${nextNumber}`;
};

module.exports = mongoose.model('Invoice', invoiceSchema);