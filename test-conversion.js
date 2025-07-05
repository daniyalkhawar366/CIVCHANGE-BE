import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE_URL = 'http://localhost:3001';

async function testConversion() {
  try {
    console.log('🧪 Testing Canva to PSD conversion...\n');
    
    // Check if server is running
    try {
      await axios.get(`${API_BASE_URL}/api/job/test`);
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Server is not running. Please start the server first:');
        console.log('   npm run server');
        return;
      }
    }
    
    // Create a simple test PDF (this would be a real PDF in production)
    console.log('📄 Creating test PDF...');
    const testPdfPath = path.join(__dirname, 'test-sample.pdf');
    
    // For testing purposes, we'll create a placeholder file
    // In a real scenario, you'd have an actual PDF file
    if (!fs.existsSync(testPdfPath)) {
      console.log('⚠️  No test PDF found. Please create a test-sample.pdf file for testing.');
      console.log('   You can export any Canva design as PDF and save it as test-sample.pdf');
      return;
    }
    
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
    
    console.log('⏳ Conversion started. Check the web interface for progress updates.');
    console.log(`🌐 Open http://localhost:5173 to view the conversion progress.`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Run the test
testConversion(); 