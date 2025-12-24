// backend/models/Product.js (Multi-Tenancy + Pricing Array)
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  // CRITICAL: Multi-tenancy field
  organizationId: {
    type: String,
    required: true,
    index: true
  },
  
  // Product Information
  name: {
    type: String,
    required: true,
    trim: true
  },
  sku: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  description: {
    type: String,
    default: ''
  },
  
  // Categorization
  category: {
    type: String,
    required: true,
    enum: ['flower', 'edibles', 'concentrates', 'topicals', 'accessories', 'other'],
    default: 'other'
  },
  subcategory: {
    type: String,
    default: ''
  },
  
  // ✅ RESTORED: Multiple Pricing Tiers
  pricing: [{
    unit: {
      type: String,
      required: true,
      enum: ['unit', 'each', 'gram', 'eighth', 'quarter', 'half', 'ounce', 'pound', 'kilogram', 'liter', 'milliliter', 'package']
    },
    weight: {
      type: Number,
      required: true,
      min: 0
    },
    price: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  
  // Cost (for profit calculation)
  cost: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Inventory
  stockQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 10,
    min: 0
  },
  unit: {
    type: String,
    default: 'unit',
    enum: ['unit', 'gram', 'ounce', 'pound', 'kilogram', 'liter', 'milliliter', 'each', 'package']
  },
  
  // Cannabis-Specific Fields
  thcContent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  cbdContent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  strain: {
    type: String,
    default: null
  },
  strainType: {
    type: String,
    enum: ['indica', 'sativa', 'hybrid', null],
    default: null
  },
  
  // Additional Cannabis Fields (from CSV)
  effects: [{
    type: String,
    trim: true
  }],
  flavors: [{
    type: String,
    trim: true
  }],
  
  // Compliance (from CSV)
  compliance: {
    batchNumber: String,
    labTested: {
      type: Boolean,
      default: false
    },
    licensedProducer: String,
    harvestDate: Date,
    packagedDate: Date,
    expirationDate: Date,
    stateTrackingId: String
  },
  
  // Supplier (from CSV)
  supplier: {
    name: String,
    contact: String,
    license: String
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  
  // Images
  images: [{
    url: String,
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  
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
// SKU must be unique PER organization (not globally)
productSchema.index({ organizationId: 1, sku: 1 }, { unique: true });
productSchema.index({ organizationId: 1, category: 1 });
productSchema.index({ organizationId: 1, isActive: 1 });
productSchema.index({ organizationId: 1, name: 'text' }); // Text search within organization

// ✅ Virtual for base price (uses first pricing option)
productSchema.virtual('basePrice').get(function() {
  if (this.pricing && this.pricing.length > 0) {
    return this.pricing[0].price;
  }
  return 0;
});

// ✅ Virtual for profit margin (uses first pricing option)
productSchema.virtual('profitMargin').get(function() {
  if (this.cost === 0) return 0;
  const basePrice = this.basePrice;
  return ((basePrice - this.cost) / this.cost) * 100;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function() {
  if (this.stockQuantity === 0) return 'out_of_stock';
  if (this.stockQuantity <= this.lowStockThreshold) return 'low_stock';
  return 'in_stock';
});

// Pre-save middleware
productSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Methods
productSchema.methods.updateStock = async function(quantity, operation = 'add') {
  if (operation === 'add') {
    this.stockQuantity += quantity;
  } else if (operation === 'subtract') {
    this.stockQuantity = Math.max(0, this.stockQuantity - quantity);
  } else if (operation === 'set') {
    this.stockQuantity = quantity;
  }
  
  await this.save();
  return this.stockQuantity;
};

productSchema.methods.isLowStock = function() {
  return this.stockQuantity <= this.lowStockThreshold && this.stockQuantity > 0;
};

productSchema.methods.isOutOfStock = function() {
  return this.stockQuantity === 0;
};

// ✅ Method to get pricing option by unit
productSchema.methods.getPricingByUnit = function(unit) {
  if (!this.pricing || this.pricing.length === 0) return null;
  return this.pricing.find(p => p.unit === unit) || this.pricing[0];
};

// Static methods
productSchema.statics.getLowStockProducts = async function(organizationId) {
  return await this.find({
    organizationId: organizationId,
    isActive: true,
    stockQuantity: { $lte: this.schema.path('lowStockThreshold').default() }
  });
};

productSchema.statics.getOutOfStockProducts = async function(organizationId) {
  return await this.find({
    organizationId: organizationId,
    isActive: true,
    stockQuantity: 0
  });
};

module.exports = mongoose.model('Product', productSchema);