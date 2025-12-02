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
            enum:['gram', 'eigth', 'quarter', 'half', 'ounce', 'each', 'package']
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
        enum:['relaxed', 'eurphoric', 'uplifted', 'creative', 'focused', 'sleepy', 'engergetic', 'happy']
    }],
    flavors:[{
        type:String
    }],
})