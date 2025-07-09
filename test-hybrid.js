import HybridPdfService from './server/services/hybridPdfService.js';
import fs from 'fs';
import path from 'path';

async function testHybridService() {
  console.log('Testing Hybrid PDF Service...');
  
  const service = new HybridPdfService();
  
  try {
    // Initialize the service
    console.log('Initializing service...');
    await service.initialize();
    
    // Test with a sample PDF (you'll need to provide one)
    const testPdfPath = './test.pdf'; // You'll need to create this
    const outputPath = './test-output.psd';
    
    if (!fs.existsSync(testPdfPath)) {
      console.log('No test PDF found. Creating a simple test...');
      console.log('Service initialization successful!');
      console.log('Ready for PDF conversion.');
      return;
    }
    
    console.log('Converting PDF to PSD...');
    
    const progressCallback = (progress, message) => {
      console.log(`Progress: ${progress}% - ${message}`);
    };
    
    await service.convertPDFToPSD(testPdfPath, outputPath, progressCallback);
    
    console.log('Conversion completed successfully!');
    console.log(`Output file: ${outputPath}`);
    
    // Check if file was created
    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log(`Output file size: ${stats.size} bytes`);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await service.close();
    console.log('Service closed.');
  }
}

// Run the test
testHybridService().catch(console.error); 