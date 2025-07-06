import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE_URL = 'http://localhost:5000';

async function testPhotopeaConversion() {
  try {
    console.log('🧪 Testing Photopea PDF to PSD conversion...\n');
    
    // Check if server is running
    try {
      await axios.get(`${API_BASE_URL}/`);
      console.log('✅ Server is running');
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Server is not running. Please start the server first:');
        console.log('   npm run server');
        return;
      }
    }
    
    // Check for test PDF
    const testPdfPath = path.join(__dirname, 'test-sample.pdf');
    if (!fs.existsSync(testPdfPath)) {
      console.log('⚠️  No test PDF found. Please create a test-sample.pdf file for testing.');
      console.log('   You can export any Canva design as PDF and save it as test-sample.pdf');
      return;
    }
    
    console.log('📄 Found test PDF, starting conversion test...\n');
    
    // Upload the test file
    console.log('📤 Uploading test file...');
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(testPdfPath);
    const file = new File([fileBuffer], 'test-sample.pdf', { type: 'application/pdf' });
    formData.append('pdf', file);
    
    const uploadResponse = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    const { jobId } = uploadResponse.data;
    console.log(`✅ File uploaded successfully. Job ID: ${jobId}`);
    
    // Start conversion
    console.log('🔄 Starting conversion...');
    await axios.post(`${API_BASE_URL}/api/convert`, { jobId });
    
    console.log('⏳ Conversion started. Monitoring progress...\n');
    
    // Monitor progress
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    
    while (attempts < maxAttempts) {
      try {
        const jobResponse = await axios.get(`${API_BASE_URL}/api/job/${jobId}`);
        const job = jobResponse.data;
        
        console.log(`📊 Progress: ${job.progress || 0}% - ${job.status || 'Processing...'}`);
        
        if (job.status === 'completed_with_photopea') {
          console.log('\n🎉 Conversion completed successfully with Photopea!');
          console.log(`📁 File: ${job.fileName}`);
          console.log(`🔗 Download: ${API_BASE_URL}${job.downloadUrl}`);
          return;
        } else if (job.status === 'completed_with_fallback') {
          console.log('\n⚠️  Conversion completed with fallback method (basic conversion)');
          console.log(`📁 File: ${job.fileName}`);
          console.log(`🔗 Download: ${API_BASE_URL}${job.downloadUrl}`);
          if (job.warning) {
            console.log(`⚠️  Warning: ${job.warning}`);
          }
          return;
        } else if (job.status === 'error') {
          console.log('\n❌ Conversion failed:');
          console.log(`Error: ${job.error}`);
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;
        
      } catch (error) {
        console.error('Error checking job status:', error.message);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    console.log('\n⏰ Test timed out after 5 minutes');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testPhotopeaConversion(); 