// backend/routes/organizationRoutes.js (create this file if it doesn't exist)

const express = require('express');
const router = express.Router();
const Organization = require('../models/Organization');
const { requireAuth } = require('../middlewares/auth.middleware');

/**
 * GET /api/organization/settings
 * Get organization settings
 */
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const org = await Organization.findOne({
      organizationId: req.organizationId
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Return settings
    res.json({
      name: org.companyName,
      timezone: org.timezone || 'America/Los_Angeles',
      businessHours: org.businessHours || {
        weekdayOpen: '09:00',
        weekdayClose: '21:00',
        weekendOpen: '10:00',
        weekendClose: '20:00',
        closed: []
      },
      location: org.location || {
        address: '',
        city: '',
        state: '',
        zip: ''
      },
      settings: org.settings || {}
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get settings'
    });
  }
});

/**
 * PUT /api/organization/settings
 * Update organization settings
 */
router.put('/settings', requireAuth, async (req, res) => {
  try {
    const { timezone, businessHours, location } = req.body;

    const org = await Organization.findOne({
      organizationId: req.organizationId
    });

    if (!org) {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Update fields
    if (timezone) {
      org.timezone = timezone;
    }
    
    if (businessHours) {
      org.businessHours = {
        ...org.businessHours,
        ...businessHours
      };
    }
    
    if (location) {
      org.location = {
        ...org.location,
        ...location
      };
    }

    await org.save();

    console.log('✅ Organization settings updated:', org.organizationId);
    console.log('   Timezone:', org.timezone);
    console.log('   Is currently open?', org.isCurrentlyOpen());

    res.json({
      success: true,
      message: 'Settings updated successfully',
      timezone: org.timezone,
      businessHours: org.businessHours,
      location: org.location
    });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
});

module.exports = router;