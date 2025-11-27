require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");

const authRoutes = require('./routes/authRoutes')
const invoiceRoutes = require('./routes/invoiceRoutes')
const aiRoutes = require('./routes/aiRoutes')

const app = express();

app.use(
        cors({
        origin: [
            'http://localhost:5173',
            'http://172.20.20.20:5173', // Your local IP
            'http://localhost:3000',    // Backup port
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 200 // for legacy browser support
    })
);

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