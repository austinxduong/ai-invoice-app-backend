const express = require('express');
const { registerUser, loginUser, getMe, updateUserProfile, changePassword} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.route('/me').get(protect, getMe).put(protect, updateUserProfile);
router.put('/change-password', protect, changePassword); 

module.exports = router;