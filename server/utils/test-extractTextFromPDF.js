import { extractTextFromPDF } from './extractTextFromPDF.js';
import path from 'path';

async function run() {
  const pdfPath = path.resolve('./uploads/sample-canva.pdf'); // Change path as needed
  const data = await extractTextFromPDF(pdfPath);
  console.log('Extracted text data:', data);
}

run().catch(console.error); 