// backend/models/Invoice.js (Compatible with existing form)
const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  // CRITICAL: Multi-tenancy field
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  
  // User reference (for backward compatibility)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Invoice Information
  invoiceNumber: {
    type: String,
    required: true
  },
  
  invoiceDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  dueDate: {
    type: Date,
    required: true
  },
  
  // Bill From (Your company)
  billFrom: {
    companyName: String,
    email: String,
    address: String,
    phone: String
  },
  
  // Bill To (Customer)
  billTo: {
    clientName: { type: String, required: true },
    email: String,
    address: String,
    phone: String
  },
  
  // Line Items
  items: [{
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: false  // ← Made optional for compatibility
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
    taxPercent: {
      type: Number,
      default: 0
    }
  }],
  
  // Totals
  subtotal: {
    type: Number,
    required: true,
    default: 0
  },
  taxTotal: {
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
    enum: ['Pending', 'Paid', 'Overdue', 'Draft', 'Cancelled'],
    default: 'Pending'
  },
  
  paymentTerms: {
    type: String,
    default: 'Net 30'
  },
  
  // Notes
  notes: {
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
  }
}, {
  timestamps: true  // Automatically adds createdAt and updatedAt
});

// Compound Indexes for Multi-Tenancy
// Invoice number must be unique PER organization (not globally)
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, status: 1 });
invoiceSchema.index({ organizationId: 1, createdAt: -1 });
invoiceSchema.index({ organizationId: 1, dueDate: 1 });

// Methods
invoiceSchema.methods.markAsPaid = async function() {
  this.status = 'Paid';
  await this.save();
};

invoiceSchema.methods.markAsOverdue = async function() {
  if (this.status !== 'Paid' && new Date() > this.dueDate) {
    this.status = 'Overdue';
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
  const match = lastInvoice.invoiceNumber.match(/\d+$/);
  if (match) {
    const lastNumber = parseInt(match[0]);
    const nextNumber = (lastNumber + 1).toString().padStart(4, '0');
    return `INV-${nextNumber}`;
  }
  
  return 'INV-0001';
};

module.exports = mongoose.model('Invoice', invoiceSchema);