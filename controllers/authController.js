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
        if (!name || !email || !password) {
            return res.status(400).json({ message: "please fill out all fields" });
        }

        //checks if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User already exists "});
        }

        // create user
        const user = await User.create({ name, email, password });

        if (user) {
            res.status(201).json({
                _id: user._id,
                name: user.name,
                email: user.email,
                token: generateToken(user._id),
            });
        } else {
            res.status(400).json({ message: "invalid user data" });
        }
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