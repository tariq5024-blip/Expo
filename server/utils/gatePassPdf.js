const PDFDocument = require('pdfkit');
const { normalizeGatePassAssets } = require('./gatePassNormalize');

const formatPdfDate = (d) => {
  if (!d) return '';
  return new Date(d)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/ /g, '-');
};

const formatPdfDateTime = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return x.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * A4 landscape gate pass PDF (summary aligned with admin Pass Preview / print layout).
 */
function buildGatePassPdfBuffer(pass, assetsArg) {
  const p = pass && typeof pass.toObject === 'function' ? pass.toObject() : pass;
  const assets = Array.isArray(assetsArg) ? assetsArg : normalizeGatePassAssets(p);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      info: {
        Title: `Gate Pass ${p.file_no || p.pass_number || ''}`,
        Author: 'Expo Stores'
      }
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = doc.y;

    doc.fontSize(16).fillColor('#0b3a53').text('GATE PASS — EXPO CITY DUBAI', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#000000').text(`SECURITY HANDOVER    DATE ${formatPdfDate(p.createdAt)}`, {
      align: 'center'
    });
    doc.moveDown(0.8);
    y = doc.y;

    const labelW = 100;
    const lineH = 16;
    const meta = [
      ['FILE NO.', p.file_no || p.pass_number || '—'],
      ['TICKET NO./PO.', p.ticket_no || '—'],
      ['PASS TYPE', p.type || '—'],
      ['REQUESTED BY', p.requested_by || p.issued_to?.name || '—'],
      ['PROVIDED BY', p.provided_by || '—'],
      ['COLLECTED BY', p.collected_by || p.issued_to?.name || '—'],
      ['APPROVED BY', p.approved_by || '—']
    ];
    doc.fontSize(9);
    meta.forEach(([k, v]) => {
      doc.font('Helvetica-Bold').text(k, doc.page.margins.left, y, { width: labelW, lineBreak: false });
      doc.font('Helvetica').text(String(v), doc.page.margins.left + labelW, y, {
        width: pageW - labelW,
        lineBreak: false
      });
      y += lineH;
    });

    y += 6;
    doc.font('Helvetica-Bold').fontSize(8).text('MOVING FROM', doc.page.margins.left, y);
    doc.text('MOVING TO', doc.page.margins.left + pageW / 2, y);
    y += 12;
    doc.font('Helvetica').fontSize(9);
    doc.text(String(p.origin || '—'), doc.page.margins.left, y, { width: pageW / 2 - 12 });
    doc.text(String(p.destination || '—'), doc.page.margins.left + pageW / 2, y, { width: pageW / 2 - 12 });
    y += 28;

    const cols = [
      { w: 22, h: '#', key: 'idx' },
      { w: 72, h: 'Product', key: 'productName' },
      { w: 62, h: 'Model', key: 'model' },
      { w: 78, h: 'Serial', key: 'serial_number' },
      { w: 72, h: 'Unique ID', key: 'unique_id' },
      { w: 58, h: 'Mfr', key: 'brand' },
      { w: 52, h: 'Status', key: 'status' },
      { w: 46, h: 'Cond.', key: 'condition' },
      { w: 56, h: 'Ticket', key: 'ticket_number' },
      { w: 22, h: 'Qty', key: 'quantity' },
      { w: 130, h: 'Remarks', key: 'remarks' }
    ];
    const totalColW = cols.reduce((s, c) => s + c.w, 0);
    const scale = totalColW > pageW ? pageW / totalColW : 1;
    cols.forEach((c) => {
      c.w *= scale;
    });

    const headerH = 16;
    doc.save();
    doc.rect(doc.page.margins.left, y, pageW, headerH).fill('#0b3a53');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.5);
    let hx = doc.page.margins.left;
    cols.forEach((c) => {
      doc.text(c.h, hx + 2, y + 4, { width: c.w - 4, align: 'center' });
      hx += c.w;
    });
    doc.restore();
    doc.fillColor('#000000');
    y += headerH;

    doc.font('Helvetica').fontSize(6).fillColor('#000000');
    assets.forEach((a, i) => {
      const rowData = {
        idx: String(i + 1),
        productName: a.productName || '—',
        model: a.model || '—',
        serial_number: a.serial_number || '—',
        unique_id: a.unique_id || '—',
        brand: a.brand || '—',
        status: a.status || '—',
        condition: a.condition || '—',
        ticket_number: a.ticket_number || '—',
        quantity: String(a.quantity ?? 1),
        remarks: (a.remarks || '—').replace(/\n/g, ' ')
      };
      const rowHeights = cols.map((c) => {
        const txt = String(rowData[c.key] ?? '—');
        return doc.heightOfString(txt, { width: c.w - 4 });
      });
      const rh = Math.max(14, ...rowHeights.map((h) => h + 6));
      if (y + rh > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
        y = doc.page.margins.top;
      }
      let x = doc.page.margins.left;
      cols.forEach((c) => {
        const txt = String(rowData[c.key] ?? '—');
        doc.rect(x, y, c.w, rh).stroke('#64748b');
        doc.text(txt, x + 2, y + 3, { width: c.w - 4, align: c.key === 'remarks' ? 'left' : 'center' });
        x += c.w;
      });
      y += rh;
    });

    y += 10;
    doc.font('Helvetica-Bold').fontSize(9).text(`JUSTIFICATION: `, doc.page.margins.left, y, { continued: true });
    doc.font('Helvetica').text(String(p.justification || p.notes || '—'));
    y = doc.y + 8;

    doc.fontSize(8).fillColor('#444444');
    doc.text(`Document No: ${p.file_no || p.pass_number || '—'}  |  Created: ${formatPdfDateTime(p.createdAt)}  |  Type: ${p.type || '—'}`, doc.page.margins.left, y, {
      width: pageW,
      align: 'left'
    });

    doc.end();
  });
}

module.exports = {
  buildGatePassPdfBuffer,
  formatPdfDate
};
