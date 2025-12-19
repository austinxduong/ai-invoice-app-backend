const express = require('express');
const router = express.Router();
const DemoRequest = require('../models/DemoRequest');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

const nodemailer = require('nodemailer');

// Email transporter (using same config as demoRoutes)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Welcome email function
const sendWelcomeEmail = async (email, firstName, company) => {
  const welcomeEmailTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #059669, #047857); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #fff; padding: 30px; border: 1px solid #e5e5e5; }
        .cta-button { display: inline-block; background: #059669; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to Cannabis ERP, ${firstName}!</h1>
        </div>
        
        <div class="content">
            <p>Hi ${firstName},</p>
            
            <p>Congratulations! Your payment has been processed successfully and your ${company} account is now active.</p>
            
            <h3>🔑 Your Login Information:</h3>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p><strong>Email:</strong> ${email}<br>
                <strong>Password:</strong> [The password you created during signup]</p>
            </div>
            
            <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL}/login" class="cta-button">
                    🚀 Access Your Dashboard
                </a>
            </div>
            
            <h3>🌟 What's next?</h3>
            <ul>
                <li>✅ Log in to your new account</li>
                <li>✅ Complete your company profile setup</li>
                <li>✅ Import your existing data (if any)</li>
                <li>✅ Our team will contact you for onboarding within 24 hours</li>
            </ul>
            
            <p><strong>Need help getting started?</strong> Reply to this email or call us - we're here to help!</p>
            
            <p>Welcome to the Cannabis ERP family!</p>
            
            <p>Best regards,<br>
            Austin Duong<br>
            Cannabis ERP Solutions</p>
        </div>
        
        <div class="footer">
            <p>This account was created for ${company}. If you have any questions, just reply to this email.</p>
        </div>
    </div>
</body>
</html>`;

  const mailOptions = {
    from: `"Cannabis ERP Solutions" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `🎉 Welcome to Cannabis ERP! Your account is ready`,
    html: welcomeEmailTemplate
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent to:', email);
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
    throw error;
  }
};

module.exports = router;


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
    
    // Create user account
    const user = new User({
      email,
      name: `${firstName} ${lastName}`,
      businessName: company,
      password: tempPassword,
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
    
    // Send welcome email with login credentials
    try {
      await sendWelcomeEmail(email, firstName, company);
      console.log('✅ Welcome email sent successfully');
    } catch (emailError) {
      console.error('⚠️ Account created but email failed:', emailError.message);
      // Don't fail the whole request if email fails
    }
    
    console.log('✅ Account created successfully:', email);
    
    res.json({
    success: true,
    message: 'Account created successfully',
    tempPassword: tempPassword, // Add this back
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

// Debug route - REMOVE after testing
router.get('/debug-user/:email', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) {
      return res.json({ error: 'User not found' });
    }
    
    res.json({
      email: user.email,
      name: user.name,
      accessLevel: user.accessLevel,
      subscriptionStatus: user.subscriptionStatus,
      hasPassword: !!user.password,
      passwordLength: user.password ? user.password.length : 0,
      accountCreatedFromPayment: user.accountCreatedFromPayment
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
