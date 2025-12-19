const express = require('express');
const router = express.Router();
const DemoRequest = require('../models/DemoRequest');
const User = require('../models/User');
const { protect, requireAdmin, requireSalesAccess } = require('../middlewares/authMiddleware');

const crypto = require('crypto');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})


// Submit demo request (PUBLIC ROUTE - no authentication required)
router.post('/demo-requests', async (req, res) => {
  try {
    console.log('📝 Demo request received:', req.body);
    
    const demoRequest = new DemoRequest(req.body);
    await demoRequest.save();
    
    console.log('✅ Demo request saved:', demoRequest._id);
    
    // Generate unique payment token
    const paymentToken = crypto.randomBytes(32).toString('hex');
    
    // Store payment link in demo request (add this field to your DemoRequest model)
    demoRequest.paymentToken = paymentToken;
    demoRequest.paymentLinkExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    await demoRequest.save();

    // Generate payment URL
    const paymentUrl = `${process.env.FRONTEND_URL}/pay/${paymentToken}`;

    // Send emails
    try {
      await sendCustomerEmail(demoRequest, paymentUrl);
      await sendAdminNotification(demoRequest, paymentUrl);
      console.log('✅ Emails sent successfully');
    } catch (emailError) {
      console.error('⚠️ Email sending failed, but demo was saved:', emailError.message);
      // Don't fail the request if email fails
    }
    
    res.status(201).json({
      message: 'Demo request submitted successfully',
      id: demoRequest._id,
      leadScore: demoRequest.leadScore
    });
  } catch (error) {
    console.error('❌ Error creating demo request:', error);
    res.status(500).json({ 
      message: 'Failed to submit demo request',
      error: error.message 
    });
  }
});




// Customer email function
const sendCustomerEmail = async (demo, paymentUrl) => {
  const customerEmailTemplate = `
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
        .features { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌿 Thank you for requesting a demo, ${demo.firstName}!</h1>
        </div>
        
        <div class="content">
            <p>Hi ${demo.firstName},</p>
            
            <p>Thank you for your interest in our cannabis ERP platform for <strong>${demo.companyName}</strong>! We're excited to help you streamline your operations and ensure compliance.</p>
            
            <div class="features">
                <h3>🚀 Ready to get started right away?</h3>
                <p>You can skip the wait and create your account today. Your subscription includes:</p>
                <ul>
                    <li>✅ Complete cannabis ERP system</li>
                    <li>✅ Inventory & compliance management</li>
                    <li>✅ Point-of-sale integration</li>
                    <li>✅ Real-time reporting & analytics</li>
                    <li>✅ 24/7 support & onboarding</li>
                </ul>
            </div>
            
            <div style="text-align: center;">
                <a href="${paymentUrl}" class="cta-button">
                    🔐 Create Your Account - $299/month
                </a>
            </div>
            
            <p><strong>What happens next:</strong></p>
            <p>🔸 Click the link above to create your account and start your subscription<br>
               🔸 Your account will be set up automatically after payment<br>
               🔸 You'll receive login credentials via email<br>
               🔸 Our team will contact you within 24 hours for onboarding</p>
            
            <p><strong>Prefer a demo call first?</strong> No problem! Our team will reach out within 24 hours to schedule your personalized demonstration.</p>
            
            <p>Questions? Just reply to this email.</p>
            
            <p>Best regards,<br>
            Austin Duong<br>
            Cannabis ERP Solutions</p>
        </div>
        
        <div class="footer">
            <p>This secure link is personalized for ${demo.companyName} and expires in 30 days.</p>
            <p>If you no longer wish to receive emails, please reply with "unsubscribe".</p>
        </div>
    </div>
</body>
</html>`;

  const mailOptions = {
    from: `"Cannabis ERP Solutions" <${process.env.SMTP_USER}>`,
    to: demo.email,
    subject: `🌿 ${demo.firstName}, your cannabis ERP demo & account setup`,
    html: customerEmailTemplate
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Customer email sent to:', demo.email);
  } catch (error) {
    console.error('❌ Failed to send customer email:', error);
    throw error;
  }
};

