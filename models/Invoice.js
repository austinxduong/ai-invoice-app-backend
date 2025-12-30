// backend/models/Invoice.js
// ✅ UPDATED: Cannabis-compliant invoice model with Tier 1 + 2 fields

const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  // ========== PRODUCT IDENTITY ==========
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  
  // ========== SKU & CATEGORIZATION (Tier 1) ==========
  sku: {
    type: String,
    required: true  // Required for compliance
  },
  category: {
    type: String,
    required: true
    // No enum - allow any category from Product model
  },
  subcategory: String,  // e.g., 'indica', 'sativa', 'hybrid'
  strainType: {
    type: String,
    enum: ['indica', 'sativa', 'hybrid', 'cbd', 'na']
  },
  
  // ========== QUANTITY & UNIT (Tier 1) ==========
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true
    // No enum - allow any unit from Product model
  },
  weight: {
    type: Number,  // Actual weight in grams (normalized)
    required: true
  },
  
  // ========== PRICING ==========
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  subtotal: Number,  // quantity * unitPrice
  
  // ========== TAX (Cannabis-specific) ==========
  taxPercent: {
    type: Number,
    default: 0
  },
  cannabisExciseTax: {
    type: Number,
    default: 0
  },
  salesTax: {
    type: Number,
    default: 0
  },
  cultivationTax: {
    type: Number,
    default: 0
  },
  
  // ========== CANNABINOID PROFILE (Tier 1 - CRITICAL) ==========
  // Snapshot at time of sale - immutable
  thcContent: {
    type: Number,  // % THC
    min: 0,
    max: 100
  },
  cbdContent: {
    type: Number,  // % CBD
    min: 0,
    max: 100
  },
  thcMg: Number,  // Total THC in mg (weight * thcContent)
  cbdMg: Number,  // Total CBD in mg (weight * cbdContent)
  
  // ========== COMPLIANCE DATA (Tier 1 - REQUIRED) ==========
  batchNumber: {
    type: String,
    required: true  // Critical for recalls
  },
  stateTrackingId: {
    type: String,   // Metrc UID, BioTrack, etc.
    required: true
  },
  labTested: {
    type: Boolean,
    default: false
  },
  labTestDate: Date,
  labTestResult: {
    type: String,
    enum: ['pass', 'fail', 'pending', 'na'],
    default: 'pass'
  },
  
  // ========== DATES (Tier 1 & 2) ==========
  packagedDate: {
    type: Date,
    required: true
  },
  harvestDate: Date,        // Tier 2
  expirationDate: Date,     // Tier 2
  
  // ========== LOCAL DATETIMES (human-readable) ==========
  localPackagedDate: String,      // "01/21/2024, 08:00:00 AM PST"
  localHarvestDate: String,       // "12/31/2023, 08:00:00 AM PST"
  localExpirationDate: String,    // "07/21/2024, 07:00:00 AM PST"
  
  // ========== PRODUCER INFO (Tier 1) ==========
  licensedProducer: {
    type: String,
    required: true
  },
  producerLicense: {
    type: String,
    required: true
  },
  producerContact: String,  // Tier 2
  
  // ========== ADDITIONAL INFO (Tier 2) ==========
  strainName: String,       // e.g., "Purple Kush"
  productDescription: String,
  
  // ========== METRC/STATE REPORTING ==========
  metrcTransferId: String,  // If transferred via Metrc
  metrcPackageId: String,   // Metrc package ID
  
  // ========== INTERNAL ==========
  notes: String
});

// Calculate subtotal before saving
invoiceItemSchema.pre('save', function(next) {
  this.subtotal = this.quantity * this.unitPrice;
  
  // Calculate total cannabinoids in mg
  if (this.weight && this.thcContent) {
    this.thcMg = (this.weight * this.thcContent) / 100;
  }
  if (this.weight && this.cbdContent) {
    this.cbdMg = (this.weight * this.cbdContent) / 100;
  }
  
  next();
});

