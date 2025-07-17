import fs from 'fs';
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

export async function extractTextFromPDF(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const pdf = await loadingTask.promise;

  const allText = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const lines = [];

    for (const item of content.items) {
      const [ , , , , x, y ] = item.transform;
      lines.push({
        str: item.str,
        x,
        y,
        width: item.width,
        height: item.height,
        page: pageNum,
        fontSizeNorm: item.height / viewport.height,
        xNorm: x / viewport.width,
        yNorm: y / viewport.height
      });
    }

    // Group into lines based on Y proximity
    const grouped = [];
    lines.sort((a, b) => b.y - a.y); // sort by Y descending
    for (const word of lines) {
      const line = grouped.find(
        l => Math.abs(l.avgY - word.y) < 4 && word.page === l.page
      );
      if (line) {
        line.words.push(word);
        line.avgY = (line.avgY * (line.words.length - 1) + word.y) / line.words.length;
      } else {
        grouped.push({ words: [word], avgY: word.y, page: word.page });
      }
    }

    for (const group of grouped) {
      group.words.sort((a, b) => a.x - b.x); // left to right
      const text = group.words.map(w => w.str).join(' ').replace(/\s+/g, ' ');
      const minX = Math.min(...group.words.map(w => w.xNorm));
      const maxY = Math.max(...group.words.map(w => w.yNorm));
      const avgFont = group.words.reduce((s, w) => s + w.fontSizeNorm, 0) / group.words.length;

      allText.push({
        text,
        xNorm: minX,
        yNorm: maxY,
        fontSizeNorm: avgFont,
        page: group.page
      });
    }
  }

  return allText;
}
