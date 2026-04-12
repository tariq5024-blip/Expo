const mongoose = require('mongoose');
const Store = require('../models/Store');

/**
 * Active store plus every descendant Locations row (any depth under parentStore).
 * Used for RBAC so assets/spares under nested sites (e.g. Main › … › Mobility cabin) match the main store context.
 */
async function getStoreTreeIds(rootStoreId) {
  if (!rootStoreId || !mongoose.Types.ObjectId.isValid(String(rootStoreId))) return [];
  const root = new mongoose.Types.ObjectId(String(rootStoreId));
  const seen = new Set([String(root)]);
  let frontier = [root];
  while (frontier.length > 0) {
    const children = await Store.find({ parentStore: { $in: frontier } }).select('_id').lean();
    frontier = [];
    for (const c of children) {
      const sid = String(c._id);
      if (!seen.has(sid)) {
        seen.add(sid);
        frontier.push(c._id);
      }
    }
  }
  return Array.from(seen).map((id) => new mongoose.Types.ObjectId(id));
}

module.exports = { getStoreTreeIds };
