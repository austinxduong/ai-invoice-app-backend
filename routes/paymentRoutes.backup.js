const express = require('express');
const router = express.Router();
const DemoRequest = require('../models/DemoRequest');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// ADD THIS - Stripe integration
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

// Welcome email function (KEEP YOUR EXISTING ONE)
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
    // Don't throw - we don't want to fail account creation if email fails
  }
};

// KEEP YOUR EXISTING /validate/:token ROUTE (it's good!)
router.get('/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;
    console.log('🔍 Validating payment token:', token);
    
    const demoRequest = await DemoRequest.findOne({ 
      paymentToken: token,
      paymentLinkExpires: { $gt: new Date() }
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

// ADD THIS NEW ROUTE - Create Stripe Payment Intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, demoId, email } = req.body;
    
    console.log('💳 Creating payment intent for:', email);
    
    // Validate demo request exists
    const demoRequest = await DemoRequest.findById(demoId);
    if (!demoRequest) {
      return res.status(404).json({ error: 'Demo request not found' });
    }

    // Create or retrieve Stripe customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log('✅ Found existing Stripe customer:', customer.id);
    } else {
      customer = await stripe.customers.create({
        email: email,
        name: `${demoRequest.firstName} ${demoRequest.lastName}`,
        metadata: {
          demoId: demoId,
          companyName: demoRequest.companyName
        }
      });
      console.log('✅ Created new Stripe customer:', customer.id);
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // Amount in cents (29900 = $299.00)
      currency: currency,
      customer: customer.id,
      metadata: {
        demoId: demoId,
        email: email,
        companyName: demoRequest.companyName
      },
      description: `Cannabis ERP Platform - Monthly Subscription`,
      receipt_email: email,
    });

    console.log('✅ Payment intent created:', paymentIntent.id);

    res.json({
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id
    });
  } catch (error) {
    console.error('❌ Payment intent creation error:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment intent' });
  }
});

// UPDATE YOUR EXISTING /create-account ROUTE
router.post('/create-account', async (req, res) => {
  try {
    const { 
      email, 
      firstName, 
      lastName, 
      company, 
      password, 
      paymentLinkId,
      paymentIntentId,  // NEW - from Stripe
      paymentData       // NEW - from Stripe
    } = req.body;
    
    console.log('💳 Creating account for payment:', email);
    
    // If paymentIntentId exists, verify payment with Stripe
    if (paymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        
        if (paymentIntent.status !== 'succeeded') {
          return res.status(400).json({ 
            success: false, 
            error: 'Payment not completed. Please try again.' 
          });
        }
        
        console.log('✅ Stripe payment verified:', paymentIntentId);
      } catch (stripeError) {
        console.error('❌ Stripe verification error:', stripeError);
        return res.status(400).json({ 
          success: false, 
          error: 'Could not verify payment. Please contact support.' 
        });
      }
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'Account already exists for this email' 
      });
    }
    
    // Create user account with custom password and email
    const user = new User({
      email,
      name: `${firstName} ${lastName}`,
      businessName: company,
      password: password, // User model will hash it
      accessLevel: 'paid',
      subscriptionStatus: 'active',
      companyName: company,
      paymentCompleted: true,
      accountCreatedFromPayment: true,
      stripeCustomerId: paymentData?.stripeCustomerId, // Store Stripe customer ID
      createdAt: new Date()
    });
    
    await user.save();
    console.log('✅ User account created:', email);
    
    // Update demo request status
    const demoRequest = await DemoRequest.findById(paymentLinkId);
    if (demoRequest) {
      demoRequest.status = 'closed_won';
      demoRequest.userAccountCreated = user._id;
      demoRequest.closedAt = new Date();
      await demoRequest.save();
      console.log('✅ Demo request updated to closed_won');
    }
    
    // Send welcome email
    try {
      await sendWelcomeEmail(email, firstName, company);
    } catch (emailError) {
      console.error('⚠️ Welcome email failed (but account created):', emailError);
    }
    
    console.log('✅ Account creation complete for:', email);
    
    res.json({
      success: true,
      message: 'Account created successfully',
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

// KEEP YOUR DEBUG ROUTE (optional - for testing)
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
      accountCreatedFromPayment: user.accountCreatedFromPayment,
      stripeCustomerId: user.stripeCustomerId || 'Not set'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;