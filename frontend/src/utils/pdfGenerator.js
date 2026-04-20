import jsPDF from 'jspdf';

function stripInlineMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1');
}

export function contentToPdfBlob(content) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const marginY = 25;
  const maxWidth = pageWidth - marginX * 2;
  let y = marginY;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - marginY) {
      doc.addPage();
      y = marginY;
    }
  };

  for (const raw of content.split('\n')) {
    if (raw.startsWith('# ')) {
      ensureSpace(14);
      doc.setFontSize(18);
      doc.setFont('times', 'bold');
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw.slice(2)), maxWidth);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 8 + 4;
    } else if (raw.startsWith('## ')) {
      ensureSpace(12);
      doc.setFontSize(13);
      doc.setFont('times', 'bold');
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw.slice(3)), maxWidth);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 6.5;
      doc.setDrawColor(180, 180, 180);
      doc.line(marginX, y + 1, pageWidth - marginX, y + 1);
      y += 5;
    } else if (raw.startsWith('### ')) {
      ensureSpace(8);
      doc.setFontSize(11);
      doc.setFont('times', 'bold');
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw.slice(4)), maxWidth);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 5.5 + 2;
    } else if (raw.trim() === '' || raw.trim() === '---') {
      y += 4;
    } else if (/^[-*]\s/.test(raw.trim())) {
      ensureSpace(6);
      doc.setFontSize(10);
      doc.setFont('times', 'normal');
      const bulletText = '• ' + stripInlineMarkdown(raw.trim().slice(2));
      const wrapped = doc.splitTextToSize(bulletText, maxWidth - 4);
      doc.text(wrapped, marginX + 2, y);
      y += wrapped.length * 5 + 1;
    } else {
      ensureSpace(6);
      doc.setFontSize(10);
      doc.setFont('times', 'normal');
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw), maxWidth);
      doc.text(wrapped, marginX, y);
      y += wrapped.length * 5 + 1;
    }
  }

  return doc.output('blob');
}
