require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require('./routes/authRoutes')
const invoiceRoutes = require('./routes/invoiceRoutes')
const aiRoutes = require('./routes/aiRoutes')
const productRoutes = require('./routes/productRoutes');

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

// routes
app.use("/api/auth", authRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/ai", aiRoutes)
app.use("/api/products", productRoutes);

// start server
const PORT = process.env.PORT || 8000;
app.listen(PORT,'0.0.0.0', () => console.log(`Server running on port ${PORT}`));