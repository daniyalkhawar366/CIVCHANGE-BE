import fs from 'fs';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

export async function extractTextFromPDF(pdfPath) {
  const textData = [];

  const buffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      // item.transform: [a, b, c, d, e, f] (e, f) is the position
      // item.height is the font size
      textData.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        fontSize: item.height,
        page: i
      });
    }
  }

  return textData;
} 