const invoiceSchema = new mongoose.Schema({
  // ========== ORGANIZATION & USER ==========
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // ========== INVOICE IDENTITY ==========
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Pending', 'Paid', 'Overdue', 'Cancelled', 'Void'],
    default: 'Pending'
  },
  
  // ========== DATES ==========
  invoiceDate: {
    type: Date,
    default: Date.now
  },
  dueDate: Date,
  paidDate: Date,
  
  // ========== LOCAL DATETIMES (human-readable with timezone) ==========
  // These store the FULL datetime in local timezone for display
  // Format: "MM/DD/YYYY, HH:MM:SS AM/PM TZ"
  localInvoiceDate: String,        // "12/29/2025, 04:00:00 PM PST"
  localDueDate: String,            // "12/28/2025, 11:59:00 PM PST"
  localCreatedAt: String,          // "12/29/2025, 08:42:15 PM PST"
  localUpdatedAt: String,          // "12/29/2025, 08:42:15 PM PST"
  
  // ========== CUSTOMER (BILL TO) ==========
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  billTo: {
    clientName: String,
    email: String,
    phone: String,
    address: String,
    licenseNumber: String,  // If B2B (dispensary to dispensary)
    customerType: {
      type: String,
      enum: ['retail', 'wholesale', 'medical'],
      default: 'retail'
    }
  },
  
  // ========== SELLER (BILL FROM) ==========
  billFrom: {
    businessName: String,
    email: String,
    phone: String,
    address: String,
    licenseNumber: String,  // Your cannabis license
    licenseType: String     // Retailer, Cultivator, Manufacturer, etc.
  },
  
  // ========== ITEMS (WITH COMPLIANCE DATA) ==========
  items: [invoiceItemSchema],
  
  // ========== FINANCIAL TOTALS ==========
  subtotal: {
    type: Number,
    default: 0
  },
  taxTotal: {
    type: Number,
    default: 0
  },
  cannabisExciseTaxTotal: Number,
  salesTaxTotal: Number,
  cultivationTaxTotal: Number,
  discountAmount: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  
  // ========== PAYMENT ==========
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'Check', 'ACH', 'Other'],
    default: 'Cash'
  },
  paymentTerms: {
    type: String,
    default: 'Due on receipt'
  },
  
  // ========== COMPLIANCE & AUDIT ==========
  stateReported: {
    type: Boolean,
    default: false
  },
  stateReportDate: Date,
  metrcManifestId: String,  // Metrc manifest ID if reported
  complianceNotes: String,
  
  // ========== NOTES ==========
  notes: String,
  internalNotes: String,
  
  // ========== ATTACHMENTS ==========
  attachments: [String],  // Lab reports, compliance docs, etc.
  
  // ========== METADATA ==========
  source: {
    type: String,
    enum: ['pos', 'manual', 'cart', 'wholesale', 'api'],
    default: 'manual'
  },
  ipAddress: String,
  userAgent: String
  
}, {
  timestamps: true
});

// Indexes for performance
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 });
invoiceSchema.index({ organizationId: 1, status: 1 });
invoiceSchema.index({ organizationId: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, customerId: 1 });
invoiceSchema.index({ 'billTo.email': 1 });
invoiceSchema.index({ stateReported: 1 });

// Calculate totals before saving
invoiceSchema.pre('save', async function(next) {
  // Calculate subtotal
  this.subtotal = this.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  
  // Calculate tax totals
  this.taxTotal = this.items.reduce((sum, item) => {
    const itemTax = (item.subtotal * (item.taxPercent || 0)) / 100;
    return sum + itemTax;
  }, 0);
  
  this.cannabisExciseTaxTotal = this.items.reduce((sum, item) => sum + (item.cannabisExciseTax || 0), 0);
  this.salesTaxTotal = this.items.reduce((sum, item) => sum + (item.salesTax || 0), 0);
  this.cultivationTaxTotal = this.items.reduce((sum, item) => sum + (item.cultivationTax || 0), 0);
  
  // Calculate total
  this.total = this.subtotal + this.taxTotal - this.discountAmount;
  
  next();
});

