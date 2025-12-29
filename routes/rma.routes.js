// backend/routes/rma.routes.js
const express = require('express');
const router = express.Router();
const RMA = require('../models/RMA');
const { requireAuth, requirePermission } = require('../middlewares/auth.middleware');

/**
 * @route   GET /api/rma
 * @desc    Get all RMAs for organization
 * @access  Private
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, startDate, endDate, customerId, type } = req.query;
    
    const filter = { organizationId: req.organizationId };
    
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (type) filter.type = type;
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const rmas = await RMA.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('inspectedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      rmas: rmas,
      count: rmas.length
    });
    
  } catch (error) {
    console.error('Get RMAs error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch RMAs' 
    });
  }
});

/**
 * @route   GET /api/rma/stats
 * @desc    Get RMA statistics
 * @access  Private
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const statusCounts = await RMA.getStatusCounts(req.organizationId);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // ✅ FIX: Only count RESOLVED RMAs in last 30 days
    const recentResolvedRMAs = await RMA.find({
      organizationId: req.organizationId,
      status: { $in: ['resolved', 'closed'] },  // Only resolved/closed
      resolutionDate: { $gte: thirtyDaysAgo }    // Use resolutionDate, not createdAt
    });
    
    const totalValue = recentResolvedRMAs.reduce((sum, rma) => sum + rma.totalValue, 0);
    
    res.json({
      success: true,
      stats: {
        statusCounts,
        last30Days: {
          count: recentResolvedRMAs.length,  // ✅ Only resolved count
          totalValue: totalValue
        }
      }
    });
    
  } catch (error) {
    console.error('Get RMA stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch statistics' 
    });
  }
});

/**
 * @route   GET /api/rma/:id
 * @desc    Get single RMA by ID
 * @access  Private
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    })
      .populate('createdBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('inspectedBy', 'firstName lastName email')
      .populate('receivedBy', 'firstName lastName email')
      .populate('closedBy', 'firstName lastName email');
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    res.json({
      success: true,
      rma: rma
    });
    
  } catch (error) {
    console.error('Get RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch RMA' 
    });
  }
});

/**
 * @route   POST /api/rma
 * @desc    Create new RMA
 * @access  Private
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      type,
      relatedInvoiceId,
      invoiceNumber,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      items,
      returnReason,
      detailedReason,
      customerComplaint,
      regulatoryNotificationRequired
    } = req.body;
    
    // Validation
    if (!customerName) {
      return res.status(400).json({ 
        success: false,
        error: 'Customer name is required' 
      });
    }
    
    if (!items || items.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'At least one item is required' 
      });
    }
    
    if (!returnReason || !detailedReason) {
      return res.status(400).json({ 
        success: false,
        error: 'Return reason is required' 
      });
    }
    
    // Create RMA
    const rma = new RMA({
      organizationId: req.organizationId,
      type: type || 'customer_return',
      relatedInvoiceId,
      invoiceNumber,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      items,
      returnReason,
      detailedReason,
      customerComplaint,
      regulatoryNotificationRequired: regulatoryNotificationRequired || false,
      createdBy: req.userId,
      status: 'pending_approval'
    });
    
    await rma.save();
    
    console.log('✅ RMA created:', rma.rmaNumber);
    
    res.status(201).json({
      success: true,
      message: 'RMA created successfully',
      rma: rma
    });
    
  } catch (error) {
    console.error('Create RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create RMA' 
    });
  }
});

/**
 * @route   PUT /api/rma/:id/approve
 * @desc    Approve RMA
 * @access  Private (requires canManageInvoices or higher)
 */
router.put('/:id/approve', requireAuth, requirePermission('canManageInvoices'), async (req, res) => {
  try {
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    if (rma.status !== 'pending_approval') {
      return res.status(400).json({ 
        success: false,
        error: 'RMA cannot be approved in current status' 
      });
    }
    
    await rma.approve(req.userId);
    
    console.log('✅ RMA approved:', rma.rmaNumber, 'by', req.user.email);
    
    res.json({
      success: true,
      message: 'RMA approved successfully',
      rma: rma
    });
    
  } catch (error) {
    console.error('Approve RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to approve RMA' 
    });
  }
});

/**
 * @route   PUT /api/rma/:id/reject
 * @desc    Reject RMA
 * @access  Private (requires canManageInvoices or higher)
 */
router.put('/:id/reject', requireAuth, requirePermission('canManageInvoices'), async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    
    if (!rejectionReason) {
      return res.status(400).json({ 
        success: false,
        error: 'Rejection reason is required' 
      });
    }
    
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    await rma.reject(req.userId, rejectionReason);
    
    console.log('❌ RMA rejected:', rma.rmaNumber, 'by', req.user.email);
    
    res.json({
      success: true,
      message: 'RMA rejected',
      rma: rma
    });
    
  } catch (error) {
    console.error('Reject RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reject RMA' 
    });
  }
});

/**
 * @route   PUT /api/rma/:id/receive
 * @desc    Mark RMA as received
 * @access  Private
 */
router.put('/:id/receive', requireAuth, async (req, res) => {
  try {
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    if (rma.status !== 'approved') {
      return res.status(400).json({ 
        success: false,
        error: 'RMA must be approved before receiving' 
      });
    }
    
    await rma.markReceived(req.userId);
    
    console.log('📦 RMA received:', rma.rmaNumber);
    
    res.json({
      success: true,
      message: 'RMA marked as received',
      rma: rma
    });
    
  } catch (error) {
    console.error('Receive RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to mark RMA as received' 
    });
  }
});