// Admin notification function  
const sendAdminNotification = async (demo, paymentUrl) => {
  const adminEmailTemplate = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif;">
    <h2>🚨 NEW DEMO REQUEST</h2>
    
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
        <h3>${demo.companyName}</h3>
        <p><strong>Contact:</strong> ${demo.firstName} ${demo.lastName}</p>
        <p><strong>Email:</strong> ${demo.email}</p>
        <p><strong>Phone:</strong> ${demo.phone}</p>
        <p><strong>Industry:</strong> ${demo.industry}</p>
        <p><strong>Locations:</strong> ${demo.numberOfLocations}</p>
        <p><strong>States:</strong> ${demo.states}</p>
        <p><strong>Budget:</strong> ${demo.budget}</p>
        <p><strong>Timeline:</strong> ${demo.timeline}</p>
        <p><strong>License Types:</strong> ${demo.licenseTypes ? demo.licenseTypes.join(', ') : 'N/A'}</p>
        <p><strong>Lead Score:</strong> ${demo.leadScore}/100</p>
    </div>
    
    <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h4>💬 Primary Pain Points:</h4>
        <p>${demo.primaryPainPoints}</p>
    </div>
    
    <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
        <h4>🔗 Customer's Payment Link:</h4>
        <p><a href="${paymentUrl}" target="_blank">${paymentUrl}</a></p>
        <p><small>Customer received automated email with this link</small></p>
    </div>
    
    <div style="background: #f8f9fa; padding: 15px; border: 1px dashed #ccc; margin-top: 20px;">
        <h4>📧 Follow-up Email Template (Copy & Paste):</h4>
        <p>Hi ${demo.firstName},</p>
        <p>Following up on your demo request for ${demo.companyName}. I'd love to show you how our platform can help with ${demo.primaryPainPoints}.</p>
        <p>Your secure signup link: <a href="${paymentUrl}">${paymentUrl}</a></p>
        <p>Available for a quick call? Just reply with your preferred time.</p>
        <p>Best, Austin</p>
    </div>
</body>
</html>`;

  const adminMailOptions = {
    from: `"Demo Alerts" <${process.env.SMTP_USER}>`,
    to: process.env.ADMIN_EMAIL, // Your email
    subject: `🚨 NEW DEMO: ${demo.companyName} (${demo.firstName} ${demo.lastName}) - Score: ${demo.leadScore}`,
    html: adminEmailTemplate
  };

  try {
    await transporter.sendMail(adminMailOptions);
    console.log('✅ Admin notification sent');
  } catch (error) {
    console.error('❌ Failed to send admin email:', error);
    throw error;
  }
};



router.get('/test-email', async (req, res) => {
  try {
    const testEmail = {
      from: `"Cannabis ERP Test" <${process.env.SMTP_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: '🧪 Email Test from Cannabis ERP',
      html: '<h2>✅ Email configuration is working!</h2><p>Your demo notification emails will work properly.</p>'
    };
    
    await transporter.sendMail(testEmail);
    res.json({ message: '✅ Test email sent successfully!' });
  } catch (error) {
    console.error('❌ Email test failed:', error);
    res.status(500).json({ error: 'Email test failed', details: error.message });
  }
});




// Get all demo requests (ADMIN/SALES ONLY)
router.get('/demo-requests', protect, requireSalesAccess, async (req, res) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 25, 
      sort = 'createdAt',
      sortOrder = 'desc',
      search 
    } = req.query;
    
    const filter = {};
    
    // Status filter
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    // Search filter (company name, email, or name)
    if (search) {
      filter.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    
    const requests = await DemoRequest.find(filter)
      .populate('assignedSalesRep', 'name email')
      .populate('userAccountCreated', 'email name businessName')
      .sort({ [sort]: sortDirection })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
      
    const total = await DemoRequest.countDocuments(filter);
    
    // Get status counts for dashboard
    const statusCounts = await DemoRequest.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const statusSummary = {};
    statusCounts.forEach(item => {
      statusSummary[item._id] = item.count;
    });
    
    res.json({
      requests,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      },
      statusSummary
    });
  } catch (error) {
    console.error('❌ Error fetching demo requests:', error);
    res.status(500).json({ message: 'Failed to fetch demo requests' });
  }
});

