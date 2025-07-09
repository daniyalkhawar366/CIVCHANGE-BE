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
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      const [ , , , , x, y ] = item.transform;
      textData.push({
        text: item.str,
        xNorm: x / viewport.width,
        yNorm: y / viewport.height,
        fontSizeNorm: item.height / viewport.height,
        page: i
      });
    }
  }

  return textData;
} 