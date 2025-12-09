const express = require('express');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// POST /api/transactions - Create new transaction
router.post('/', protect, async (req, res) => {
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
            const product = await Product.findById(item.id);
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

            // Update product inventory
            if (product.inventory.currentStock < item.quantity) {
                return res.status(400).json({
                    message: `Insufficient inventory for ${product.name}`
                });
            }
            
            product.inventory.currentStock -= item.quantity;
            await product.save();
        }

        const transaction = new Transaction({
            transactionId,
            items: transactionItems,
            totals,
            discount,
            paymentMethod,
            cashReceived,
            customerInfo,
            receiptData,
            compliance: {
                employeeId: req.user._id,
                registerId: 'POS-001', // You can make this dynamic
            },
            createdBy: req.user._id
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
router.get('/', protect, async (req, res) => {
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

        // Build filter object
        const filter = { isActive: true };
        
        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        if (status) filter.status = status;
        if (paymentMethod) filter.paymentMethod = paymentMethod;
        if (employeeId) filter['compliance.employeeId'] = employeeId;

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
router.get('/:id', protect, async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id)
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
router.get('/reports/summary', protect, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                message: 'startDate and endDate are required'
            });
        }

        const summary = await Transaction.getSalesReport(startDate, endDate);
        
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
router.get('/reports/daily', protect, async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        
        // Start and end of the day
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const dailyData = await Transaction.aggregate([
            {
                $match: {
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
router.put('/:id/refund', protect, async (req, res) => {
    try {
        const { amount, reason } = req.body;
        
        const transaction = await Transaction.findById(req.params.id);
        
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
            refundedBy: req.user._id
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