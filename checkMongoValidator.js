// backend/checkMongoValidator.js
// Run this to check if MongoDB has a validator blocking our fields

const mongoose = require('mongoose');
require('dotenv').config();

async function checkValidator() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Get collection info
    const collections = await db.listCollections({ name: 'invoices' }).toArray();
    
    if (collections.length > 0) {
      console.log('\n📋 Invoice Collection Info:');
      console.log(JSON.stringify(collections[0], null, 2));
      
      if (collections[0].options && collections[0].options.validator) {
        console.log('\n⚠️ FOUND VALIDATOR - This might be blocking our fields!');
        console.log(JSON.stringify(collections[0].options.validator, null, 2));
      } else {
        console.log('\n✅ No validator found');
      }
    }
    
    // Try to manually insert a test document with local dates
    console.log('\n🧪 Testing manual insert with local dates...');
    const result = await db.collection('invoices').insertOne({
      organizationId: 'TEST-ORG',
      invoiceNumber: 'TEST-001',
      invoiceDate: new Date(),
      localInvoiceDate: new Date(),  // Test if this works
      localDueDate: new Date(),
      localCreatedDate: new Date(),
      localUpdatedDate: new Date(),
      items: [],
      subtotal: 0,
      total: 0,
      status: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('✅ Test insert result:', result.insertedId);
    
    // Check if it was actually saved
    const doc = await db.collection('invoices').findOne({ _id: result.insertedId });
    console.log('\n📄 Retrieved document:');
    console.log('localInvoiceDate:', doc.localInvoiceDate);
    console.log('localDueDate:', doc.localDueDate);
    console.log('localCreatedDate:', doc.localCreatedDate);
    console.log('localUpdatedDate:', doc.localUpdatedDate);
    
    // Clean up test document
    await db.collection('invoices').deleteOne({ _id: result.insertedId });
    console.log('\n✅ Test document cleaned up');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkValidator();