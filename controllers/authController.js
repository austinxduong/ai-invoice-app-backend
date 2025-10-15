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
        const user = await User.findOne({ email }).select("+password");

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                token: generateToken(user._id),

                businessName: user.businessName || "",
                address: user.address || "",
                phone: user.phone || "",
            });
        } else {
            res.status(401).json({ message: "invalid credentials"});
        }
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// get current logged-in user
exports.getMe = async (req, res) => {

    try {
        const user = await User.findById(req.user.id);
        res.json({
            _id:user._id,
            name: user.name,
            email: user.email,

            businessName: user.businessName || "",
            address: user.address || "",
            phone: user.phone || "",
        });
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};

// update user profile
exports.updateUserProfile = async (req, res) => {

    try {
        const user = await User.findById(req.user.id);

        if (user) {
            user.name = req.body.name || user.name;
            user.businessName = req.body.businessName || user.businessName;
            user.address = req.body.address || user.address;
            user.phone = req.body.phone || user.phone;

            const updatedUser = await user.save();

            res.json({
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                businessName: updatedUser.businessName,
                address: updatedUser.address,
                phone: updatedUser.phone,
            })
        } else {
            res.status(404).json({ message: "user not found" });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};