import jsPDF from 'jspdf';

function stripInlineMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1');
}

function processLines(doc, content, marginX, maxWidth, scale, draw, startY, pageHeight, marginY) {
  let y = startY;

  const ensureSpace = (needed) => {
    if (draw && y + needed > pageHeight - marginY) {
      doc.addPage();
      y = marginY;
    }
  };

  for (const raw of content.split('\n')) {
    if (raw.startsWith('# ')) {
      if (!draw) {
        doc.setFontSize(18 * scale);
        doc.setFont('times', 'bold');
      } else {
        doc.setFontSize(18 * scale);
        doc.setFont('times', 'bold');
        ensureSpace(14 * scale);
      }
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw.slice(2)), maxWidth);
      if (draw) doc.text(wrapped, marginX, y);
      y += wrapped.length * 8 * scale + 4 * scale;
    } else if (raw.startsWith('## ')) {
      doc.setFontSize(13 * scale);
      doc.setFont('times', 'bold');
      if (draw) ensureSpace(12 * scale);
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw.slice(3)), maxWidth);
      if (draw) doc.text(wrapped, marginX, y);
      y += wrapped.length * 6.5 * scale;
      if (draw) {
        doc.setDrawColor(180, 180, 180);
        doc.line(marginX, y + 1, marginX + maxWidth, y + 1);
      }
      y += 5 * scale;
    } else if (raw.startsWith('### ')) {
      doc.setFontSize(11 * scale);
      doc.setFont('times', 'bold');
      if (draw) ensureSpace(8 * scale);
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw.slice(4)), maxWidth);
      if (draw) doc.text(wrapped, marginX, y);
      y += wrapped.length * 5.5 * scale + 2 * scale;
    } else if (raw.trim() === '' || raw.trim() === '---') {
      y += 4 * scale;
    } else if (/^[-*]\s/.test(raw.trim())) {
      doc.setFontSize(10 * scale);
      doc.setFont('times', 'normal');
      if (draw) ensureSpace(6 * scale);
      const bulletText = '• ' + stripInlineMarkdown(raw.trim().slice(2));
      const wrapped = doc.splitTextToSize(bulletText, maxWidth - 4);
      if (draw) doc.text(wrapped, marginX + 2, y);
      y += wrapped.length * 5 * scale + 1 * scale;
    } else {
      doc.setFontSize(10 * scale);
      doc.setFont('times', 'normal');
      if (draw) ensureSpace(6 * scale);
      const wrapped = doc.splitTextToSize(stripInlineMarkdown(raw), maxWidth);
      if (draw) doc.text(wrapped, marginX, y);
      y += wrapped.length * 5 * scale + 1 * scale;
    }
  }

  return y;
}

export function contentToPdfBlob(content, { singlePage = false } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const marginY = 25;
  const maxWidth = pageWidth - marginX * 2;
  const availableHeight = pageHeight - marginY * 2;

  let scale = 1.0;
  if (singlePage) {
    const naturalBottom = processLines(
      doc,
      content,
      marginX,
      maxWidth,
      1.0,
      false,
      0,
      pageHeight,
      marginY
    );
    scale = naturalBottom > availableHeight ? Math.max(0.72, availableHeight / naturalBottom) : 1.0;
  }

  processLines(doc, content, marginX, maxWidth, scale, true, marginY, pageHeight, marginY);

  return doc.output('blob');
}