// ========== CALCULATE LOCAL DATES AFTER SAVE (when timestamps exist) ==========
invoiceSchema.post('save', async function(doc, next) {
  try {
    // Skip if local dates already calculated (to avoid infinite loop)
    if (doc.localInvoiceDate && doc.localDueDate && doc.localCreatedAt && doc.localUpdatedAt) {
      return next();
    }
    
    // ✅ Get organization timezone
    const Organization = require('./Organization');
    const org = await Organization.findOne({ organizationId: doc.organizationId });
    const timezone = org?.timezone || 'America/Los_Angeles';
    
    console.log('🕐 POST-SAVE: Calculating local dates with timezone:', timezone);
    
    // ✅ Helper function to format datetime with timezone abbreviation
    const formatLocalDateTime = (utcDate) => {
      if (!utcDate) return null;
      const formatted = new Date(utcDate).toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      
      // Get timezone abbreviation
      const tzAbbr = new Date(utcDate).toLocaleString('en-US', {
        timeZone: timezone,
        timeZoneName: 'short'
      }).split(' ').pop();
      
      return `${formatted} ${tzAbbr}`;
    };
    
    // ✅ Calculate human-readable local datetimes
    const updates = {};
    
    if (doc.invoiceDate) {
      updates.localInvoiceDate = formatLocalDateTime(doc.invoiceDate);
    }
    
    if (doc.dueDate) {
      updates.localDueDate = formatLocalDateTime(doc.dueDate);
    }
    
    if (doc.createdAt) {
      updates.localCreatedAt = formatLocalDateTime(doc.createdAt);
    }
    
    if (doc.updatedAt) {
      updates.localUpdatedAt = formatLocalDateTime(doc.updatedAt);
    }
    
    // ✅ Calculate human-readable local datetimes for each item
    const itemUpdates = doc.items.map((item, index) => {
      const itemUpdate = {};
      
      if (item.packagedDate) {
        itemUpdate[`items.${index}.localPackagedDate`] = formatLocalDateTime(item.packagedDate);
      }
      if (item.harvestDate) {
        itemUpdate[`items.${index}.localHarvestDate`] = formatLocalDateTime(item.harvestDate);
      }
      if (item.expirationDate) {
        itemUpdate[`items.${index}.localExpirationDate`] = formatLocalDateTime(item.expirationDate);
      }
      
      return itemUpdate;
    });
    
    // Merge all item updates
    itemUpdates.forEach(update => Object.assign(updates, update));
    
    console.log('✅ POST-SAVE: Local datetimes to update:', updates);
    
    // ✅ Update document directly in database (bypass Mongoose to avoid triggering hooks again)
    await this.constructor.updateOne(
      { _id: doc._id },
      { $set: updates },
      { timestamps: false }  // Don't update timestamps again
    );
    
    console.log('✅ POST-SAVE: Local datetimes saved to MongoDB');
    
    next();
    
  } catch (error) {
    console.error('⚠️ POST-SAVE: Error calculating local dates:', error);
    next(); // Don't fail the save
  }
});

// Virtual for cannabis weight tracking
invoiceSchema.virtual('totalWeight').get(function() {
  return this.items.reduce((sum, item) => sum + (item.weight || 0), 0);
});

// Virtual for total THC/CBD
invoiceSchema.virtual('totalTHC').get(function() {
  return this.items.reduce((sum, item) => sum + (item.thcMg || 0), 0);
});

invoiceSchema.virtual('totalCBD').get(function() {
  return this.items.reduce((sum, item) => sum + (item.cbdMg || 0), 0);
});

// Method to check if invoice needs state reporting
invoiceSchema.methods.needsStateReporting = function() {
  return !this.stateReported && this.status === 'Paid';
};

// Method to mark as reported to state
invoiceSchema.methods.markStateReported = function(manifestId) {
  this.stateReported = true;
  this.stateReportDate = new Date();
  this.metrcManifestId = manifestId;
  return this.save();
};

module.exports = mongoose.model('Invoice', invoiceSchema);