// backend/routes/rma.routes.js
const express = require('express');
const router = express.Router();
const RMA = require('../models/RMA');
const Transaction = require('../models/Transaction');
const StoreCredit = require('../models/StoreCredit');
const metrcService = require('../services/metrcService.mock');

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
 * @route   GET /api/credits/search
 * @desc    Search for store credit by customer phone/email
 * @access  Private (for POS lookup)
 */
router.get('/credits/search', requireAuth, async (req, res) => {
  try {
    const { phone, email } = req.query;

    if (!phone && !email) {
      return res.status(400).json({
        success: false,
        error: 'Phone or email required for search'
      });
    }

    const query = {
      organizationId: req.organizationId,
      status: { $in: ['active', 'partially_used'] },
      $or: [
        { expirationDate: null },
        { expirationDate: { $gt: new Date() } }
      ]
    };

    if (phone) {
      query.customerPhone = phone;
    } else if (email) {
      query.customerEmail = email;
    }

    const credits = await StoreCredit.find(query)
      .sort({ createdAt: -1 });

    const totalBalance = credits.reduce((sum, credit) => 
      sum + credit.remainingBalance, 0
    );

    res.json({
      success: true,
      customer: credits.length > 0 ? {
        name: credits[0].customerName,
        phone: credits[0].customerPhone,
        email: credits[0].customerEmail
      } : null,
      balance: totalBalance,
      credits: credits
    });

  } catch (error) {
    console.error('Search credits error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search credits'
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
 * @desc    Create new RMA WITH COMPLIANCE DATA
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

    // ========== ✅ NEW: FETCH INVOICE AND COPY COMPLIANCE DATA ==========
    let enrichedItems = items;
    
    if (relatedInvoiceId) {
      try {
        const Invoice = require('../models/Invoice');
        const invoice = await Invoice.findById(relatedInvoiceId);
        
        if (invoice) {
          console.log('📋 Copying compliance data from invoice:', invoice.invoiceNumber);
          
          // Enrich each RMA item with compliance data from invoice
          enrichedItems = items.map(rmaItem => {
            // Find matching invoice item
            const invoiceItem = invoice.items.find(invItem => 
              invItem._id.toString() === rmaItem.productId ||
              invItem.productId?.toString() === rmaItem.productId
            );

            if (invoiceItem) {
              console.log(`  ✅ Copying compliance data for: ${invoiceItem.name}`);
              
              // Merge RMA item data with invoice compliance data
              return {
                // RMA-specific fields (from user input)
                productId: rmaItem.productId,
                productName: rmaItem.productName || invoiceItem.name,
                quantity: rmaItem.quantity,
                condition: rmaItem.condition || 'unopened',
                reason: rmaItem.reason,
                defectType: rmaItem.defectType,
                unitPrice: invoiceItem.unitPrice,
                totalValue: rmaItem.quantity * invoiceItem.unitPrice,
                
                // ========== COMPLIANCE DATA (from invoice) ==========
                sku: invoiceItem.sku,
                batchNumber: invoiceItem.batchNumber,
                stateTrackingId: invoiceItem.stateTrackingId,
                category: invoiceItem.category,
                strainType: invoiceItem.strainType,
                
                // Cannabinoid profile
                thcContent: invoiceItem.thcContent,
                cbdContent: invoiceItem.cbdContent,
                thcMg: invoiceItem.thcMg,
                cbdMg: invoiceItem.cbdMg,
                
                // Weight & unit
                unit: invoiceItem.unit,
                weight: invoiceItem.weight,
                
                // Dates
                packagedDate: invoiceItem.packagedDate,
                harvestDate: invoiceItem.harvestDate,
                labTestDate: invoiceItem.labTestDate,
                
                // Local dates (timezone-aware)
                localPackagedDate: invoiceItem.localPackagedDate,
                localHarvestDate: invoiceItem.localHarvestDate,
                localExpirationDate: invoiceItem.localExpirationDate,
                
                // Producer info
                licensedProducer: invoiceItem.licensedProducer,
                producerLicense: invoiceItem.producerLicense,
                
                // Lab testing
                labTested: invoiceItem.labTested,
                labTestResult: invoiceItem.labTestResult,
                
                // Strain info
                strainName: invoiceItem.strainName,
                productDescription: invoiceItem.productDescription,
                
                // Default disposition
                dispositionMethod: 'pending'
              };
            }
            
            // If no matching invoice item found, return original
            console.log(`  ⚠️ No matching invoice item for: ${rmaItem.productName}`);
            return rmaItem;
          });
          
          console.log(`✅ Enriched ${enrichedItems.length} items with compliance data`);
        }
      } catch (error) {
        console.error('⚠️ Error fetching invoice for compliance data:', error);
        // Continue with original items if invoice fetch fails
      }
    }
    
    // Create RMA with enriched items
    const rma = new RMA({
      organizationId: req.organizationId,
      type: type || 'customer_return',
      relatedInvoiceId,
      invoiceNumber,
      customerId,
      customerName,
      customerEmail,
      customerPhone,
      items: enrichedItems, // ✅ Items now have compliance data!
      returnReason,
      detailedReason,
      customerComplaint,
      regulatoryNotificationRequired: regulatoryNotificationRequired || false,
      createdBy: req.userId,
      status: 'pending_approval'
    });
    
    await rma.save();
    
    console.log('✅ RMA created:', rma.rmaNumber, 'with compliance tracking');
    
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

// METRC Integration
/**
 * @route   PUT /api/rma/:id/destroy
 * @desc    Mark items as destroyed and report to Metrc
 * @access  Private (requires canManageProducts)
 */
router.put('/:id/destroy', requireAuth, requirePermission('canManageProducts'), async (req, res) => {
  try {
    const { 
      destructionMethod,
      destructionLocation,
      destructionWitnessName,
      destructionWitnessTitle,
      destructionNotes,
      destructionPhotos
    } = req.body;

    // Validation
    if (!destructionMethod) {
      return res.status(400).json({ 
        success: false,
        error: 'Destruction method is required' 
      });
    }

    if (!destructionWitnessName) {
      return res.status(400).json({ 
        success: false,
        error: 'Witness name is required for compliance' 
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

    // RMA must be resolved before destruction
    if (rma.status !== 'resolved') {
      return res.status(400).json({ 
        success: false,
        error: 'RMA must be resolved before destruction' 
      });
    }

    // Calculate totals for waste reporting
    const totalWeightDestroyed = rma.items.reduce((sum, item) => {
      const itemWeight = (item.weight || 0) * (item.quantity || 0);
      return sum + itemWeight;
    }, 0);

    const totalTHCDestroyed = rma.items.reduce((sum, item) => {
      const itemTHC = (item.thcMg || 0) * (item.quantity || 0);
      return sum + itemTHC;
    }, 0);

    const totalCBDDestroyed = rma.items.reduce((sum, item) => {
      const itemCBD = (item.cbdMg || 0) * (item.quantity || 0);
      return sum + itemCBD;
    }, 0);

    // Prepare waste data for Metrc
    const wasteItems = rma.items
      .filter(item => item.stateTrackingId) // Only items with tracking IDs
      .map(item => ({
        packageUid: item.stateTrackingId,
        quantity: item.quantity,
        unit: item.unit || 'Grams',
        weight: (item.weight || 0) * item.quantity,
        destructionDate: new Date().toISOString(),
        wasteReason: `RMA ${rma.rmaNumber}: ${rma.returnReason} - ${rma.detailedReason}`,
        destructionMethod: destructionMethod
      }));

    // Report to Metrc (mock service for now)
    let metrcResult;
    try {
      console.log(`📋 Reporting ${wasteItems.length} items to Metrc...`);
      
      if (wasteItems.length > 0) {
        metrcResult = await metrcService.reportBulkWaste(wasteItems);
      } else {
        // No tracking IDs - still mark as destroyed but don't report
        metrcResult = {
          success: true,
          adjustmentIds: [],
          reportedAt: new Date(),
          message: 'No tracking IDs to report'
        };
      }
      
      console.log('✅ Metrc reporting result:', metrcResult);
    } catch (metrcError) {
      console.error('❌ Metrc reporting failed:', metrcError);
      
      // Option 1: Fail the entire operation
      // return res.status(500).json({
      //   success: false,
      //   error: 'Failed to report to Metrc',
      //   details: metrcError.message
      // });

      // Option 2: Continue but flag for manual reporting
      metrcResult = {
        success: false,
        error: metrcError.message,
        requiresManualReporting: true
      };
    }

    // Generate waste manifest number
    const manifestNumber = `WM-${rma.rmaNumber}-${Date.now()}`;

    // Update RMA with destruction information
    rma.destructionMethod = destructionMethod;
    rma.destructionLocation = destructionLocation || 'Not specified';
    rma.destructionWitnessName = destructionWitnessName;
    rma.destructionWitnessTitle = destructionWitnessTitle || 'Staff';
    rma.destructionCompletedDate = new Date();
    rma.totalWeightDestroyed = totalWeightDestroyed;
    rma.totalTHCDestroyed = totalTHCDestroyed;
    rma.totalCBDDestroyed = totalCBDDestroyed;
    rma.destructionPhotos = destructionPhotos || [];
    rma.wasteManifestNumber = manifestNumber;

    // Metrc reporting info
    rma.metrcReported = metrcResult.success;
    rma.metrcReportDate = metrcResult.reportedAt;
    rma.metrcAdjustmentId = metrcResult.adjustmentIds?.join(',') || metrcResult.adjustmentId || null;

    // Update individual item dispositions
    rma.items.forEach(item => {
      item.dispositionMethod = 'destroy';
      item.dispositionDate = new Date();
      item.dispositionNotes = destructionNotes || 'Item destroyed as part of RMA resolution';
    });

    await rma.save();

    console.log('✅ RMA destruction completed:', {
      rmaNumber: rma.rmaNumber,
      totalWeight: totalWeightDestroyed,
      totalTHC: totalTHCDestroyed,
      totalCBD: totalCBDDestroyed,
      metrcReported: rma.metrcReported,
      manifestNumber: manifestNumber
    });

    res.json({
      success: true,
      message: 'Destruction completed successfully',
      rma: rma,
      metrcAdjustmentId: rma.metrcAdjustmentId,
      wasteManifestNumber: manifestNumber,
      totals: {
        weight: totalWeightDestroyed.toFixed(2),
        thc: totalTHCDestroyed.toFixed(2),
        cbd: totalCBDDestroyed.toFixed(2)
      },
      metrcStatus: metrcResult.success ? 'reported' : 'pending_manual_report'
    });

  } catch (error) {
    console.error('Destruction error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to complete destruction',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/rma/metrc/test
 * @desc    Test Metrc connection
 * @access  Private
 */
router.get('/metrc/test', requireAuth, async (req, res) => {
  try {
    console.log('🧪 Testing Metrc connection...');
    const result = await metrcService.testConnection();
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Metrc test failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * @route   GET /api/rma/:id/manifest
 * @desc    Get destruction manifest for RMA
 * @access  Private
 */
router.get('/:id/manifest', requireAuth, async (req, res) => {
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

    if (!rma.destructionCompletedDate) {
      return res.status(400).json({
        success: false,
        error: 'RMA has not been destroyed yet'
      });
    }

    // Return manifest data
    const manifest = {
      manifestNumber: rma.wasteManifestNumber,
      rmaNumber: rma.rmaNumber,
      destructionDate: rma.destructionCompletedDate,
      destructionMethod: rma.destructionMethod,
      destructionLocation: rma.destructionLocation,
      witness: {
        name: rma.destructionWitnessName,
        title: rma.destructionWitnessTitle
      },
      totals: {
        weight: rma.totalWeightDestroyed,
        thc: rma.totalTHCDestroyed,
        cbd: rma.totalCBDDestroyed
      },
      items: rma.items.map(item => ({
        productName: item.productName,
        batchNumber: item.batchNumber,
        stateTrackingId: item.stateTrackingId,
        quantity: item.quantity,
        weight: item.weight,
        thcMg: item.thcMg,
        cbdMg: item.cbdMg
      })),
      metrcReported: rma.metrcReported,
      metrcReportDate: rma.metrcReportDate,
      metrcAdjustmentId: rma.metrcAdjustmentId
    };

    res.json({
      success: true,
      manifest: manifest
    });

  } catch (error) {
    console.error('Get manifest error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve manifest'
    });
  }
});

/**
 * @route   PUT /api/rma/:id/process-refund
 * @desc    Process cash refund for RMA
 * @access  Private (requires canManageInvoices)
 */
router.put('/:id/process-refund', requireAuth, requirePermission('canManageInvoices'), async (req, res) => {
  try {
    const {
      refundAmount,
      registerId,
      notes
    } = req.body;

    // Validation
    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid refund amount is required'
      });
    }

    if (!registerId) {
      return res.status(400).json({
        success: false,
        error: 'Register selection is required'
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

    // RMA must be inspected before refund
    if (rma.status !== 'inspected') {
      return res.status(400).json({
        success: false,
        error: 'RMA must be inspected before processing refund'
      });
    }

    // Check if already refunded
    if (rma.resolutionType === 'refund' && rma.refundProcessed) {
      return res.status(400).json({
        success: false,
        error: 'Refund already processed for this RMA'
      });
    }

    // Generate unique transaction ID
    const transactionId = `TXN-REFUND-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const receiptNumber = `RCP-REFUND-${Date.now()}`;

    // Get organization timezone (if stored)
    const Organization = require('../models/Organization');
    const org = await Organization.findById(req.organizationId);
    const timezone = org?.timezone || 'America/Los_Angeles';

    // Format local date/time
    const now = new Date();
    const localDateString = now.toLocaleDateString('en-US', { timeZone: timezone });
    const localTimeString = now.toLocaleTimeString('en-US', { timeZone: timezone });

    // Create refund transaction
    const refundTransaction = new Transaction({
      organizationId: req.organizationId,
      transactionId: transactionId,

      // Items from RMA (for record-keeping)
      items: rma.items.map(item => ({
        productId: item.productId,
        name: item.productName,
        sku: item.sku || 'N/A',
        category: item.category || 'Cannabis',
        subcategory: item.subcategory || '',
        pricingOption: {
          unit: item.unit || 'each',
          weight: item.weight || 0,
          price: item.unitPrice || 0
        },
        quantity: item.quantity,
        cannabis: {
          thc: item.thcContent || 0,
          cbd: item.cbdContent || 0,
          batchNumber: item.batchNumber || ''
        }
      })),

      // Financial totals (negative for refund)
      totals: {
        subtotal: -refundAmount,
        discountAmount: 0,
        discountedSubtotal: -refundAmount,
        taxAmount: 0, // Tax already included in original sale
        grandTotal: -refundAmount,
        changeAmount: 0
      },

      // Payment method (cash only for cannabis)
      paymentMethod: 'cash',
      cashReceived: 0, // No cash received, cash going out

      // Customer info (from RMA)
      customerInfo: {
        name: rma.customerName,
        phone: rma.customerPhone,
        email: rma.customerEmail
      },

      // Status
      status: 'completed', // Refund is complete

      // Receipt data
      receiptData: {
        receiptNumber: receiptNumber,
        timestamp: now,
        localDateString: localDateString,
        localTimeString: localTimeString,
        timezone: timezone,
        timezoneOffset: now.getTimezoneOffset(),
        printed: false,
        emailed: false
      },

      // Compliance tracking
      compliance: {
        stateTrackingNumbers: rma.items
          .filter(item => item.stateTrackingId)
          .map(item => item.stateTrackingId),
        employeeId: req.userId,
        registerId: registerId,
        shift: {
          id: `SHIFT-${now.toISOString().split('T')[0]}`,
          startTime: now,
          employee: req.userId
        }
      },

      // Metadata
      processedAt: now,
      createdBy: req.userId
    });

    await refundTransaction.save();

    // Update RMA with refund information
    rma.resolutionType = 'refund';
    rma.refundAmount = refundAmount;
    rma.refundProcessed = true;
    rma.resolutionDate = now;
    rma.status = 'resolved';

    // Store transaction reference in RMA (if your RMA model supports it)
    if (!rma.refundTransactionId) {
      rma.refundTransactionId = refundTransaction._id;
    }

    await rma.save();

    console.log('✅ Cash refund processed:', {
      rmaNumber: rma.rmaNumber,
      amount: refundAmount,
      register: registerId,
      transactionId: transactionId,
      receiptNumber: receiptNumber
    });

    res.json({
      success: true,
      message: 'Cash refund processed successfully',
      rma: rma,
      transaction: {
        transactionId: transactionId,
        receiptNumber: receiptNumber,
        amount: refundAmount,
        registerId: registerId,
        timestamp: now
      }
    });

  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/rma/:id/refund-receipt
 * @desc    Get refund receipt data for printing
 * @access  Private
 */
router.get('/:id/refund-receipt', requireAuth, async (req, res) => {
  try {
    const rma = await RMA.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    })
      .populate('createdBy', 'firstName lastName')
      .populate('refundTransactionId');

    if (!rma) {
      return res.status(404).json({
        success: false,
        error: 'RMA not found'
      });
    }

    if (!rma.refundProcessed) {
      return res.status(400).json({
        success: false,
        error: 'Refund has not been processed yet'
      });
    }

    // Get organization info
    const Organization = require('../models/Organization');
    const org = await Organization.findById(req.organizationId);

    // Get transaction if available
    let transaction = null;
    if (rma.refundTransactionId) {
      transaction = await Transaction.findById(rma.refundTransactionId)
        .populate('compliance.employeeId', 'firstName lastName');
    }

    // Build receipt data
    const receiptData = {
      organization: {
        name: org?.businessName || 'Cannabis Dispensary',
        address: org?.address || '',
        phone: org?.phone || '',
        email: org?.email || '',
        licenseNumber: org?.licenseNumber || ''
      },
      rma: {
        rmaNumber: rma.rmaNumber,
        invoiceNumber: rma.invoiceNumber,
        returnReason: rma.returnReason,
        detailedReason: rma.detailedReason
      },
      refund: {
        amount: rma.refundAmount,
        date: rma.resolutionDate,
        processedBy: transaction?.compliance?.employeeId || rma.createdBy,
        registerId: transaction?.compliance?.registerId
      },
      items: rma.items.map(item => ({
        name: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        price: item.unitPrice,
        total: item.totalValue
      })),
      customer: {
        name: rma.customerName,
        email: rma.customerEmail,
        phone: rma.customerPhone
      },
      receipt: {
        number: transaction?.receiptData?.receiptNumber || `RCP-${rma.rmaNumber}`,
        timestamp: rma.resolutionDate,
        localDate: transaction?.receiptData?.localDateString || new Date(rma.resolutionDate).toLocaleDateString(),
        localTime: transaction?.receiptData?.localTimeString || new Date(rma.resolutionDate).toLocaleTimeString()
      }
    };

    res.json({
      success: true,
      receipt: receiptData
    });

  } catch (error) {
    console.error('Get refund receipt error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve receipt data'
    });
  }
});

/**
 * @route   PUT /api/rma/:id/issue-credit
 * @desc    Issue store credit from RMA resolution
 * @access  Private (requires canManageInvoices)
 */
router.put('/:id/issue-credit', requireAuth, requirePermission('canManageInvoices'), async (req, res) => {
  try {
    const {
      creditAmount,
      creditMemoNumber, // Optional - will auto-generate if not provided
      expirationMonths // Optional - months until expiration (e.g., 12)
    } = req.body;

    // Validation
    if (!creditAmount || creditAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid credit amount is required'
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

    // RMA must be inspected before issuing credit
    if (rma.status !== 'inspected') {
      return res.status(400).json({
        success: false,
        error: 'RMA must be inspected before issuing credit'
      });
    }

    // Check if credit already issued
    if (rma.resolutionType === 'store_credit' && rma.creditMemoNumber) {
      return res.status(400).json({
        success: false,
        error: 'Store credit already issued for this RMA'
      });
    }

    // Generate or validate credit memo number
    let finalCreditMemoNumber = creditMemoNumber;
    if (!finalCreditMemoNumber) {
      finalCreditMemoNumber = await StoreCredit.generateCreditMemoNumber(req.organizationId);
    } else {
      // Check if credit memo number already exists
      const existing = await StoreCredit.findOne({
        organizationId: req.organizationId,
        creditMemoNumber: finalCreditMemoNumber
      });
      
      if (existing) {
        return res.status(400).json({
          success: false,
          error: `Credit memo ${finalCreditMemoNumber} already exists`
        });
      }
    }

    // Calculate expiration date (optional)
    let expirationDate = null;
    if (expirationMonths && expirationMonths > 0) {
      expirationDate = new Date();
      expirationDate.setMonth(expirationDate.getMonth() + expirationMonths);
    }

    // Create store credit record
    const storeCredit = new StoreCredit({
      organizationId: req.organizationId,
      creditMemoNumber: finalCreditMemoNumber,
      
      // Customer info
      customerId: rma.customerId,
      customerName: rma.customerName,
      customerEmail: rma.customerEmail,
      customerPhone: rma.customerPhone,
      
      // Amounts
      originalAmount: creditAmount,
      remainingBalance: creditAmount,
      
      // Status
      status: 'active',
      
      // Source
      sourceType: 'rma_refund',
      sourceReferenceId: rma._id,
      sourceDescription: `RMA ${rma.rmaNumber} - ${rma.returnReason}`,
      
      // Dates
      issuedDate: new Date(),
      expirationDate: expirationDate,
      
      // Audit
      issuedBy: req.userId
    });

    await storeCredit.save();

    // Update RMA with credit information
    rma.resolutionType = 'store_credit';
    rma.creditAmount = creditAmount;
    rma.creditMemoNumber = finalCreditMemoNumber;
    rma.resolutionDate = new Date();
    rma.status = 'resolved';

    await rma.save();

    console.log('✅ Store credit issued:', {
      rmaNumber: rma.rmaNumber,
      creditMemo: finalCreditMemoNumber,
      amount: creditAmount,
      customer: rma.customerName
    });

    res.json({
      success: true,
      message: 'Store credit issued successfully',
      rma: rma,
      storeCredit: {
        creditMemoNumber: finalCreditMemoNumber,
        amount: creditAmount,
        expirationDate: expirationDate,
        status: 'active'
      }
    });

  } catch (error) {
    console.error('Issue credit error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to issue store credit',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/customers/:customerId/credits
 * @desc    Get customer's store credit balance and history
 * @access  Private
 */
router.get('/customers/:customerId/credits', requireAuth, async (req, res) => {
  try {
    const { customerId } = req.params;

    // Get customer's available credits
    const creditBalance = await StoreCredit.getCustomerBalance(
      customerId,
      req.organizationId
    );

    // Get full credit history
    const allCredits = await StoreCredit.find({
      customerId: customerId,
      organizationId: req.organizationId
    })
      .populate('issuedBy', 'firstName lastName')
      .populate('sourceReferenceId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      balance: {
        total: creditBalance.totalBalance,
        activeCredits: creditBalance.count
      },
      credits: allCredits
    });

  } catch (error) {
    console.error('Get customer credits error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer credits'
    });
  }
});

/**
 * @route   POST /api/pos/apply-credit
 * @desc    Apply store credit to a POS transaction
 * @access  Private
 */
router.post('/pos/apply-credit', requireAuth, async (req, res) => {
  try {
    const {
      creditMemoNumber,
      amountToApply,
      transactionId,
      registerId
    } = req.body;

    // Validation
    if (!creditMemoNumber || !amountToApply || !transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Credit memo number, amount, and transaction ID required'
      });
    }

    // Find credit
    const storeCredit = await StoreCredit.findOne({
      organizationId: req.organizationId,
      creditMemoNumber: creditMemoNumber
    });

    if (!storeCredit) {
      return res.status(404).json({
        success: false,
        error: 'Credit memo not found'
      });
    }

    // Check if credit is available
    if (!storeCredit.isAvailable) {
      return res.status(400).json({
        success: false,
        error: `Credit is ${storeCredit.status} and cannot be used`
      });
    }

    // Check if amount is valid
    if (amountToApply > storeCredit.remainingBalance) {
      return res.status(400).json({
        success: false,
        error: `Cannot apply $${amountToApply}. Only $${storeCredit.remainingBalance} available.`
      });
    }

    // Apply credit
    await storeCredit.applyCredit(
      amountToApply,
      transactionId,
      req.userId,
      registerId
    );

    console.log('✅ Store credit applied:', {
      creditMemo: creditMemoNumber,
      amountApplied: amountToApply,
      remainingBalance: storeCredit.remainingBalance,
      transactionId: transactionId
    });

    res.json({
      success: true,
      message: 'Store credit applied successfully',
      credit: {
        creditMemoNumber: creditMemoNumber,
        amountApplied: amountToApply,
        remainingBalance: storeCredit.remainingBalance,
        status: storeCredit.status
      }
    });

  } catch (error) {
    console.error('Apply credit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply store credit'
    });
  }
});



module.exports = router