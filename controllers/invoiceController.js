// backend/controllers/invoiceController.js
// ✅ UPDATED: Invoice controller with full product snapshot capture

const Invoice = require("../models/Invoice");
const Product = require("../models/Product");

// ========== CREATE INVOICE WITH COMPLIANCE SNAPSHOT ==========
exports.createInvoice = async (req, res) => {
    try {
        const user = req.user;
        const {
            invoiceNumber,
            invoiceDate,
            dueDate,
            billFrom,
            billTo,
            items,
            notes,
            paymentTerms,
        } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({
                message: "At least one item is required"
            });
        }

        console.log('📋 Creating invoice with', items.length, 'items');

        // ✅ CRITICAL: Fetch full product details for each item to capture snapshot
        const itemsWithCompliance = await Promise.all(
            items.map(async (item) => {
                try {
                    // Try to get product by ID or search by name
                    let product = null;
                    
                    if (item.productId || item._id) {
                        product = await Product.findById(item.productId || item._id);
                    }
                    
                    // If not found by ID, search by name
                    if (!product && item.name) {
                        const searchName = item.name.replace(/\s*\([^)]*\)/g, '').trim();
                        product = await Product.findOne({ 
                            name: searchName,
                            organizationId: req.organizationId 
                        });
                    }
                    
                    if (!product) {
                        console.warn('⚠️ Product not found for item:', item.name);
                        // Return basic item without full compliance data
                        return {
                            productId: item.productId || item._id,
                            name: item.name || item.description,
                            description: item.description,
                            sku: item.sku || 'UNKNOWN',
                            category: item.category || 'other',
                            quantity: item.quantity,
                            unit: item.unit || 'unit',
                            weight: item.weight || 0,
                            unitPrice: item.unitPrice || item.price,
                            taxPercent: item.taxPercent || 0,
                            batchNumber: 'UNKNOWN',
                            stateTrackingId: 'UNKNOWN',
                            thcContent: 0,
                            cbdContent: 0,
                            labTested: false,
                            packagedDate: new Date(),
                            licensedProducer: 'Unknown',
                            producerLicense: 'Unknown'
                        };
                    }
                    
                    console.log('✅ Captured product snapshot:', product.sku);
                    
                    // ========== CALCULATE WEIGHT IN GRAMS ==========
                    let weightInGrams = 0;
                    
                    // Check if item has explicit weight
                    if (item.weight) {
                        weightInGrams = item.weight;
                    } else {
                        // Calculate based on unit
                        if (item.unit === 'gram' || product.unit === 'gram') {
                            weightInGrams = item.quantity;
                        } else if (item.unit === 'eighth') {
                            weightInGrams = item.quantity * 3.5;
                        } else if (item.unit === 'quarter') {
                            weightInGrams = item.quantity * 7;
                        } else if (item.unit === 'half') {
                            weightInGrams = item.quantity * 14;
                        } else if (item.unit === 'ounce') {
                            weightInGrams = item.quantity * 28;
                        } else {
                            // Try to get from product pricing
                            const pricing = product.pricing?.find(p => 
                                p.unit === item.unit || 
                                p.size === item.unit
                            );
                            if (pricing && pricing.sizeInGrams) {
                                weightInGrams = item.quantity * pricing.sizeInGrams;
                            } else {
                                // Default: assume 1 unit = 1 gram
                                weightInGrams = item.quantity;
                            }
                        }
                    }
                    
                    // ========== CALCULATE THC/CBD IN MG ==========
                    const thcMg = (weightInGrams * (product.thcContent || 0)) / 100;
                    const cbdMg = (weightInGrams * (product.cbdContent || 0)) / 100;
                    
                    // ========== RETURN COMPLETE SNAPSHOT ==========
                    return {
                        // Product Identity
                        productId: product._id,
                        name: item.name || product.name,
                        description: product.description,
                        
                        // SKU & Category (Tier 1)
                        sku: product.sku,
                        category: product.category,
                        subcategory: product.subcategory,
                        strainType: product.strainType,
                        strainName: product.strain,
                        
                        // Quantity (Tier 1)
                        quantity: item.quantity,
                        unit: item.unit || product.unit || 'gram',
                        weight: weightInGrams,
                        
                        // Pricing
                        unitPrice: item.unitPrice || item.price,
                        subtotal: item.quantity * (item.unitPrice || item.price),
                        taxPercent: item.taxPercent || 0,
                        
                        // Cannabinoid Profile (Tier 1 - SNAPSHOT)
                        thcContent: product.thcContent,
                        cbdContent: product.cbdContent,
                        thcMg: thcMg,
                        cbdMg: cbdMg,
                        
                        // Compliance (Tier 1)
                        batchNumber: product.compliance?.batchNumber || 'N/A',
                        stateTrackingId: product.compliance?.stateTrackingId || 'N/A',
                        labTested: product.compliance?.labTested || false,
                        labTestDate: product.compliance?.labTestDate,
                        labTestResult: product.compliance?.labTestResult || 'pass',
                        
                        // Dates (Tier 1 & 2)
                        packagedDate: product.compliance?.packagedDate || new Date(),
                        harvestDate: product.compliance?.harvestDate,
                        expirationDate: product.compliance?.expirationDate,
                        
                        // Producer (Tier 1)
                        licensedProducer: product.compliance?.licensedProducer || product.supplier?.name || 'Unknown',
                        producerLicense: product.compliance?.producerLicense || product.supplier?.license || 'Unknown',
                        producerContact: product.supplier?.contact,
                        
                        // Additional (Tier 2)
                        productDescription: product.description,
                        
                        // Metrc
                        metrcPackageId: product.compliance?.metrcPackageId,
                        metrcTransferId: product.compliance?.metrcTransferId,
                        
                        // Notes
                        notes: item.notes
                    };
                    
                } catch (error) {
                    console.error('❌ Error capturing product snapshot:', error);
                    // Return basic item if error
                    return {
                        productId: item.productId || item._id,
                        name: item.name,
                        sku: item.sku || 'ERROR',
                        category: 'other',
                        quantity: item.quantity,
                        unit: 'unit',
                        weight: 0,
                        unitPrice: item.unitPrice || item.price,
                        taxPercent: item.taxPercent || 0,
                        batchNumber: 'ERROR',
                        stateTrackingId: 'ERROR',
                        thcContent: 0,
                        cbdContent: 0,
                        packagedDate: new Date(),
                        licensedProducer: 'Error',
                        producerLicense: 'Error',
                        labTested: false
                    };
                }
            })
        );

        // ========== CALCULATE TOTALS ==========
        let subtotal = 0;
        let taxTotal = 0;
        
        itemsWithCompliance.forEach((item) => {
            subtotal += item.unitPrice * item.quantity;
            taxTotal += ((item.unitPrice * item.quantity) * (item.taxPercent || 0)) / 100;
        });

        const total = subtotal + taxTotal;

        // ========== CREATE INVOICE ==========
        const invoice = new Invoice({
            organizationId: req.organizationId,
            user,
            invoiceNumber,
            invoiceDate,
            dueDate,
            billFrom,
            billTo,
            items: itemsWithCompliance,  // ✅ Use compliance-enriched items
            notes,
            paymentTerms,
            subtotal,
            taxTotal,
            total,
            createdBy: req.user._id,
            source: 'manual'
        });
        
        await invoice.save();
        
        // ========== LOG COMPLIANCE DATA ==========
        console.log('✅ Invoice created:', invoice.invoiceNumber, 'with full compliance data');
        
        // Calculate totals for logging
        const totalWeight = itemsWithCompliance.reduce((sum, item) => sum + (item.weight || 0), 0);
        const totalTHC = itemsWithCompliance.reduce((sum, item) => sum + (item.thcMg || 0), 0);
        const totalCBD = itemsWithCompliance.reduce((sum, item) => sum + (item.cbdMg || 0), 0);
        
        console.log('📊 Total weight:', totalWeight.toFixed(2), 'grams');
        console.log('📊 Total THC:', totalTHC.toFixed(2), 'mg');
        console.log('📊 Total CBD:', totalCBD.toFixed(2), 'mg');
        
        res.status(201).json(invoice);

    } catch (error) {
        console.error('❌ Create invoice error:', error);
        res.status(500).json({ 
            message: "Error creating invoice", 
            error: error.message 
        });
    }
};

