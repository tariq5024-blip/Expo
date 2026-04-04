/**
 * Merge embedded pass asset rows with populated Asset documents so emails/PDFs
 * match current system records (same data the admin sees after refresh).
 */

const coalesce = (...vals) => {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
};

const normalizeGatePassAssets = (pass) => {
  const rows = Array.isArray(pass?.assets) ? pass.assets : [];
  return rows.map((row) => {
    const live = row?.asset && typeof row.asset === 'object' && row.asset._id ? row.asset : null;
    const productName = coalesce(live?.product_name, live?.name, row.name);
    const model = coalesce(live?.model_number, row.model, row.asset_model);
    const serial_number = coalesce(live?.serial_number, row.serial_number);
    const unique_id = coalesce(live?.uniqueId, row.unique_id, row.uniqueId);
    const brand = coalesce(live?.manufacturer, row.brand);
    const status = coalesce(live?.status, row.status);
    const condition = coalesce(live?.condition, '');
    const location = coalesce(live?.location, row.location);
    const ticket_number = coalesce(live?.ticket_number, '');
    const qtyRaw = row.quantity ?? live?.quantity;
    const quantity = Number.isFinite(Number(qtyRaw)) && Number(qtyRaw) > 0 ? Number(qtyRaw) : 1;
    const baseRemark = String(row.remarks || '').trim();
    const extra = [];
    if (location) extra.push(`Location: ${location}`);
    if (ticket_number) extra.push(`Ticket: ${ticket_number}`);
    if (condition && String(condition) !== String(status)) extra.push(`Condition: ${condition}`);
    if (quantity !== 1) extra.push(`Qty: ${quantity}`);
    const tail = extra.length ? extra.join(' | ') : '';
    const displayRemarks = [baseRemark, tail].filter(Boolean).join('\n') || '—';

    return {
      productName,
      model,
      serial_number,
      unique_id,
      brand,
      status,
      condition,
      location,
      ticket_number,
      quantity,
      remarks: displayRemarks,
      baseRemarks: baseRemark
    };
  });
};

module.exports = {
  normalizeGatePassAssets
};