// Get single demo request (ADMIN/SALES ONLY)
router.get('/demo-requests/:id', protect, requireSalesAccess, async (req, res) => {
  try {
    const request = await DemoRequest.findById(req.params.id)
      .populate('assignedSalesRep', 'name email phone')
      .populate('userAccountCreated', 'email name businessName accessLevel subscriptionStatus');
      
    if (!request) {
      return res.status(404).json({ message: 'Demo request not found' });
    }
    
    res.json(request);
  } catch (error) {
    console.error('❌ Error fetching demo request:', error);
    res.status(500).json({ message: 'Failed to fetch demo request' });
  }
});

// Update demo request status (ADMIN/SALES ONLY)
router.patch('/demo-requests/:id', protect, requireSalesAccess, async (req, res) => {
  try {
    const { 
      status, 
      qualificationNotes, 
      demoScheduledAt, 
      assignedSalesRep,
      demoNotes,
      nextFollowUp
    } = req.body;
    
    const updateData = {
      updatedAt: new Date()
    };
    
    if (status) updateData.status = status;
    if (qualificationNotes) updateData.qualificationNotes = qualificationNotes;
    if (demoScheduledAt) updateData.demoScheduledAt = demoScheduledAt;
    if (assignedSalesRep) updateData.assignedSalesRep = assignedSalesRep;
    if (demoNotes) updateData.demoNotes = demoNotes;
    if (nextFollowUp) updateData.nextFollowUp = nextFollowUp;
    
    // Handle status-specific updates
    if (status === 'demo_completed') {
      updateData.demoCompletedAt = new Date();
    }
    if (status === 'closed_won' || status === 'closed_lost') {
      updateData.closedAt = new Date();
    }
    
    const request = await DemoRequest.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('assignedSalesRep', 'name email');
    
    if (!request) {
      return res.status(404).json({ message: 'Demo request not found' });
    }
    
    console.log(`✅ Demo request ${req.params.id} updated by ${req.user.name}`);
    
    res.json(request);
  } catch (error) {
    console.error('❌ Error updating demo request:', error);
    res.status(500).json({ message: 'Failed to update demo request' });
  }
});

// Approve user access - create user account (ADMIN/SALES ONLY)
router.post('/demo-requests/:id/approve', protect, requireSalesAccess, async (req, res) => {
  try {
    const { 
      accessLevel = 'trial', 
      trialDays = 30,
      subscriptionStatus = 'trialing',
      welcomeEmail = true 
    } = req.body;
    
    const demoRequest = await DemoRequest.findById(req.params.id);
    if (!demoRequest) {
      return res.status(404).json({ message: 'Demo request not found' });
    }
    
    // Check if user already exists
    let user = await User.findOne({ email: demoRequest.email });
    
    if (!user) {
      // Create new user account
      const trialEndsAt = accessLevel === 'trial' 
        ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
        : null;
        
      // Generate temporary password - user will reset on first login
      const tempPassword = Math.random().toString(36).substring(2, 15) + 
                          Math.random().toString(36).substring(2, 15);
        
      user = new User({
        email: demoRequest.email,
        name: `${demoRequest.firstName} ${demoRequest.lastName}`,
        businessName: demoRequest.companyName,
        phone: demoRequest.phone || '',
        address: '', // Default empty, they can fill later
        
        // New access control fields
        accessLevel,
        subscriptionStatus,
        trialEndsAt,
        demoRequestId: demoRequest._id,
        approvedBy: req.user._id,
        approvedAt: new Date(),
        companyName: demoRequest.companyName,
        licenseTypes: demoRequest.licenseTypes || [],
        loginCount: 0,
        
        // Temporary password - user will be prompted to change
        password: tempPassword
      });
      
      await user.save();
      
      // Update demo request
      demoRequest.userAccountCreated = user._id;
      demoRequest.status = 'demo_completed';
      await demoRequest.save();
      
      console.log(`✅ Created user account for ${user.email} - Access Level: ${accessLevel}`);
      
      // TODO: Send welcome email with login instructions and temporary password
      // TODO: Add to onboarding sequence
      
      res.json({
        message: 'User account created successfully',
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          accessLevel: user.accessLevel,
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt,
          tempPassword // Return temp password for manual sharing (remove in production)
        },
        demo: {
          id: demoRequest._id,
          companyName: demoRequest.companyName,
          leadScore: demoRequest.leadScore
        }
      });
    } else {
      // Update existing user's access
      const oldAccessLevel = user.accessLevel;
      
      user.accessLevel = accessLevel;
      user.subscriptionStatus = subscriptionStatus;
      
      if (accessLevel === 'trial' && trialDays) {
        user.trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      }
      
      user.demoRequestId = demoRequest._id;
      user.approvedBy = req.user._id;
      user.approvedAt = new Date();
      user.companyName = user.companyName || demoRequest.companyName;
      user.licenseTypes = user.licenseTypes.length ? user.licenseTypes : demoRequest.licenseTypes;
      
      await user.save();
      
      // Update demo request
      demoRequest.userAccountCreated = user._id;
      demoRequest.status = 'demo_completed';
      await demoRequest.save();
      
      console.log(`✅ Updated access for existing user ${user.email}: ${oldAccessLevel} → ${accessLevel}`);
      
      res.json({
        message: 'User access updated successfully',
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          accessLevel: user.accessLevel,
          subscriptionStatus: user.subscriptionStatus,
          trialEndsAt: user.trialEndsAt
        },
        changes: {
          previousAccessLevel: oldAccessLevel,
          newAccessLevel: accessLevel
        }
      });
    }
  } catch (error) {
    console.error('❌ Error approving user access:', error);
    res.status(500).json({ 
      message: 'Failed to approve user access',
      error: error.message 
    });
  }
});

