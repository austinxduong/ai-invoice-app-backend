const express = require('express');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const { protect, requireAccess } = require('../middlewares/authMiddleware');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

// POST /api/transactions - Create new transaction
router.post('/', requireAuth, async (req, res) => {
    try {
        const {
            transactionId,
            items,
            totals,
            discount,
            paymentMethod,
            cashReceived,
            customerInfo,
            receiptData
        } = req.body;

        // Convert item product IDs to ObjectIds and validate products exist
        const transactionItems = [];
        for (let item of items) {
            // CRITICAL: Only find products from this organization
            const product = await Product.findOne({
                _id: item.id,
                organizationId: req.organizationId  // ← Security check
            });
            
            if (!product) {
                return res.status(404).json({ 
                    message: `Product not found: ${item.name}` 
                });
            }

            transactionItems.push({
                productId: item.id,
                name: item.name,
                sku: item.sku,
                category: item.category,
                subcategory: item.subcategory,
                pricingOption: item.pricingOption,
                quantity: item.quantity,
                cannabis: item.cannabis || {}
            });

            // ✅ Update product inventory - Handle both old and new schema
            const currentStock = product.stockQuantity !== undefined 
                ? product.stockQuantity 
                : (product.inventory?.currentStock || 0);
            
            if (currentStock < item.quantity) {
                return res.status(400).json({
                    message: `Insufficient inventory for ${product.name}. Available: ${currentStock}, Requested: ${item.quantity}`
                });
            }
            
            // Update stock based on schema type
            if (product.stockQuantity !== undefined) {
                // New schema
                product.stockQuantity -= item.quantity;
            } else if (product.inventory) {
                // Old schema
                product.inventory.currentStock -= item.quantity;
            }
            
            await product.save();
        }

        const transaction = new Transaction({
            organizationId: req.organizationId,  // ← Tag with organization
            transactionId,
            items: transactionItems,
            totals,
            discount,
            paymentMethod,
            cashReceived,
            customerInfo,
            receiptData,
            compliance: {
                employeeId: req.userId,          // ← Use new auth
                registerId: 'POS-001',
            },
            createdBy: req.userId                // ← Track creator
        });

        await transaction.save();

        res.status(201).json({
            message: 'Transaction created successfully',
            transaction
        });

    } catch (error) {
        console.error('Transaction creation error:', error);
        res.status(500).json({
            message: 'Error creating transaction',
            error: error.message
        });
    }
});

// GET /api/transactions - Get transactions with filtering
router.get('/', requireAuth, async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            status,
            paymentMethod,
            employeeId,
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // CRITICAL: Filter by organizationId
        const filter = { 
            organizationId: req.organizationId,  // ← Only this organization
            isActive: true 
        };
        
        if (startDate && endDate) {
            console.log('🔍 Backend: Using localDateString for filtering');
            
            const startTargetDate = new Date(startDate).toLocaleDateString('en-US');
            const endTargetDate = new Date(endDate).toLocaleDateString('en-US');
            
            console.log('🔍 Backend: Date range filter:', {
                startDate: startDate,
                endDate: endDate,
                startTargetDate: startTargetDate,
                endTargetDate: endTargetDate
            });
            
            // Get ALL transactions for this organization
            const allTransactions = await Transaction.find({ 
                organizationId: req.organizationId,  // ← Filtered
                isActive: true,
                'receiptData.localDateString': { $exists: true }
            }).select('transactionId receiptData.localDateString paymentMethod').limit(10);
            
            console.log('🔍 Backend: Transactions in database for this org:');
            allTransactions.forEach(txn => {
                console.log(`  - ${txn.transactionId}: "${txn.receiptData?.localDateString}" (${txn.paymentMethod})`);
            });
            
            if (startTargetDate === endTargetDate) {
                console.log('🔍 Backend: Single day - exact match filter');
                filter['receiptData.localDateString'] = startTargetDate;
                
                const testResult = await Transaction.find({
                    organizationId: req.organizationId,  // ← Filtered
                    isActive: true,
                    'receiptData.localDateString': startTargetDate
                }).select('transactionId receiptData.localDateString');
                
                console.log(`🔍 Backend: Exact match test found ${testResult.length} transactions:`);
                testResult.forEach(txn => {
                    console.log(`  - ${txn.transactionId}: "${txn.receiptData?.localDateString}"`);
                });
                
            } else {
                console.log('🔍 Backend: Date range filter');
                const allDatesInRange = [];
                const currentDate = new Date(startDate);
                const endDateObj = new Date(endDate);
                
                while (currentDate <= endDateObj) {
                    allDatesInRange.push(currentDate.toLocaleDateString('en-US'));
                    currentDate.setDate(currentDate.getDate() + 1);
                }
                
                console.log('🔍 Backend: Dates in range:', allDatesInRange);
                filter['receiptData.localDateString'] = { $in: allDatesInRange };
            }
        }
        
        if (status) filter.status = status;
        if (paymentMethod) filter.paymentMethod = paymentMethod;
        if (employeeId) filter['compliance.employeeId'] = employeeId;

        console.log('🔍 Backend: Final filter object:', JSON.stringify(filter, null, 2));

        const testActualQuery = await Transaction.find(filter).select('transactionId receiptData.localDateString');
        console.log(`🔍 Backend: Actual query found ${testActualQuery.length} transactions`);

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        // Execute query
        const transactions = await Transaction.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('compliance.employeeId', 'firstName lastName')
            .populate('createdBy', 'firstName lastName');

        console.log(`🔍 Backend: Final paginated query found ${transactions.length} transactions`);

        const total = await Transaction.countDocuments(filter);

        res.json({
            transactions,
            pagination: {
                current: parseInt(page),
                pages: Math.ceil(total / parseInt(limit)),
                total
            }
        });

    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({
            message: 'Error fetching transactions',
            error: error.message
        });
    }
});

