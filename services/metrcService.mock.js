// backend/services/metrcService.mock.js
// Mock Metrc service for development (no credentials needed)

class MetrcServiceMock {
  constructor() {
    console.log('🧪 Using MOCK Metrc Service (no real API calls)');
  }

  /**
   * Mock: Report waste/destruction to Metrc
   */
  async reportWaste(wasteData) {
    console.log('🧪 MOCK: Would report waste to Metrc:');
    console.log('   Package UID:', wasteData.packageUid);
    console.log('   Quantity:', wasteData.quantity, wasteData.unit);
    console.log('   Weight:', wasteData.weight, 'g');
    console.log('   Method:', wasteData.destructionMethod);
    console.log('   Reason:', wasteData.wasteReason);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return mock response
    return {
      success: true,
      adjustmentId: `MOCK-ADJ-${Date.now()}`,
      reportedAt: new Date(),
      message: 'Mock: Waste reported successfully'
    };
  }

  /**
   * Mock: Report multiple packages (for multi-item RMAs)
   */
  async reportBulkWaste(wasteItems) {
    console.log(`🧪 MOCK: Would report ${wasteItems.length} waste items to Metrc:`);
    
    wasteItems.forEach((item, index) => {
      console.log(`   Item ${index + 1}:`, {
        uid: item.packageUid,
        qty: item.quantity,
        weight: item.weight + 'g'
      });
    });

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return mock response
    const adjustmentIds = wasteItems.map((_, i) => `MOCK-ADJ-${Date.now()}-${i}`);

    return {
      success: true,
      adjustmentIds: adjustmentIds,
      reportedAt: new Date(),
      message: `Mock: ${wasteItems.length} waste items reported successfully`
    };
  }

  /**
   * Mock: Get package info from Metrc (for verification)
   */
  async getPackageInfo(packageUid) {
    console.log('🧪 MOCK: Would lookup package:', packageUid);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Return mock package data
    return {
      Id: Math.floor(Math.random() * 100000),
      Label: packageUid,
      PackageType: 'Product',
      Quantity: 1.0,
      UnitOfMeasure: 'Grams',
      ProductName: 'Mock Cannabis Product',
      ProductCategoryName: 'Flower',
      ItemStrainName: 'Mock Strain',
      ItemUnitCbdPercent: 0.5,
      ItemUnitThcPercent: 22.5,
      ReceivedDateTime: new Date().toISOString(),
      IsFinished: false,
      FinishedDate: null
    };
  }

  /**
   * Mock: Test Metrc connection
   */
  async testConnection() {
    console.log('🧪 MOCK: Testing Metrc connection...');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Return mock facilities data
    return {
      success: true,
      message: 'Mock connection successful',
      facilities: [
        {
          Id: 1,
          Name: 'Mock Facility #1',
          LicenseNumber: 'MOCK-LICENSE-001',
          FacilityType: 'Retailer'
        },
        {
          Id: 2,
          Name: 'Mock Facility #2',
          LicenseNumber: 'MOCK-LICENSE-002',
          FacilityType: 'Cultivator'
        }
      ],
      environment: 'MOCK (Development)',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Mock: Adjust package inventory
   */
  async adjustPackage(adjustmentData) {
    console.log('🧪 MOCK: Would adjust package inventory:', adjustmentData);

    await new Promise(resolve => setTimeout(resolve, 400));

    return {
      success: true,
      adjustmentId: `MOCK-INV-${Date.now()}`,
      message: 'Mock: Package adjusted successfully'
    };
  }

  /**
   * Mock: Create waste manifest
   */
  async createWasteManifest(manifestData) {
    console.log('🧪 MOCK: Would create waste manifest:', manifestData);

    await new Promise(resolve => setTimeout(resolve, 600));

    return {
      success: true,
      manifestId: `MOCK-MANIFEST-${Date.now()}`,
      manifestNumber: `WM-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      message: 'Mock: Waste manifest created successfully'
    };
  }
}

module.exports = new MetrcServiceMock();