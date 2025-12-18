const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
            select: false,
        },
        businessName: { type: String, default: ''},
        address: { type: String, default: ''},
        phone: { type: String, default:''},

        accessLevel: {
            type: String,
            enum: ['demo_requested', 'demo_scheduled', 'trial', 'paid', 'admin'],
            default: 'demo_requested'
        },
        
        subscriptionStatus: {
            type: String,
            enum: ['none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'],
            default: 'none'
        },
        
        subscriptionId: {
            type: String, // Stripe subscription ID
            default: null
        },
        
        trialEndsAt: {
            type: Date,
            default: null
        },
        
        // Demo/Sales Information
        demoRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DemoRequest',
            default: null
        },
        
        salesNotes: {
            type: String,
            default: ''
        },
        
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        
        approvedAt: {
            type: Date,
            default: null
        },
        
        // Company Information (you can update businessName or keep both)
        companyName: {
            type: String,
            default: ''
        },
        
        licenseTypes: [{
            type: String,
            enum: ['retail', 'cultivation', 'manufacturing', 'testing', 'distribution', 'delivery']
        }],
        
        // Billing
        billingEmail: {
            type: String,
            default: null
        },
        
        // Usage Tracking
        lastLoginAt: {
            type: Date,
            default: null
        },
        
        loginCount: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

//password hashing middleware
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Add methods to check access
userSchema.methods.hasAccess = function() {
    // Admin always has access
    if (this.accessLevel === 'admin') return true;
    
    // Paid customers have access
    if (this.subscriptionStatus === 'active' || this.subscriptionStatus === 'trialing') return true;
    
    // Trial users with valid trial period
    if (this.accessLevel === 'trial' && this.trialEndsAt && this.trialEndsAt > new Date()) return true;
    
    // Demo users who have been approved
    if (this.accessLevel === 'demo_scheduled' && this.approvedAt) return true;
    
    return false;
};

userSchema.methods.getAccessMessage = function() {
    if (this.hasAccess()) return null;
    
    switch (this.accessLevel) {
        case 'demo_requested':
            return 'Your demo request is being reviewed. We\'ll contact you within 24 hours to schedule your demo.';
        case 'demo_scheduled':
            return 'Your demo has been scheduled. Please wait for approval to access the platform.';
        case 'trial':
            if (this.trialEndsAt && this.trialEndsAt < new Date()) {
                return 'Your trial period has expired. Please contact sales to upgrade to a paid plan.';
            }
            return 'Trial access pending activation.';
        default:
            return 'Access denied. Please book a demo to get started.';
    }
};

module.exports = mongoose.model("User", userSchema);