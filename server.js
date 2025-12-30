require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

// Existing route imports
const authRoutes = require('./routes/authRoutes')
const invoiceRoutes = require('./routes/invoiceRoutes')
const aiRoutes = require('./routes/aiRoutes')
const productRoutes = require('./routes/productRoutes');
const transactionRoutes = require('./routes/transactionRoutes')
const demoRoutes = require('./routes/demoRoutes')
const paymentRoutes = require('./routes/paymentRoutes');
const rmaRoutes = require('./routes/rma.routes');
const organizationRoutes = require('./routes/organizationRoutes');

// NEW: Multi-tenancy route imports ⬇️⬇️⬇️
const newAuthRoutes = require('./routes/auth.routes');
const teamRoutes = require('./routes/team.routes');

const { protect, requireAccess } = require('./middlewares/authMiddleware')


const app = express();

app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'http://localhost:5173',
        'http://172.20.20.20:5173',
        'http://localhost:3000',
        'https://ai-invoice-app-b2ec.onrender.com', 
        'https://crustless-diastrophic-thi.ngrok-free.dev'
    ];

    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) {
        const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;

        if (forwardedHost && forwardedHost.includes('ngrok-free.dev')) {
            res.setHeader('Access-Control-Allow-Origin', 'https://crustless-diastrophic-thi.ngrok-free.dev');
        } else {
            res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        }
    } else if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, ngrok-skip-browser-warning')
    res.setHeader('Access-Control-Max-Age', '3600');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
});

//connect database
connectDB();

// middleware
app.use(express.json());
console.log('Mongo URI:', process.env.MONGO_URI);

// Existing routes
app.use("/api/auth", authRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/ai", aiRoutes)
app.use("/api/products", productRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api', demoRoutes)
app.use('/api/payment', paymentRoutes);
app.use('/api/rma', rmaRoutes);
app.use('/api/organization', organizationRoutes);

// NEW: Multi-tenancy routes ⬇️⬇️⬇️
app.use('/api/auth-new', newAuthRoutes);  // New auth endpoints (register, login with org)
app.use('/api/team', teamRoutes);          // Team management endpoints

// start server
const PORT = process.env.PORT || 8000;
app.listen(PORT,'0.0.0.0', () => console.log(`Server running on port ${PORT}`));