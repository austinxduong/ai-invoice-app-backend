// backend/models/Product.js (Updated with Multi-Tenancy)
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
  
  // Pricing
  price: {
    type: Number,
    required: true,
    min: 0
  },
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
    enum: ['unit', 'gram', 'ounce', 'pound', 'kilogram', 'liter', 'milliliter']
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
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Images
  images: [{
    url: String,
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

// Virtual for profit margin
productSchema.virtual('profitMargin').get(function() {
  if (this.cost === 0) return 0;
  return ((this.price - this.cost) / this.cost) * 100;
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