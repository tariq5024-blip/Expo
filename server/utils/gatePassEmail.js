const { normalizeGatePassAssets } = require('./gatePassNormalize');

const escEmailHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatGatePassEmailDate = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return date
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/ /g, '-');
};

const resolveAssetRows = (pass, options = {}) => {
  const p = pass && typeof pass.toObject === 'function' ? pass.toObject() : pass;
  if (Array.isArray(options.assets)) return options.assets;
  return normalizeGatePassAssets(p);
};

const buildTechnicianGatePassEmailText = (pass, options = {}) => {
  const p = pass && typeof pass.toObject === 'function' ? pass.toObject() : pass;
  const assetRows = resolveAssetRows(p, options);
  const lines = [
    'GATE PASS EXPO CITY DUBAI',
    '',
    `SECURITY HANDOVER — DATE ${formatGatePassEmailDate(p.createdAt)}`,
    `File No.: ${p.file_no || p.pass_number || '—'}`,
    `Ticket / PO: ${p.ticket_no || '—'}`,
    `Pass type: ${p.type || '—'}`,
    `Moving from: ${p.origin || '—'}`,
    `Moving to: ${p.destination || '—'}`,
    `Requested by: ${p.requested_by || p.issued_to?.name || '—'}`,
    `Provided by: ${p.provided_by || '—'}`,
    `Collected by: ${p.collected_by || p.issued_to?.name || '—'}`,
    `Approved by: ${p.approved_by || '—'}`,
    '',
    'Assets (current system details):',
    ...assetRows.map((a, i) => {
      const block = [
        `  ${i + 1}. Product: ${a.productName || '—'}`,
        `      Model: ${a.model || '—'} | Serial: ${a.serial_number || '—'} | Unique ID: ${a.unique_id || '—'}`,
        `      Manufacturer: ${a.brand || '—'} | Status: ${a.status || '—'} | Condition: ${a.condition || '—'}`,
        `      Location: ${a.location || '—'} | Ticket: ${a.ticket_number || '—'} | Qty: ${a.quantity ?? 1}`,
        `      Remarks: ${(a.remarks || '—').replace(/\n/g, ' ')}`
      ];
      return block.join('\n');
    }),
    '',
    `Justification: ${p.justification || p.notes || '—'}`,
    '',
    'A PDF copy of this gate pass is attached for printing and security verification.'
  ];
  return lines.join('\n');
};

