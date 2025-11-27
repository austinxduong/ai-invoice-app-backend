require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require('./routes/authRoutes')
const invoiceRoutes = require('./routes/invoiceRoutes')
const aiRoutes = require('./routes/aiRoutes')

const app = express();

app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'http://localhost:5173',
        'http://172.20.20.20:5173',
        'http://localhost:3000'
    ];

    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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

// start server
const PORT = process.env.PORT || 8000;
app.listen(PORT,'0.0.0.0', () => console.log(`Server running on port ${PORT}`));