// GET /api/transactions/:id - Get single transaction
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const transaction = await Transaction.findOne({
            _id: req.params.id,
            organizationId: req.organizationId  // ← Security check
        })
            .populate('compliance.employeeId', 'firstName lastName')
            .populate('createdBy', 'firstName lastName')
            .populate('items.productId');

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json(transaction);
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({
            message: 'Error fetching transaction',
            error: error.message
        });
    }
});

// GET /api/transactions/reports/summary - Get sales summary for date range
router.get('/reports/summary', requireAuth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                message: 'startDate and endDate are required'
            });
        }

        // Note: You'll need to update getSalesReport method to accept organizationId
        const summary = await Transaction.getSalesReport(
            startDate, 
            endDate, 
            req.organizationId  // ← Pass organization filter
        );
        
        res.json({
            summary: summary[0] || {
                totalTransactions: 0,
                totalRevenue: 0,
                totalTax: 0,
                totalItems: 0,
                averageTransaction: 0,
                paymentMethods: []
            }
        });

    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({
            message: 'Error generating sales report',
            error: error.message
        });
    }
});

// GET /api/transactions/reports/daily - Get daily sales data
router.get('/reports/daily', requireAuth, async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const dailyData = await Transaction.aggregate([
            {
                $match: {
                    organizationId: req.organizationId,  // ← Filter by organization
                    createdAt: { $gte: startOfDay, $lte: endOfDay },
                    status: 'completed',
                    isActive: true
                }
            },
            {
                $group: {
                    _id: null,
                    transactionCount: { $sum: 1 },
                    totalSales: { $sum: '$totals.grandTotal' },
                    totalTax: { $sum: '$totals.taxAmount' },
                    totalItems: { $sum: { $sum: '$items.quantity' } },
                    averageTransaction: { $avg: '$totals.grandTotal' },
                    paymentMethodBreakdown: {
                        $push: {
                            method: '$paymentMethod',
                            amount: '$totals.grandTotal'
                        }
                    }
                }
            }
        ]);

        res.json({
            date: targetDate.toISOString().split('T')[0],
            data: dailyData[0] || {
                transactionCount: 0,
                totalSales: 0,
                totalTax: 0,
                totalItems: 0,
                averageTransaction: 0,
                paymentMethodBreakdown: []
            }
        });

    } catch (error) {
        console.error('Error generating daily report:', error);
        res.status(500).json({
            message: 'Error generating daily report',
            error: error.message
        });
    }
});

// PUT /api/transactions/:id/refund - Process refund
router.put('/:id/refund', requireAuth, async (req, res) => {
    try {
        const { amount, reason } = req.body;
        
        const transaction = await Transaction.findOne({
            _id: req.params.id,
            organizationId: req.organizationId  // ← Security check
        });
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        if (!transaction.canBeRefunded()) {
            return res.status(400).json({
                message: 'Transaction cannot be refunded'
            });
        }

        transaction.status = amount === transaction.totals.grandTotal 
            ? 'refunded' 
            : 'partially_refunded';
            
        transaction.refund = {
            amount,
            reason,
            refundedAt: new Date(),
            refundedBy: req.userId  // ← Track who refunded
        };

        await transaction.save();

        res.json({
            message: 'Refund processed successfully',
            transaction
        });

    } catch (error) {
        console.error('Error processing refund:', error);
        res.status(500).json({
            message: 'Error processing refund',
            error: error.message
        });
    }
});

module.exports = router;