// Migration script to update existing users
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const migrateExistingUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Find users without the new access control fields
    const usersToUpdate = await User.find({
      accessLevel: { $exists: false }
    });

    console.log(`Found ${usersToUpdate.length} users to migrate`);

    for (const user of usersToUpdate) {
      // Give existing users admin access (you can adjust this)
      user.accessLevel = 'admin';
      user.subscriptionStatus = 'none';
      user.loginCount = 0;
      
      // If this is your test account, ensure it's admin
      if (user.email === 'aus@gmail.com') {
        user.accessLevel = 'admin';
        console.log(`✅ Set ${user.email} as admin`);
      }
      
      await user.save();
      console.log(`✅ Migrated user: ${user.email}`);
    }

    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

migrateExistingUsers();