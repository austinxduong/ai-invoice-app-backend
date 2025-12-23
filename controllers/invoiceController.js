const Invoice = require("../models/Invoice");

// create invoice
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

        let subtotal = 0;
        let taxTotal = 0;
        items.forEach((item) => {
            subtotal += item.unitPrice * item.quantity;
            taxTotal += ((item.unitPrice * item.quantity) * (item.taxPercent || 0)) / 100;
        });

        const total = subtotal + taxTotal;

        const invoice = new Invoice({
            organizationId: req.organizationId,  // ← CRITICAL: Tag with organization
            user,
            invoiceNumber,
            invoiceDate,
            dueDate,
            billFrom,
            billTo,
            items,
            notes,
            paymentTerms,
            subtotal,
            taxTotal,
            total,
            createdBy: req.user._id  // ← Track who created it
        });
        
        await invoice.save();
        res.status(201).json(invoice);

    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error creating invoice", error: error.message });
    }
};

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