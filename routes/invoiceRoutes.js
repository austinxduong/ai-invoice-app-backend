const express = require("express");
const {
    createInvoice,
    getInvoices,
    getInvoiceById,
    updateInvoice,
    deleteInvoice,
} = require("../controllers/invoiceController.js");
const { protect } = require("../middlewares/authMiddleware.js");
const { requireAuth } = require("../middlewares/auth.middleware.js");

const router = express.Router();

// Use the NEW requireAuth middleware for multi-tenancy
router.route("/")
    .post(requireAuth, createInvoice)
    .get(requireAuth, getInvoices);

router  
    .route("/:id")
    .get(requireAuth, getInvoiceById)
    .put(requireAuth, updateInvoice)
    .delete(requireAuth, deleteInvoice)

module.exports = router;