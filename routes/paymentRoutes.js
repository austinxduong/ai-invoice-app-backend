const express = require('express');
const router = express.Router();
const DemoRequest = require('../models/DemoRequest');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Validate payment token and return demo data
router.get('/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;
    console.log('🔍 Validating payment token:', token);
    
    const demoRequest = await DemoRequest.findOne({ 
      paymentToken: token,
      paymentLinkExpires: { $gt: new Date() } // Not expired
    });
    
    if (!demoRequest) {
      console.log('❌ Invalid or expired token:', token);
      return res.status(404).json({ error: 'Invalid or expired payment link' });
    }
    
    // Mark as clicked if first time
    if (!demoRequest.paymentLinkClicked) {
      demoRequest.paymentLinkClicked = true;
      demoRequest.paymentLinkClickedAt = new Date();
      await demoRequest.save();
      console.log('👆 Payment link clicked for first time');
    }
    
    // Return demo data for payment page
    const responseData = {
      email: demoRequest.email,
      firstName: demoRequest.firstName,
      lastName: demoRequest.lastName,
      companyName: demoRequest.companyName,
      phone: demoRequest.phone,
      demoDate: demoRequest.createdAt,
      demoId: demoRequest._id
    };
    
    console.log('✅ Token validated for:', responseData.email);
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Error validating payment token:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create account from payment (TEST VERSION)
router.post('/create-account', async (req, res) => {
  try {
    const { email, firstName, lastName, company, paymentLinkId } = req.body;
    console.log('💳 Creating account for payment:', email);
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account already exists for this email' 
      });
    }
    
    // Generate temporary password
    const tempPassword = Math.random().toString(36).substring(2, 12);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    // Create user account
    const user = new User({
      email,
      name: `${firstName} ${lastName}`,
      businessName: company,
      password: hashedPassword,
      accessLevel: 'paid',
      subscriptionStatus: 'active',
      companyName: company,
      paymentCompleted: true,
      accountCreatedFromPayment: true,
      createdAt: new Date()
    });
    
    await user.save();
    
    // Update demo request status
    const demoRequest = await DemoRequest.findById(paymentLinkId);
    if (demoRequest) {
      demoRequest.status = 'closed_won';
      demoRequest.userAccountCreated = user._id;
      demoRequest.closedAt = new Date();
      await demoRequest.save();
    }
    
    console.log('✅ Account created successfully:', email);
    
    res.json({
      success: true,
      message: 'Account created successfully',
      tempPassword: tempPassword, // In production, send via email instead
      userId: user._id
    });
    
  } catch (error) {
    console.error('❌ Error creating account:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create account' 
    });
  }
});

module.exports = router;