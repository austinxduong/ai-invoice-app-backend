const jwt = require("jsonwebtoken");
const User = require("../models/User");

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });
}

// register user
exports.registerUser = async (req, res) => {
    const { name, email, password } = req.body;

    try {
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// login user
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// get current logged-in user
exports.getMe = async (req, res) => {

    try {
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// update user profile
exports.updateUserProfile = async (req, res) => {
    
    try {
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};