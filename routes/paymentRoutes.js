// backend/routes/payment.routes.js (COMPLETE - Updated for Enhanced Payment Form)
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const DemoRequest = require('../models/DemoRequest');
const User = require('../models/User');
const Organization = require('../models/Organization');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ✅ UPDATED: Welcome email with separate billing and account emails
const sendWelcomeEmail = async (billingEmail, accountEmail, firstName, company, organizationId, licenseQuantity, monthlyAmount) => {
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
        .org-code { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #059669; }
        .info-box { background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; }
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
            
            <p>Congratulations! Your payment has been processed successfully and your <strong>${company}</strong> account is now active.</p>
            
            <div class="org-code">
                <h3 style="margin-top: 0;">🏢 Organization Details:</h3>
                <p style="margin: 5px 0;"><strong>Organization ID:</strong> <span style="font-size: 16px; font-weight: bold; color: #059669;">${organizationId}</span></p>
                <p style="margin: 5px 0;"><strong>Company:</strong> ${company}</p>
                <p style="margin: 5px 0;"><strong>User Licenses:</strong> ${licenseQuantity} user${licenseQuantity > 1 ? 's' : ''}</p>
                <p style="margin: 5px 0;"><strong>Monthly Cost:</strong> $${monthlyAmount}</p>
                <p style="font-size: 12px; color: #666; margin-top: 10px;">
                    Save this Organization ID - you'll need it for support and team invitations.
                </p>
            </div>
            
            <h3>🔐 Your Login Information:</h3>
            <div class="info-box">
                <p style="margin: 5px 0;"><strong>Login Email:</strong> ${accountEmail}</p>
                <p style="margin: 5px 0;"><strong>Password:</strong> [The password you created during signup]</p>
            </div>
            
            <h3>💰 Billing Information:</h3>
            <div class="info-box">
                <p style="margin: 5px 0;"><strong>Billing Email:</strong> ${billingEmail}</p>
                <p style="font-size: 13px; color: #666; margin-top: 8px;">
                    Invoices and receipts will be sent to this email address.
                </p>
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
                ${licenseQuantity > 1 ? `<li>✅ Invite ${licenseQuantity - 1} team member${licenseQuantity > 2 ? 's' : ''} to collaborate</li>` : ''}
                <li>✅ Import your existing data (if any)</li>
                <li>✅ Our team will contact you for onboarding within 24 hours</li>
            </ul>
            
            <p><strong>Need help getting started?</strong> Reply to this email or contact support - we're here to help!</p>
            
            <p>Welcome to the Cannabis ERP family!</p>
            
            <p>Best regards,<br>
            Austin Duong<br>
            Cannabis ERP Solutions</p>
        </div>
        
        <div class="footer">
            <p>Organization ID: ${organizationId} | Company: ${company}</p>
            <p>If you have any questions, just reply to this email or contact support.</p>
        </div>
    </div>
</body>
</html>`;

  // ✅ Send to BOTH billing and account emails
  const recipients = [billingEmail];
  if (accountEmail !== billingEmail) {
    recipients.push(accountEmail);
  }

  const mailOptions = {
    from: `"Cannabis ERP Solutions" <${process.env.SMTP_USER}>`,
    to: recipients.join(', '),
    subject: `🎉 Welcome to Cannabis ERP! Your account is ready (Org ID: ${organizationId})`,
    html: welcomeEmailTemplate
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent to:', recipients.join(', '));
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
    // Don't throw - we don't want to fail account creation if email fails
  }
};

// Validate payment token
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
    
    if (!demoRequest.paymentLinkClicked) {
      demoRequest.paymentLinkClicked = true;
      demoRequest.paymentLinkClickedAt = new Date();
      await demoRequest.save();
      console.log('👆 Payment link clicked for first time');
    }
    
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

// ✅ NEW: Check if email already exists BEFORE payment
router.post('/check-email', async (req, res) => {
  try {
    const { accountEmail } = req.body;
    
    console.log('🔍 Checking if email exists:', accountEmail);
    
    const existingUser = await User.findOne({ 
      email: accountEmail.toLowerCase() 
    });
    
    if (existingUser) {
      console.log('❌ Email already exists:', accountEmail);
      return res.status(400).json({ 
        success: false,
        error: 'An account with this email already exists. Please login instead.' 
      });
    }
    
    console.log('✅ Email is available:', accountEmail);
    res.json({ 
      success: true,
      available: true 
    });
    
  } catch (error) {
    console.error('❌ Error checking email:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check email availability' 
    });
  }
});

// ✅ UPDATED: Create Stripe Payment Intent with license quantity & idempotencyKey
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency, demoId, billingEmail, licenseQuantity, idempotencyKey } = req.body;
    
    console.log('💳 Creating payment intent...');
    console.log('   Amount:', amount);
    console.log('   Billing Email:', billingEmail);
    console.log('   Licenses:', licenseQuantity);
    console.log('   Idempotency Key:', idempotencyKey);  // ✅ Log for debugging
    
    const demoRequest = await DemoRequest.findById(demoId);
    if (!demoRequest) {
      return res.status(404).json({ error: 'Demo request not found' });
    }

    // Create or retrieve Stripe customer
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: billingEmail,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log('✅ Found existing Stripe customer:', customer.id);
    } else {
      customer = await stripe.customers.create({
        email: billingEmail,
        name: `${demoRequest.firstName} ${demoRequest.lastName}`,
        metadata: {
          demoId: demoId,
          companyName: demoRequest.companyName,
          licenseQuantity: licenseQuantity || 1
        }
      });
      console.log('✅ Created new Stripe customer:', customer.id);
    }

    // ✅ Create payment intent with idempotency key
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      customer: customer.id,
      metadata: {
        demoId: demoId,
        billingEmail: billingEmail,
        companyName: demoRequest.companyName,
        licenseQuantity: licenseQuantity || 1,
        monthlyAmount: amount / 100
      },
      description: `Cannabis ERP - ${licenseQuantity || 1} User License${licenseQuantity > 1 ? 's' : ''}`,
      receipt_email: billingEmail,
    }, {
      idempotencyKey: idempotencyKey  // ✅ Second parameter - prevents duplicate charges!
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

// ✅ UPDATED: Create account with separate billing and account emails
router.post('/create-account', async (req, res) => {
  try {
    const { 
      // Organization details
      companyName,
      licenseQuantity,
      monthlyAmount,
      
      // Owner account details
      accountEmail,        // ✅ NEW: Login email
      password,
      firstName, 
      lastName,
      
      // Billing details
      billingEmail,        // ✅ NEW: Billing email
      
      // Payment details
      paymentLinkId,
      paymentIntentId,
      stripeCustomerId,
      cardLast4,
    } = req.body;
    
    console.log('💳 Creating account with enhanced details...');
    console.log('   Company:', companyName);
    console.log('   Account Email (login):', accountEmail);
    console.log('   Billing Email:', billingEmail);
    console.log('   Licenses:', licenseQuantity);
    console.log('   Monthly Amount:', monthlyAmount);
    
    // Verify Stripe payment
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
    
    // Check if account email already exists
    const existingUser = await User.findOne({ email: accountEmail.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        error: 'An account with this email already exists' 
      });
    }
    
    // ✅ Create Organization with billing email
    const organization = new Organization({
      companyName: companyName,
      billingEmail: billingEmail.toLowerCase(),
      stripeCustomerId: stripeCustomerId,
      stripeSubscriptionId: null,
      subscriptionStatus: 'active',
      subscriptionPlan: 'starter',
      currentUsers: 1,
      maxUsers: licenseQuantity || 5,
      basePlan: 299,
      pricePerUser: 149
    });
    
    await organization.save();
    console.log('✅ Organization created:', organization.organizationId);
    
    // ✅ Create Owner User with account email
    const user = new User({
      email: accountEmail.toLowerCase(),
      password: password,
      firstName: firstName,
      lastName: lastName,
      organizationId: organization.organizationId,
      role: 'owner',
      isOwner: true,
      isActive: true,
      permissions: User.getDefaultPermissions('owner'),
      emailVerified: false
    });
    
    await user.save();
    console.log('✅ Owner user created:', user.email);
    
    // Update organization with ownerId
    organization.ownerId = user._id;
    await organization.save();
    
    // Update demo request status
    const demoRequest = await DemoRequest.findById(paymentLinkId);
    if (demoRequest) {
      demoRequest.status = 'closed_won';
      demoRequest.userAccountCreated = user._id;
      demoRequest.closedAt = new Date();
      await demoRequest.save();
      console.log('✅ Demo request updated to closed_won');
    }
    
    // ✅ Send welcome email to both billing and account emails
    try {
      await sendWelcomeEmail(
        billingEmail,
        accountEmail,
        firstName,
        companyName,
        organization.organizationId,
        licenseQuantity || 1,
        monthlyAmount || 299
      );
    } catch (emailError) {
      console.error('⚠️ Welcome email failed (but account created):', emailError);
    }
    
    // Generate JWT token for auto-login
    const token = jwt.sign(
      {
        userId: user._id,
        organizationId: organization.organizationId,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    console.log('✅ Account creation complete!');
    console.log('   Organization ID:', organization.organizationId);
    console.log('   Owner Email:', user.email);
    console.log('   Billing Email:', organization.billingEmail);
    console.log('   Licenses:', organization.maxUsers);
    
    res.json({
      success: true,
      message: 'Account created successfully',
      token: token,
      userId: user._id,
      organizationId: organization.organizationId,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationName: organization.companyName,
        licenseQuantity: organization.maxUsers
      }
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
