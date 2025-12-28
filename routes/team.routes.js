// backend/routes/team.routes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Organization = require('../models/Organization');
const { requireAuth, requirePermission, requireOwner } = require('../middlewares/auth.middleware');
const crypto = require('crypto');
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

// Send invitation email
const sendInvitationEmail = async (email, inviterName, companyName, inviteToken, role) => {
  const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite/${inviteToken}`;
  
  const inviteEmailTemplate = `
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
            <h1>👋 You've Been Invited!</h1>
        </div>
        
        <div class="content">
            <p>Hi there,</p>
            
            <p><strong>${inviterName}</strong> has invited you to join <strong>${companyName}</strong> on Cannabis ERP Platform.</p>
            
            <p><strong>Your Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" class="cta-button">
                    ✅ Accept Invitation
                </a>
            </div>
            
            <p>This invitation will expire in 7 days.</p>
            
            <p><strong>What happens next?</strong></p>
            <ol>
                <li>Click the button above to accept the invitation</li>
                <li>Create your password</li>
                <li>Start collaborating with your team!</li>
            </ol>
            
            <p>If you have any questions, please contact your team administrator or reply to this email.</p>
            
            <p>Best regards,<br>
            Cannabis ERP Team</p>
        </div>
        
        <div class="footer">
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
    </div>
</body>
</html>`;

  const mailOptions = {
    from: `"Cannabis ERP" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `You've been invited to join ${companyName} on Cannabis ERP`,
    html: inviteEmailTemplate
  };

  await transporter.sendMail(mailOptions);
};

/**
 * @route   GET /api/team/members
 * @desc    Get all team members in the organization
 * @access  Private
 */
router.get('/members', requireAuth, async (req, res) => {
  try {
    const users = await User.find({
      organizationId: req.organizationId
    }).select('-password').sort({ createdAt: -1 });
    
    res.json({
      success: true,
      users: users,
      totalUsers: users.length,
      maxUsers: req.organization.maxUsers
    });
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch team members' 
    });
  }
});

/**
 * @route   POST /api/team/invite
 * @desc    Invite a new team member
 * @access  Private (requires canManageUsers permission)
 */
router.post('/invite', requireAuth, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { email, firstName, lastName, role } = req.body;
    
    // Validation
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({ 
        success: false,
        error: 'Please provide all required fields' 
      });
    }
    
    // Validate role
    const validRoles = ['admin', 'manager', 'user', 'accountant'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid role. Must be admin, manager, user, or accountant' 
      });
    }
    
    // Check if organization can add more users
    if (!req.organization.canAddUser()) {
      return res.status(400).json({ 
        success: false,
        error: `You've reached your limit of ${req.organization.maxUsers} users. Upgrade your plan to add more.`,
        maxUsers: req.organization.maxUsers,
        currentUsers: req.organization.currentUsers
      });
    }
    
// ✅ IMPROVED: Check if user exists in ANY organization
const existingUser = await User.findOne({
  email: email.toLowerCase()
});

if (existingUser) {
  // Check if they're already in THIS organization
  if (existingUser.organizationId === req.organizationId) {
    return res.status(400).json({ 
      success: false,
      error: 'This user is already a member of your organization' 
    });
  } else {
    // User exists but in a different organization
    return res.status(400).json({ 
      success: false,
      error: `This email is already registered with another organization. Please use a different email address.` 
    });
  }
}
    
    // Generate invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    // Create user (not active until they accept)
    const newUser = new User({
      email: email.toLowerCase(),
      firstName,
      lastName,
      organizationId: req.organizationId,
      role: role,
      isOwner: false,
      isActive: false, // Not active until they set password
      permissions: User.getDefaultPermissions(role),
      invitedBy: req.userId,
      inviteToken: inviteToken,
      inviteTokenExpiry: inviteTokenExpiry,
      password: crypto.randomBytes(32).toString('hex') // Temporary random password
    });
    
    await newUser.save();
    
    // Increment organization user count
    await req.organization.incrementUserCount();
    
    // Send invitation email
    try {
      await sendInvitationEmail(
        email,
        req.user.fullName,
        req.organization.companyName,
        inviteToken,
        role
      );
      console.log('✅ Invitation email sent to:', email);
    } catch (emailError) {
      console.error('⚠️ Failed to send invitation email:', emailError);
      // Continue anyway - user can still be activated manually
    }
    
    // Calculate new monthly price
    const newMonthlyPrice = req.organization.calculateMonthlyPrice();
    
    console.log('✅ User invited:', email, 'to', req.organization.companyName);
    
    res.json({
      success: true,
      message: 'User invited successfully',
      user: {
        id: newUser._id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        isActive: newUser.isActive
      },
      currentUsers: req.organization.currentUsers,
      maxUsers: req.organization.maxUsers,
      newMonthlyPrice: newMonthlyPrice
    });
    
  } catch (error) {
    console.error('Invite user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to invite user' 
    });
  }
});

/**
 * @route   GET /api/team/validate-invite/:token
 * @desc    Validate invitation token and get invite details
 * @access  Public
 */
