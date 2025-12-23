const express = require("express");
const { parseInvoiceFromText, generateReminderEmail, getDashboardSummary } = require("../controllers/aiController")
const { protect } = require("../middlewares/authMiddleware");
const { requireAuth } = require("../middlewares/auth.middleware");

const router = express.Router();

// Use the NEW requireAuth middleware for multi-tenancy
router.post("/parse-text", requireAuth, parseInvoiceFromText);
router.post("/generate-reminder", requireAuth, generateReminderEmail);
router.get("/dashboard-summary", requireAuth, getDashboardSummary);

module.exports = router;