/**
 * @route   PUT /api/rma/:id/inspect
 * @desc    Complete RMA inspection
 * @access  Private (requires canManageProducts)
 */
router.put('/:id/inspect', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
  try {
    const { inspectionResult, inspectionNotes, inspectionPhotos } = req.body;
    
    if (!inspectionResult) {
      return res.status(400).json({ 
        success: false,
        error: 'Inspection result is required' 
      });
    }
    
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    if (rma.status !== 'received' && rma.status !== 'inspecting') {
      return res.status(400).json({ 
        success: false,
        error: 'RMA must be received before inspection' 
      });
    }
    
    if (inspectionPhotos) {
      rma.inspectionPhotos = inspectionPhotos;
    }
    
    await rma.completeInspection(req.userId, inspectionResult, inspectionNotes);
    
    console.log('🔍 RMA inspected:', rma.rmaNumber, 'Result:', inspectionResult);
    
    res.json({
      success: true,
      message: 'Inspection completed',
      rma: rma
    });
    
  } catch (error) {
    console.error('Inspect RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to complete inspection' 
    });
  }
});

/**
 * @route   PUT /api/rma/:id/resolve
 * @desc    Resolve RMA (refund/replacement/credit)
 * @access  Private (requires canManageInvoices)
 */
router.put('/:id/resolve', requireAuth, requirePermission('canManageInvoices'), async (req, res) => {
  try {
    const { resolutionType, refundAmount, replacementOrderId, creditAmount, creditMemoNumber } = req.body;
    
    if (!resolutionType) {
      return res.status(400).json({ 
        success: false,
        error: 'Resolution type is required' 
      });
    }
    
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    if (rma.status !== 'inspected') {
      return res.status(400).json({ 
        success: false,
        error: 'RMA must be inspected before resolution' 
      });
    }
    
    switch (resolutionType) {
      case 'refund':
        await rma.processRefund(refundAmount || rma.totalValue);
        break;
      case 'replacement':
        await rma.processReplacement(replacementOrderId);
        break;
      case 'store_credit':
        await rma.issueCredit(creditAmount || rma.totalValue, creditMemoNumber);
        break;
      default:
        return res.status(400).json({ 
          success: false,
          error: 'Invalid resolution type' 
        });
    }
    
    console.log('✅ RMA resolved:', rma.rmaNumber, 'Type:', resolutionType);
    
    res.json({
      success: true,
      message: 'RMA resolved successfully',
      rma: rma
    });
    
  } catch (error) {
    console.error('Resolve RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to resolve RMA' 
    });
  }
});

/**
 * @route   PUT /api/rma/:id/close
 * @desc    Close RMA
 * @access  Private (requires canManageInvoices)
 */
router.put('/:id/close', requireAuth, requirePermission('canManageInvoices'), async (req, res) => {
  try {
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    if (rma.status !== 'resolved') {
      return res.status(400).json({ 
        success: false,
        error: 'RMA must be resolved before closing' 
      });
    }
    
    await rma.close(req.userId);
    
    console.log('🔒 RMA closed:', rma.rmaNumber);
    
    res.json({
      success: true,
      message: 'RMA closed successfully',
      rma: rma
    });
    
  } catch (error) {
    console.error('Close RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to close RMA' 
    });
  }
});

/**
 * @route   DELETE /api/rma/:id
 * @desc    Delete/Cancel RMA
 * @access  Private (owner only or creator if pending)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    // Only allow deletion if pending or if user is owner
    const canDelete = rma.status === 'pending_approval' || req.user.isOwner;
    
    if (!canDelete) {
      return res.status(403).json({ 
        success: false,
        error: 'Cannot delete RMA in current status' 
      });
    }
    
    await RMA.findByIdAndDelete(req.params.id);
    
    console.log('🗑️ RMA deleted:', rma.rmaNumber);
    
    res.json({
      success: true,
      message: 'RMA deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete RMA' 
    });
  }
});

/**
 * @route   PUT /api/rma/:id
 * @desc    Update RMA
 * @access  Private
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });
    
    if (!rma) {
      return res.status(404).json({ 
        success: false,
        error: 'RMA not found' 
      });
    }
    
    // ✅ UPDATED: Allow updates until resolved
    const canEdit = !['resolved', 'closed', 'rejected'].includes(rma.status);
    
    if (!canEdit) {
      return res.status(400).json({ 
        success: false,
        error: 'Cannot update RMA after it has been resolved, closed, or rejected' 
      });
    }
    
    const allowedFields = [
      'customerName', 'customerEmail', 'customerPhone',
      'items', 'returnReason', 'detailedReason', 'customerComplaint',
      'internalNotes'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        rma[field] = req.body[field];
      }
    });
    
    rma.lastModifiedBy = req.userId;
    await rma.save();
    
    console.log('📝 RMA updated:', rma.rmaNumber);
    
    res.json({
      success: true,
      message: 'RMA updated successfully',
      rma: rma
    });
    
  } catch (error) {
    console.error('Update RMA error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update RMA' 
    });
  }
});

module.exports = router;