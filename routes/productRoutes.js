const express = require('express');
const Product = require('../models/Product');
const { protect, requireAccess } = require('../middlewares/authMiddleware');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// GET /api/products - get all products with filtering
router.get('/', requireAuth, async(req, res) => {
    try {
        const {
            category,
            subcategory,
            inStock,
            lowStock,
            search,
            page = 1,
            limit = 20,
            sortBy = 'name'
        } = req.query

        // CRITICAL: Filter by organizationId
        const filter = { 
            organizationId: req.organizationId,  // ← Only this organization's products
            isActive: true 
        };

        if(category) filter.category = category;
        if(subcategory) filter.subcategory = subcategory;
        if(inStock === 'true') filter['inventory.currentStock'] = {$gt:0};
        if(lowStock === 'true') filter['inventory.currentStock'] = {$lte:5};
        if(search) {
            filter.$text = { $search: search};
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit)

        // Execute query
        const products = await Product.find(filter)
            .sort(sortBy)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('createdBy', 'firstName lastName');

        const total = await Product.countDocuments(filter);

        res.json({
            products,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total
            }
        });
    } catch (error) {
        res.status(500).json({message: 'Error fetching products', error: error.message})
    }
})

// GET /api/products/:id - get single product
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findOne({
            _id: req.params.id,
            organizationId: req.organizationId  // ← Security: verify ownership
        }).populate('createdBy', 'firstName lastName');

        if(!product) {
            return res.status(404).json({message: 'Product not found'});
        }

        res.json(product);
    } catch (error) {
        res.status(500).json({message: 'Error fetching product', error: error.message});
    }
});

// POST /api/products - create new product
router.post('/', requireAuth, async (req, res) => {
    try {
        const productData = {
            ...req.body,
            organizationId: req.organizationId,  // ← Tag with organization
            createdBy: req.userId                // ← Track creator
        };

        const product = new Product(productData);
        await product.save();

        res.status(200).json({
            message: 'Product created successfully',
            product
        });
    } catch (error) {
        res.status(400).json({message:'Error creating product', error: error.message});
    }
});

// POST /api/products/import - bulk import products (NEW!)
router.post('/import', requireAuth, async (req, res) => {
    try {
        const { products } = req.body;
        
        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Products array is required'
            });
        }
        
        const results = {
            success: [],
            errors: []
        };
        
        console.log(`📦 Importing ${products.length} products for org: ${req.organizationId}`);
        
        for (let i = 0; i < products.length; i++) {
            const productData = products[i];
            
            try {
                // CRITICAL: Add organizationId to each product
                const product = new Product({
                    ...productData,
                    organizationId: req.organizationId,  // ← Add organization ID
                    createdBy: req.userId                // ← Track who imported
                });
                
                await product.save();
                results.success.push({
                    index: i,
                    name: product.name,
                    sku: product.sku,
                    id: product._id
                });
                
                console.log(`✅ Imported: ${product.name} (${product.sku})`);
                
            } catch (error) {
                console.error(`❌ Import error for product ${i}:`, productData.name, error.message);
                results.errors.push({ 
                    index: i,
                    name: productData.name || productData.sku || 'Unknown',
                    sku: productData.sku,
                    error: error.message 
                });
            }
        }
        
        console.log(`📊 Import complete: ${results.success.length} success, ${results.errors.length} errors`);
        
        res.json({
            success: true,
            message: 'Import completed',
            successCount: results.success.length,
            errorCount: results.errors.length,
            successfulProducts: results.success,
            failedProducts: results.errors
        });
        
    } catch (error) {
        console.error('❌ Import endpoint error:', error);
        res.status(500).json({
            success: false,
            message: 'Import failed',
            error: error.message
        });
    }
});

// PUT /api/products/:id - update product
router.put('/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findOneAndUpdate(
            { 
                _id: req.params.id,
                organizationId: req.organizationId  // ← Security: verify ownership
            },
            req.body,
            {new: true, runValidators: true}
        );

        if(!product) {
            return res.status(404).json({message:'Product not found'});
        }

        res.json({
            message:'Product updated successfully',
            product
        });
    } catch(error) {
        res.status(400).json({message:'Error updating product', error: error.message});
    }
});

// DELETE /api/products/:id - soft delete product
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const product = await Product.findOneAndUpdate(
            {
                _id: req.params.id,
                organizationId: req.organizationId  // ← Security: verify ownership
            },
            {isActive: false},
            {new: true}
        );

        if(!product) {
            return res.status(404).json({message:'Product not found'});
        }
        
        res.json({message:'Product deleted successfully'});
    } catch(error) {
        res.status(500).json({message: 'Error deleting product', error: error.message});
    }
});

// GET /api/products/categories/stats - Get category statistics
router.get('/categories/stats', requireAuth, async (req, res) => {
    try {
        const stats = await Product.aggregate([
            {
                $match: {
                    organizationId: req.organizationId,  // ← Only this organization
                    isActive: true
                }
            },
            {
                $group:{
                    _id:'$category',
                    count:{$sum:1},
                    totalValue:{$sum:{$multiply:['$inventory.currentStock', '$pricing.0.price']}},
                    lowStockItems:{
                        $sum: {
                            $cond:[
                                { $lte:['$inventory.currentStock', '$inventory.lowStockAlert']},
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {$sort:{count:-1}}
        ]);

        res.json(stats);
    } catch (error) {
        res.status(500).json({message: 'Error fetching category stats', error: error.message})
    }
})

module.exports = router;