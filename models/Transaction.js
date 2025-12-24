const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    // ✅ CRITICAL: Add organizationId for multi-tenancy
    organizationId: {
        type: String,
        required: true,
        index: true
    },
    
    transactionId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },

    // Transaction items - products sold
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        sku: {
            type: String,
            required: true
        },
        category: {
            type: String,
            required: true
        },
        subcategory: String,
        pricingOption: {
            unit: {
                type: String,
                required: true,
                // ✅ FIXED: Removed duplicate 'each' and added more units
                enum: ['unit', 'each', 'gram', 'eighth', 'quarter', 'half', 'ounce', 'package', 'pound', 'kilogram', 'liter', 'milliliter']
            },
            weight: {
                type: Number,
                required: true
            },
            price: {
                type: Number,
                required: true,
                min: 0
            }
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        // Cannabis-specific data
        cannabis: {
            thc: {
                type: Number,
                min: 0,
                max: 100,
                default: 0
            },
            cbd: {
                type: Number,
                min: 0,
                max: 100,
                default: 0
            },
            batchNumber: String
        }
    }],

// Financial totals
totals: {
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    discountAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    discountedSubtotal: {
        type: Number,
        required: true,
        min: 0
    },
    taxAmount: {
        type: Number,
        required: true,
        min: 0
    },
    grandTotal: {
        type: Number,
        required: true,
        min: 0
    },
    changeAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    // Detailed tax breakdown
    taxBreakdown: {
        total: {
            type: Number,
            default: 0
        },
        excise: {
            type: Number,
            default: 0
        },
        cultivation: {
            type: Number,
            default: 0
        },
        sales: {
            state: {
                type: Number,
                default: 0
            },
            county: {
                type: Number,
                default: 0
            },
            city: {
                type: Number,
                default: 0
            },
            total: {
                type: Number,
                default: 0
            }
        }
    }
},

    // Discount information
    discount: {
        name: String,
        type: {
            type: String,
            enum: ['percentage', 'fixed'],
        },
        value: Number,
        description: String
    },

    // Payment information
    paymentMethod: {
        type: String,
        required: true,
        enum: ['cash', 'card', 'check', 'digital', 'store_credit'],
        default: 'cash'
    },
    cashReceived: {
        type: Number,
        min: 0,
        default: 0
    },

    // Customer information (optional for cannabis POS)
    customerInfo: {
        name: String,
        phone: String,
        email: String,
        loyaltyNumber: String,
        birthday: Date,
        // Cannabis compliance
        license: {
            number: String,
            state: String,
            expirationDate: Date
        }
    },

    // Transaction status
    status: {
        type: String,
        enum: ['completed', 'refunded', 'partially_refunded', 'voided'],
        default: 'completed'
    },

    // Receipt data
    receiptData: {
        receiptNumber: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        localDateString: String, // e.g., "12/10/2025"
        localTimeString: String, // e.g., "3:45:30 PM"
        timezone: String, // e.g., "America/Los_Angeles" 
        timezoneOffset: Number, // Offset in minutes
        printed: {
            type: Boolean,
            default: false
        },
        emailed: {
            type: Boolean,
            default: false
        },
        emailAddress: String
    },

    // Compliance and tracking
    compliance: {
        // Cannabis seed-to-sale tracking
        stateTrackingNumbers: [String],
        // POS compliance
        employeeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        registerId: String,
        shift: {
            id: String,
            startTime: Date,
            employee: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }
    },

    // Metadata
    location: {
        name: String,
        address: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        }
    },

    // Soft delete
    isActive: {
        type: Boolean,
        default: true
    },

    // Transaction processing metadata
    processedAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true // adds createdAt and updatedAt
});

// ✅ CRITICAL: Add organizationId indexes
TransactionSchema.index({ organizationId: 1, transactionId: 1 }, { unique: true });
TransactionSchema.index({ organizationId: 1, createdAt: -1 }); // For date-based queries per org
TransactionSchema.index({ organizationId: 1, 'compliance.employeeId': 1 });
TransactionSchema.index({ organizationId: 1, paymentMethod: 1 });
TransactionSchema.index({ organizationId: 1, status: 1 });

// Keep these for performance
TransactionSchema.index({ createdAt: -1 }); // Global date index
TransactionSchema.index({ 'compliance.employeeId': 1 });
TransactionSchema.index({ paymentMethod: 1 });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ processedAt: -1 });

// Compound indexes for reporting
TransactionSchema.index({ organizationId: 1, createdAt: -1, status: 1 });
TransactionSchema.index({ organizationId: 1, 'compliance.employeeId': 1, createdAt: -1 });

// Virtual for total items count
TransactionSchema.virtual('totalItems').get(function() {
    return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Virtual for tax percentage
TransactionSchema.virtual('taxPercentage').get(function() {
    if (this.totals.discountedSubtotal > 0) {
        return (this.totals.taxAmount / this.totals.discountedSubtotal) * 100;
    }
    return 0;
});

// Method to check if transaction can be refunded
TransactionSchema.methods.canBeRefunded = function() {
    return this.status === 'completed' && this.paymentMethod !== 'cash';
};

// ✅ UPDATED: Static method to find transactions by date range (with organizationId)
TransactionSchema.statics.findByDateRange = function(startDate, endDate, organizationId, filters = {}) {
    const query = {
        organizationId: organizationId,  // ← Filter by organization
        createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        },
        isActive: true,
        ...filters
    };

    return this.find(query)
        .populate('compliance.employeeId', 'firstName lastName')
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 });
};

// ✅ UPDATED: Static method for sales reporting (with organizationId)
TransactionSchema.statics.getSalesReport = function(startDate, endDate, organizationId) {
    return this.aggregate([
        {
            $match: {
                organizationId: organizationId,  // ← Filter by organization
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                },
                status: 'completed',
                isActive: true
            }
        },
        {
            $group: {
                _id: null,
                totalTransactions: { $sum: 1 },
                totalRevenue: { $sum: '$totals.grandTotal' },
                totalTax: { $sum: '$totals.taxAmount' },
                totalItems: { $sum: { $sum: '$items.quantity' } },
                averageTransaction: { $avg: '$totals.grandTotal' },
                paymentMethods: {
                    $push: '$paymentMethod'
                }
            }
        }
    ]);
};

module.exports = mongoose.model('Transaction', TransactionSchema);