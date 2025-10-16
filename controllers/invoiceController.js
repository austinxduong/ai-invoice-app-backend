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
        });
        
        await invoice.save();
        res.status(201).json(invoice);

    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error creating invoice", error: error.message });
    }
};

// get all invoices of logged inuser
exports.getInvoices = async(req, res) => {
    try {

    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error fetching invoice", error: error.message });
    }
};

// get single invoice by ID
exports.getInvoiceById = async (req, res) => {
    try {

    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error fetching invoice", error: error.message });
    }
};

// update a single invoice by its id
exports.updateInvoice = async (req, res) => {
    try {

    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error updating invoice", error: error.message });
    }
};

// delete a single invoice by its id
exports.deleteInvoice = async (req, res) => {
    try {

    } catch (error) {
        res 
            .status(500)
            .json({ message: "Error deleting invoice", error: error.message });
    }
};