router.get('/validate-invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    console.log('🔍 Validating invitation token:', token);
    
    // Find user by invite token
    const user = await User.findOne({
      inviteToken: token,
      inviteTokenExpiry: { $gt: new Date() }
    });
    
    if (!user) {
      console.log('❌ Invalid or expired token:', token);
      return res.status(404).json({ 
        success: false,
        error: 'Invalid or expired invitation link' 
      });
    }
    
    // Get organization
    const organization = await Organization.findOne({ 
      organizationId: user.organizationId 
    });
    
    if (!organization) {
      return res.status(404).json({ 
        success: false,
        error: 'Organization not found' 
      });
    }
    
    console.log('✅ Invitation validated for:', user.email);
    
    res.json({
      success: true,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationName: organization.companyName
    });
    
  } catch (error) {
    console.error('❌ Validate invitation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to validate invitation' 
    });
  }
});

/**
 * @route   POST /api/team/accept-invite/:token
 * @desc    Accept invitation and set password
 * @access  Public
 */
router.post('/accept-invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        success: false,
        error: 'Password is required' 
      });
    }
    
    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false,
        error: 'Password must be at least 8 characters long' 
      });
    }
    
    // Find user by invite token
    const user = await User.findOne({
      inviteToken: token,
      inviteTokenExpiry: { $gt: new Date() }
    });
    
    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or expired invitation link' 
      });
    }
    
    // Activate user and set password
    user.password = password; // Will be hashed by pre-save hook
    user.isActive = true;
    user.inviteToken = null;
    user.inviteTokenExpiry = null;
    user.emailVerified = true;
    
    await user.save();
    
    // Get organization
    const organization = await Organization.findOne({ 
      organizationId: user.organizationId 
    });
    
    console.log('✅ User accepted invitation:', user.email);
    
    res.json({
      success: true,
      message: 'Invitation accepted successfully. You can now login.',
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        organizationName: organization.companyName
      }
    });
    
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to accept invitation' 
    });
  }
});

/**
 * @route   DELETE /api/team/members/:userId
 * @desc    Remove a team member
 * @access  Private (requires canManageUsers permission)
 */
router.delete('/members/:userId', requireAuth, requirePermission('canManageUsers'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find user
    const userToRemove = await User.findById(userId);
    
    if (!userToRemove) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Check if user belongs to same organization
    if (userToRemove.organizationId !== req.organizationId) {
      return res.status(403).json({ 
        success: false,
        error: 'You cannot remove users from other organizations' 
      });
    }
    
    // Cannot remove the owner
    if (userToRemove.isOwner) {
      return res.status(403).json({ 
        success: false,
        error: 'Cannot remove the account owner' 
      });
    }
    
    // Cannot remove yourself
    if (userToRemove._id.toString() === req.userId.toString()) {
      return res.status(403).json({ 
        success: false,
        error: 'Cannot remove yourself. Please have another admin remove you.' 
      });
    }
    
    // Remove user
    await User.findByIdAndDelete(userId);
    
    // Decrement organization user count
    await req.organization.decrementUserCount();
    
    // Calculate new monthly price
    const newMonthlyPrice = req.organization.calculateMonthlyPrice();
    
    console.log('✅ User removed:', userToRemove.email, 'from', req.organization.companyName);
    
    res.json({
      success: true,
      message: 'User removed successfully',
      currentUsers: req.organization.currentUsers,
      maxUsers: req.organization.maxUsers,
      newMonthlyPrice: newMonthlyPrice
    });
    
  } catch (error) {
    console.error('Remove user error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to remove user' 
    });
  }
});

/**
 * @route   PUT /api/team/members/:userId/role
 * @desc    Update a team member's role
 * @access  Private (owner only)
 */
router.put('/members/:userId/role', requireAuth, requireOwner, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    // Validate role
    const validRoles = ['admin', 'manager', 'user', 'accountant'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid role' 
      });
    }
    
    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // Check if user belongs to same organization
    if (user.organizationId !== req.organizationId) {
      return res.status(403).json({ 
        success: false,
        error: 'You cannot update users from other organizations' 
      });
    }
    
    // Cannot change owner's role
    if (user.isOwner) {
      return res.status(403).json({ 
        success: false,
        error: 'Cannot change the owner\'s role' 
      });
    }
    
    // Update role and permissions
    user.role = role;
    user.permissions = User.getDefaultPermissions(role);
    await user.save();
    
    console.log('✅ User role updated:', user.email, 'to', role);
    
    res.json({
      success: true,
      message: 'User role updated successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        permissions: user.permissions
      }
    });
    
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update user role' 
    });
  }
});

/**
 * @route   GET /api/team/pricing-preview
 * @desc    Get pricing preview for adding/removing users
 * @access  Private
 */
router.get('/pricing-preview', requireAuth, async (req, res) => {
  try {
    const { userCount } = req.query;
    
    const currentPrice = req.organization.calculateMonthlyPrice();
    
    let newPrice = currentPrice;
    if (userCount) {
      const count = parseInt(userCount);
      if (count > 0 && count <= req.organization.maxUsers) {
        const tempOrg = { ...req.organization.toObject(), currentUsers: count };
        newPrice = tempOrg.basePlan + ((count - 1) * tempOrg.pricePerUser);
      }
    }
    
    res.json({
      success: true,
      currentUsers: req.organization.currentUsers,
      maxUsers: req.organization.maxUsers,
      currentMonthlyPrice: currentPrice,
      newMonthlyPrice: newPrice,
      pricePerUser: req.organization.pricePerUser,
      basePlan: req.organization.basePlan,
      subscriptionPlan: req.organization.subscriptionPlan
    });
    
  } catch (error) {
    console.error('Pricing preview error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to calculate pricing' 
    });
  }
});

module.exports = router;