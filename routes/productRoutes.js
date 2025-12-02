const express = require('express');
const Product = require('../models/Product');
const {protect} = require('../middlewares/authMiddleware')

const router = express.Router();

// GET /api/products - get all products with filtering
router.get('/', protect, async(req, res) => {
    try {
        const {
            category,
            subcategory,
            inStock,
            lowStock,
            search,
            page=1,
            limit=20,
            sortBy = 'name'
        } = req.query

        // build filter object
        const filter = { isActive:true };

        if(category) filter.category = category;
        if(subcategory) filter.subcategory = subcategory;
        if(inStock === 'true') filter['inventory.currentStock'] = {$gt:0};
        if(lowStock === 'true') filter['inventory.currentStock'] = {$lte:5};
        if(search) {
            filter.$text = { $search:search};
        }

        //calculate pagination
        const skip = (parseInt(page) -1) *parseInt(limit)

        //execute query
        const products = await Product.find(filter)
        .sort(sortBy)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'firstName lastName');

        const total = await Product.countDocuments(filter);

        res.json({
            products,
            pagination: {
                current:parseInt(page),
                pages: Math.ceil(total/ parseInt(limit)),
                total
            }
        });
    } catch (error) {
        res.status(500).json({message: 'Error fetching products', error:error.message})
    }
})

// GET /api/products/:id - get single product
router.get('/:id',protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
        .populate('createdBy', 'firstName lastName');

        if(!product) {
            return res.status(404).json({message: 'Product not found'});
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({message: 'Error fetching product', error: error.message});
    }
});

// POST /api/products - create new product
router.post('/', protect, async (req, res) => {
    try {
        const productData = {
            ...req.body,
            createdBy:req.user._id
        };

        const product = new Product(productData);
        await product.save();

        res.status(200).json({
            message: 'Product created successfully',
            product
        });
    } catch (error) {
        res.status(400).json({message:'Error creating product', error:error.message});
    }
});