// backend/scripts/migrate-to-multi-tenancy.js
/**
 * Migration Script: Add Multi-Tenancy Support
 * 
 * This script migrates your existing single-tenant data to multi-tenant structure.
 * It will:
 * 1. Create an Organization for each existing user
 * 2. Assign organizationId to all users
 * 3. Add organizationId to all invoices, products, customers, etc.
 * 
 * IMPORTANT: Backup your database before running this!
 * 
 * Run with: node scripts/migrate-to-multi-tenancy.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
// Add other models as needed

// Connect to database
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// Helper function to map old subscription status to new valid values
function mapSubscriptionStatus(oldStatus) {
  const statusMap = {
    'none': 'trialing',
    'inactive': 'trialing',
    'pending': 'trialing',
    'active': 'active',
    'trial': 'trialing',
    'past_due': 'past_due',
    'canceled': 'canceled',
    'cancelled': 'canceled'
  };
  
  return statusMap[oldStatus] || 'trialing';
}

async function migrateToMultiTenancy() {
  try {
    console.log('🚀 Starting multi-tenancy migration...\n');
    
    // Step 1: Get all users that don't have an organizationId
    const usersWithoutOrg = await User.find({ 
      $or: [
        { organizationId: { $exists: false } },
        { organizationId: null },
        { organizationId: '' }
      ]
    });
    
    console.log(`📊 Found ${usersWithoutOrg.length} users to migrate\n`);
    
    if (usersWithoutOrg.length === 0) {
      console.log('✅ No users to migrate. Database is already using multi-tenancy.');
      return;
    }
    
    let organizationsCreated = 0;
    let usersUpdated = 0;
    let invoicesUpdated = 0;
    let productsUpdated = 0;
    
    for (const user of usersWithoutOrg) {
      console.log(`\n👤 Processing user: ${user.email}`);
      
      // Determine company name
      const companyName = user.businessName 
        || user.companyName 
        || user.name 
        || `${user.email}'s Company`;
      
      // Map old subscription status to new valid value
      const oldStatus = user.subscriptionStatus || 'none';
      const newStatus = mapSubscriptionStatus(oldStatus);
      
      console.log(`   📝 Old subscription status: "${oldStatus}" → New: "${newStatus}"`);
      
      // Create organization for this user
      const organization = new Organization({
        companyName: companyName,
        billingEmail: user.email,
        stripeCustomerId: user.stripeCustomerId || null,
        subscriptionStatus: newStatus,  // ← Use mapped status
        subscriptionPlan: 'starter',
        currentUsers: 1,
        maxUsers: 5,
        ownerId: user._id
      });
      
      await organization.save();
      organizationsCreated++;
      
      console.log(`   ✅ Created organization: ${organization.organizationId}`);
      
      // Prepare user update data
      const userUpdate = {
        organizationId: organization.organizationId,
        isOwner: true,
        role: user.role || 'owner',
        permissions: User.getDefaultPermissions('owner')
      };
      
      // Add firstName/lastName if not present
      if (!user.firstName && user.name) {
        const nameParts = user.name.split(' ');
        userUpdate.firstName = nameParts[0] || user.name;
        userUpdate.lastName = nameParts.slice(1).join(' ') || '';
      }
      
      // Update user with organizationId
      await User.findByIdAndUpdate(user._id, userUpdate);
      usersUpdated++;
      
      console.log(`   ✅ Updated user with organizationId`);
      
      // Update all invoices created by this user
      const invoiceUpdateResult = await Invoice.updateMany(
        { 
          $or: [
            { user: user._id },
            { createdBy: user._id }
          ],
          $or: [
            { organizationId: { $exists: false } },
            { organizationId: null },
            { organizationId: '' }
          ]
        },
        { 
          $set: { 
            organizationId: organization.organizationId,
            createdBy: user._id
          } 
        }
      );
      
      if (invoiceUpdateResult.modifiedCount > 0) {
        invoicesUpdated += invoiceUpdateResult.modifiedCount;
        console.log(`   ✅ Updated ${invoiceUpdateResult.modifiedCount} invoices`);
      }
      
      // Update all products created by this user
      const productUpdateResult = await Product.updateMany(
        { 
          createdBy: user._id,
          $or: [
            { organizationId: { $exists: false } },
            { organizationId: null },
            { organizationId: '' }
          ]
        },
        { 
          $set: { organizationId: organization.organizationId } 
        }
      );
      
      if (productUpdateResult.modifiedCount > 0) {
        productsUpdated += productUpdateResult.modifiedCount;
        console.log(`   ✅ Updated ${productUpdateResult.modifiedCount} products`);
      }
      
      // Add updates for other models here (Customers, Transactions, Reports, etc.)
      // Example for Transactions:
      /*
      const Transaction = require('../models/Transaction');
      const transactionUpdateResult = await Transaction.updateMany(
        { 
          createdBy: user._id,
          $or: [
            { organizationId: { $exists: false } },
            { organizationId: null },
            { organizationId: '' }
          ]
        },
        { 
          $set: { organizationId: organization.organizationId } 
        }
      );
      */
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Migration Complete!');
    console.log('='.repeat(50));
    console.log(`📈 Summary:`);
    console.log(`   • Organizations created: ${organizationsCreated}`);
    console.log(`   • Users updated: ${usersUpdated}`);
    console.log(`   • Invoices updated: ${invoicesUpdated}`);
    console.log(`   • Products updated: ${productsUpdated}`);
    console.log('='.repeat(50) + '\n');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  }
}

// Run migration
migrateToMultiTenancy()
  .then(() => {
    console.log('✅ Migration successful!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });