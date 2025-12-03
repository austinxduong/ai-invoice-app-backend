const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: {
        type:String,
        required: true,
        trim: true
    },
    sku: {
        type:String,
        required:true,
        unique:true,
        trim:true
    },

    category: {
        type:String,
        required:true,
        enum:['flower', 'edible', 'concentrate', 'topical', 'accessory', 'pre-roll']
    },
    subcategory: {
        type:String,
        enum: {
            values:['indica', 'sativa', 'hybrid', 'cbd','high-cbd','balanced','other'],
            message:'Invalid subcategory'
        }
    },

    cannabinoids: {
        thcPercentage: {
            type:Number,
            min:0,
            max:100,
            default:0
        },
        cbdPercentage: {
            type: Number,
            min: 0,
            max: 100,
            default:0
        },
        thcMg: {
            type:Number, // for edibles (total thc in mg)
            min:0
        },
        cbdMg: {
            type:Number, // for edibles (total CBD in mg)
            min:0
        }
    },

    //pricing and inventory
    pricing:[{
        unit:{
            type:String,
            required: true,
            enum:['gram', 'eighth', 'quarter', 'half', 'ounce', 'each', 'package']
        },
    weight: {
            type:Number, // weight in grams
            required: true
        },
    price: {
            type:Number,
            required: true,
            min:0
        }
    }],

    inventory: {
        currentStock: {
            type:Number,
            required: true,
            min: 0,
            default:0
        },
        unit:{
            type:String,
            required:true,
            enum:['gram', 'each', 'package'],
            default:'each'
        },
        lowStockAlert: {
            type: Number,
            default: 5
        }
    },

    // product details
    description:{
        type:String,
        maxlength:1000
    },
    effects:[{
        type:String,
        enum:['relaxed', 'euphoric', 'uplifted', 'creative', 'focused', 'sleepy', 'energetic', 'happy']
    }],
    flavors:[{
        type:String
    }],

    //compliance information
    compliance:{
        batchNumber: {
            type:String,
            required:true
        },
        labTested: {
            type:Boolean,
            default: false
        },
        testResults: {
            lab:String,
            passedTest:Boolean,
            pesticides:Boolean,
            residualSolvents:Boolean,
            heavyMetals:Boolean,
            microbials:Boolean
        },
        harvestDate:Date,
        packagedDate:Date,
        expirationDate:Date,
        licensedProducer:String,
        stateTrackingId:String // for seed-to-sale tracking
    },
    
    //business information
    supplier: {
        name:String,
        contact:String,
        license:String
    },

    //product status
    isActive: {
        type:Boolean,
        default:true
    },
    isAvailable:{
        type:Boolean,
        default:true
    },

    //metadata
    createdBy:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    images:[{
        url:String,
        alt:String
    }]
},{
    timestamps:true
});

//indexes for better query performance
ProductSchema.index({category:1,subcategory:1});
ProductSchema.index({'compliance.batchNumber':1});
ProductSchema.index({sku:1});
ProductSchema.index({name:'text', description:'text'});

//virtual for calculating inventory value
ProductSchema.virtual('inventoryValue').get(function(){
    if(this.pricing.length > 0) {
        const basePrice = this.pricing[0].price;
        return this.inventory.currentStock * basePrice
    }
    return 0;
});

//method to check if product is in stock
ProductSchema.methods.isInStock = function(requestedQuantity=1) {
    return this.inventory.currentStock >= requestedQuantity;
}

module.exports = mongoose.model('Product', ProductSchema);