const buildTechnicianGatePassEmailHtml = (pass, options = {}) => {
  const p = pass && typeof pass.toObject === 'function' ? pass.toObject() : pass;
  const assetRows = resolveAssetRows(p, options);
  const appLink = options.appLink || '';

  const assetRowsHtml = assetRows
    .map(
      (a, i) =>
        `<tr>
          <td style="border:1px solid #64748b;padding:6px;text-align:center;">${i + 1}</td>
          <td style="border:1px solid #64748b;padding:6px;">${escEmailHtml(a.productName)}</td>
          <td style="border:1px solid #64748b;padding:6px;">${escEmailHtml(a.model)}</td>
          <td style="border:1px solid #64748b;padding:6px;font-family:monospace;font-size:11px;">${escEmailHtml(a.serial_number)}</td>
          <td style="border:1px solid #64748b;padding:6px;font-family:monospace;font-size:11px;">${escEmailHtml(a.unique_id)}</td>
          <td style="border:1px solid #64748b;padding:6px;">${escEmailHtml(a.brand)}</td>
          <td style="border:1px solid #64748b;padding:6px;">${escEmailHtml(a.status)}</td>
          <td style="border:1px solid #64748b;padding:6px;">${escEmailHtml(a.condition)}</td>
          <td style="border:1px solid #64748b;padding:6px;">${escEmailHtml(a.location)}</td>
          <td style="border:1px solid #64748b;padding:6px;">${escEmailHtml(a.ticket_number)}</td>
          <td style="border:1px solid #64748b;padding:6px;text-align:center;">${escEmailHtml(a.quantity)}</td>
          <td style="border:1px solid #64748b;padding:6px;font-size:11px;">${escEmailHtml(a.remarks)}</td>
        </tr>`
    )
    .join('');

  const linkBlock = appLink
    ? `<p style="margin:16px 0 0 0;font-size:13px;"><a href="${escEmailHtml(appLink)}" style="color:#0b3a53;font-weight:bold;">Open Gate Passes in the app</a> to view or print this pass.</p>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#e2e8f0;padding:16px;">
  <div style="max-width:960px;margin:0 auto;background:#fff;border:2px solid #0b3a53;padding:18px;">
    <h1 style="margin:0 0 14px 0;text-align:center;font-size:20px;color:#0b3a53;letter-spacing:0.06em;">GATE PASS EXPO CITY DUBAI</h1>
    <div style="background:#0b3a53;color:#fff;padding:10px 12px;font-weight:bold;font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <span>SECURITY HANDOVER</span><span>DATE ${escEmailHtml(formatGatePassEmailDate(p.createdAt))}</span>
    </div>
    <p style="font-size:12px;color:#334155;margin:12px 0 8px 0;"><strong>PDF attached:</strong> Official gate pass for printing (same details as below).</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:0;border:1px solid #64748b;">
      <tr>
        <td style="border:1px solid #64748b;padding:8px;background:#f1f5f9;width:18%;"><b>FILE NO.</b></td>
        <td style="border:1px solid #64748b;padding:8px;">${escEmailHtml(p.file_no || p.pass_number)}</td>
        <td style="border:1px solid #64748b;padding:8px;background:#f1f5f9;width:18%;"><b>TICKET NO./PO.</b></td>
        <td style="border:1px solid #64748b;padding:8px;">${escEmailHtml(p.ticket_no)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #64748b;padding:8px;background:#f1f5f9;"><b>REQUESTED BY</b></td>
        <td colspan="3" style="border:1px solid #64748b;padding:8px;">${escEmailHtml(p.requested_by || p.issued_to?.name)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #64748b;padding:8px;background:#f1f5f9;"><b>PROVIDED BY</b></td>
        <td colspan="3" style="border:1px solid #64748b;padding:8px;">${escEmailHtml(p.provided_by)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #64748b;padding:8px;background:#f1f5f9;"><b>COLLECTED BY</b></td>
        <td colspan="3" style="border:1px solid #64748b;padding:8px;">${escEmailHtml(p.collected_by || p.issued_to?.name)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #64748b;padding:8px;background:#f1f5f9;"><b>APPROVED BY</b></td>
        <td colspan="3" style="border:1px solid #64748b;padding:8px;">${escEmailHtml(p.approved_by)}</td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:12px 0;">
      <tr>
        <td style="vertical-align:top;width:50%;padding-right:8px;">
          <div style="color:#64748b;font-weight:bold;font-size:11px;">MOVING FROM</div>
          <div style="font-weight:bold;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">${escEmailHtml(p.origin)}</div>
        </td>
        <td style="vertical-align:top;width:50%;padding-left:8px;">
          <div style="color:#64748b;font-weight:bold;font-size:11px;">MOVING TO</div>
          <div style="font-weight:bold;border-bottom:1px solid #cbd5e1;padding-bottom:4px;">${escEmailHtml(p.destination)}</div>
        </td>
      </tr>
    </table>
    <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;text-align:center;min-width:720px;">
      <thead>
        <tr style="background:#0f766e;color:#fff;">
          <th style="border:1px solid #0f766e;padding:8px;">#</th>
          <th style="border:1px solid #0f766e;padding:8px;">Product</th>
          <th style="border:1px solid #0f766e;padding:8px;">Model</th>
          <th style="border:1px solid #0f766e;padding:8px;">Serial</th>
          <th style="border:1px solid #0f766e;padding:8px;">Unique ID</th>
          <th style="border:1px solid #0f766e;padding:8px;">Mfr</th>
          <th style="border:1px solid #0f766e;padding:8px;">Status</th>
          <th style="border:1px solid #0f766e;padding:8px;">Cond.</th>
          <th style="border:1px solid #0f766e;padding:8px;">Location</th>
          <th style="border:1px solid #0f766e;padding:8px;">Ticket</th>
          <th style="border:1px solid #0f766e;padding:8px;">Qty</th>
          <th style="border:1px solid #0f766e;padding:8px;">Remarks</th>
        </tr>
      </thead>
      <tbody>${assetRowsHtml || '<tr><td colspan="12" style="border:1px solid #64748b;padding:8px;">—</td></tr>'}</tbody>
    </table>
    </div>
    <p style="font-size:12px;margin:14px 0 0 0;border-top:1px solid #cbd5e1;padding-top:10px;"><b>JUSTIFICATION:</b> ${escEmailHtml(p.justification || p.notes)}</p>
    ${linkBlock}
    <p style="font-size:10px;color:#94a3b8;margin:16px 0 0 0;text-align:right;">Expo Stores — automated gate pass notification</p>
  </div>
</body></html>`;
};

module.exports = {
  escEmailHtml,
  formatGatePassEmailDate,
  buildTechnicianGatePassEmailText,
  buildTechnicianGatePassEmailHtml,
  normalizeGatePassAssets,
  resolveAssetRows
};
