const express = require('express');
const { registerUser, loginUser, getMe, updateUserProfile } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.route('/me').get(protect, getMe).put(protect, updateUserProfile);

app.options('http://localhost:8000', function(req, res, next){
   res.header('Access-Control-Allow-Origin', "*");
   res.header('Access-Control-Allow-Methods', 'POST');
   res.header("Access-Control-Allow-Headers", "accept, content-type");
   res.header("Access-Control-Max-Age", "1728000");
   return res.sendStatus(200);
})

module.exports = router;