// ========== GET ALL INVOICES ==========
// get all invoices for logged in user's organization
exports.getInvoices = async(req, res) => {
    try {
        // CRITICAL: Only get invoices from user's organization
        const invoices = await Invoice.find({
            organizationId: req.organizationId  // ← Filter by organization
        }).populate("user", "name email");
        
        res.json(invoices);
    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error fetching invoices", error: error.message });
    }
};

// ========== GET SINGLE INVOICE ==========
// get single invoice by ID
exports.getInvoiceById = async (req, res) => {
    try {
        // CRITICAL: Verify invoice belongs to user's organization
        const invoice = await Invoice.findOne({
            _id: req.params.id,
            organizationId: req.organizationId  // ← Security check
        }).populate("user", "name email");
        
        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        res.json(invoice);
        
    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error fetching invoice", error: error.message });
    }
};

// ========== UPDATE INVOICE ==========
// update a single invoice by its id
exports.updateInvoice = async (req, res) => {
    try {
        const {
            invoiceNumber,
            invoiceDate,
            dueDate,
            billFrom,
            billTo,
            items,
            notes,
            paymentTerms,
            status,
        } = req.body

        let subtotal = 0;
        let taxTotal = 0;
        if (items && items.length > 0) {
            items.forEach((item) => { 
                subtotal += item.unitPrice * item.quantity;
                taxTotal += ((item.unitPrice * item.quantity) * (item.taxPercent || 0)) / 100;
            });
        }

        const total = subtotal + taxTotal;

        // CRITICAL: Only update if invoice belongs to user's organization
        const updatedInvoice = await Invoice.findOneAndUpdate(
            {
                _id: req.params.id,
                organizationId: req.organizationId  // ← Security check
            },
            {
                invoiceNumber,
                invoiceDate,
                dueDate,
                billFrom,
                billTo,
                items,
                notes,
                paymentTerms,
                status,
                subtotal,
                taxTotal,
                total,
            },
            { new: true } 
        );

        if (!updatedInvoice) {
            return res.status(404).json({ message: "Invoice not found" });
        }
        
        res.json(updatedInvoice);
    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error updating invoice", error: error.message });
    }
};

// ========== DELETE INVOICE ==========
// delete a single invoice by its id
exports.deleteInvoice = async (req, res) => {
    try {
        // CRITICAL: Only delete if invoice belongs to user's organization
        const invoice = await Invoice.findOneAndDelete({
            _id: req.params.id,
            organizationId: req.organizationId  // ← Security check
        });
        
        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found"});
        }
        
        res.json({ message: "Invoice deleted successfully" });
    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error deleting invoice", error: error.message });
    }
};