const express = require('express');
const router = express.Router();
const DemoRequest = require('../models/DemoRequest');
const User = require('../models/User');
const { protect, requireAdmin, requireSalesAccess } = require('../middlewares/authMiddleware');

// Submit demo request (PUBLIC ROUTE - no authentication required)
router.post('/demo-requests', async (req, res) => {
  try {
    console.log('📝 Demo request received:', req.body);
    
    const demoRequest = new DemoRequest(req.body);
    await demoRequest.save();
    
    console.log('✅ Demo request saved:', demoRequest._id);
    
    // TODO: Send notification email to sales team
    // TODO: Add to CRM/Calendar system
    // TODO: Send confirmation email to requester
    
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