// Get demo request statistics (ADMIN ONLY)
router.get('/analytics/demo-stats', protect, requireAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query; // days
    const startDate = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    
    const stats = await DemoRequest.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          avgLeadScore: { $avg: '$leadScore' },
          highValueLeads: { 
            $sum: { $cond: [{ $gte: ['$leadScore', 70] }, 1, 0] } 
          }
        }
      }
    ]);
    
    const conversionStats = await DemoRequest.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const industryBreakdown = await DemoRequest.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: '$industry',
          count: { $sum: 1 },
          avgLeadScore: { $avg: '$leadScore' }
        }
      }
    ]);
    
    res.json({
      period: `${period} days`,
      overview: stats[0] || { totalRequests: 0, avgLeadScore: 0, highValueLeads: 0 },
      conversionFunnel: conversionStats,
      industryBreakdown
    });
  } catch (error) {
    console.error('❌ Error fetching demo analytics:', error);
    res.status(500).json({ message: 'Failed to fetch analytics' });
  }
});

// Get sales dashboard data (ADMIN/SALES ONLY)
router.get('/sales-dashboard', protect, requireSalesAccess, async (req, res) => {
  try {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    
    // This month's metrics
    const thisMonthRequests = await DemoRequest.countDocuments({
      createdAt: { $gte: thisMonth }
    });
    
    // Pending demo requests (need attention)
    const pendingRequests = await DemoRequest.find({
      status: { $in: ['pending', 'qualified', 'demo_scheduled'] }
    })
    .populate('assignedSalesRep', 'name email')
    .sort({ leadScore: -1, createdAt: -1 })
    .limit(10);
    
    // High-value leads (score > 70)
    const highValueLeads = await DemoRequest.find({
      leadScore: { $gte: 70 },
      status: { $nin: ['closed_won', 'closed_lost'] }
    })
    .sort({ leadScore: -1 })
    .limit(5);
    
    // Recent conversions
    const recentConversions = await DemoRequest.find({
      status: 'closed_won',
      closedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    })
    .populate('userAccountCreated', 'email companyName subscriptionStatus')
    .sort({ closedAt: -1 })
    .limit(5);
    
    res.json({
      metrics: {
        thisMonthRequests,
        pendingCount: pendingRequests.length,
        highValueCount: highValueLeads.length
      },
      pendingRequests,
      highValueLeads,
      recentConversions
    });
  } catch (error) {
    console.error('❌ Error fetching sales dashboard:', error);
    res.status(500).json({ message: 'Failed to fetch sales dashboard' });
  }
})

module.exports = router;