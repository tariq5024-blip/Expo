const express = require('express');
const router = express.Router();
const UnregisteredAsset = require('../models/UnregisteredAsset');
const { protect, admin } = require('../middleware/authMiddleware');

const LOW_STOCK_THRESHOLD = 5;

// Technician portal: allow Admin, Super Admin, Viewer, Technician to view; only Admin to create/update/delete
const allowViewNoSerial = (req, res, next) => {
  if (req.user && ['Admin', 'Super Admin', 'Viewer', 'Technician'].includes(req.user.role)) return next();
  res.status(403).json({ message: 'Not authorized' });
};

const allowAdminOrTechnician = (req, res, next) => {
  if (req.user && (req.user.role === 'Admin' || req.user.role === 'Super Admin' || req.user.role === 'Technician')) return next();
  res.status(403).json({ message: 'Not authorized' });
};

// @desc    Get all unregistered (no-serial) assets with optional search and filters
// @route   GET /api/assets/no-serial
// @access  Private (Admin, Viewer, Technician)
router.get('/', protect, allowViewNoSerial, async (req, res) => {
  try {
    const { q, category, location } = req.query;
    const andConditions = [];

    if (req.activeStore) {
      andConditions.push({ $or: [{ store: req.activeStore }, { store: null }, { store: { $exists: false } }] });
    }

    if (q && String(q).trim()) {
      const term = String(q).trim();
      andConditions.push({
        $or: [
          { asset_name: { $regex: term, $options: 'i' } },
          { description: { $regex: term, $options: 'i' } },
          { category: { $regex: term, $options: 'i' } },
          { location: { $regex: term, $options: 'i' } }
        ]
      });
    }

    const filter = andConditions.length ? { $and: andConditions } : {};

    if (category && String(category).trim()) {
      filter.category = { $regex: String(category).trim(), $options: 'i' };
    }
    if (location && String(location).trim()) {
      filter.location = { $regex: String(location).trim(), $options: 'i' };
    }

    const assets = await UnregisteredAsset.find(filter)
      .populate('store', 'name')
      .sort({ asset_name: 1 })
      .lean();

    res.json(assets);
  } catch (error) {
    console.error('Error fetching no-serial assets:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create unregistered asset (or increase quantity if duplicate name)
// @route   POST /api/assets/no-serial
// @access  Private (Admin)
router.post('/', protect, admin, async (req, res) => {
  try {
    const { asset_name, description, category, location, quantity } = req.body;
    const name = asset_name ? String(asset_name).trim() : '';
    if (!name) {
      return res.status(400).json({ message: 'Asset name is required' });
    }

    const storeId = req.activeStore || null;
    const existing = await UnregisteredAsset.findOne({
      asset_name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      $or: [{ store: storeId }, { store: null }, { store: { $exists: false } }]
    });

    if (existing) {
      const addQty = Math.max(0, parseInt(quantity, 10) || 0);
      existing.quantity += addQty;
      await existing.save();
      return res.status(200).json({
        message: 'Quantity updated for existing asset',
        asset: await UnregisteredAsset.findById(existing._id).populate('store', 'name').lean()
      });
    }

    const qty = Math.max(0, parseInt(quantity, 10) || 0);
    const asset = await UnregisteredAsset.create({
      asset_name: name,
      description: description ? String(description).trim() : '',
      category: category ? String(category).trim() : '',
      location: location ? String(location).trim() : '',
      quantity: qty,
      store: storeId || undefined
    });

    res.status(201).json(await UnregisteredAsset.findById(asset._id).populate('store', 'name').lean());
  } catch (error) {
    console.error('Error creating no-serial asset:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update unregistered asset
// @route   PUT /api/assets/no-serial/:id
// @access  Private (Admin)
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const { asset_name, description, category, location, quantity } = req.body;
    const asset = await UnregisteredAsset.findById(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    if (asset_name !== undefined) asset.asset_name = String(asset_name).trim();
    if (description !== undefined) asset.description = String(description).trim();
    if (category !== undefined) asset.category = String(category).trim();
    if (location !== undefined) asset.location = String(location).trim();
    if (quantity !== undefined) asset.quantity = Math.max(0, parseInt(quantity, 10) || 0);
    await asset.save();

    res.json(await UnregisteredAsset.findById(asset._id).populate('store', 'name').lean());
  } catch (error) {
    console.error('Error updating no-serial asset:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete unregistered asset
// @route   DELETE /api/assets/no-serial/:id
// @access  Private (Admin)
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const asset = await UnregisteredAsset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Error deleting no-serial asset:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Consume quantity (add to inventory - decrease count, optional notes)
// @route   POST /api/assets/no-serial/:id/consume
// @access  Private (Admin, Technician)
router.post('/:id/consume', protect, allowAdminOrTechnician, async (req, res) => {
  try {
    const { quantity: consumeQty, notes } = req.body;
    const amount = Math.max(1, parseInt(consumeQty, 10) || 1);
    const asset = await UnregisteredAsset.findById(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Asset not found' });

    if (asset.quantity < amount) {
      return res.status(400).json({
        message: `Not enough quantity. Available: ${asset.quantity}, requested: ${amount}`
      });
    }

    asset.quantity -= amount;
    await asset.save();
    // Optional: log to activity or a separate consumption log; for now we just decrease.

    res.json({
      message: 'Quantity updated',
      asset: await UnregisteredAsset.findById(asset._id).populate('store', 'name').lean(),
      consumed: amount,
      notes: notes || undefined
    });
  } catch (error) {
    console.error('Error consuming no-serial asset:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get filter options (distinct category, location) for dropdowns
// @route   GET /api/assets/no-serial/filters
// @access  Private (Admin, Viewer, Technician)
router.get('/filters', protect, allowViewNoSerial, async (req, res) => {
  try {
    const filter = {};
    if (req.activeStore) {
      filter.$or = [{ store: req.activeStore }, { store: null }, { store: { $exists: false } }];
    }
    const [categories, locations] = await Promise.all([
      UnregisteredAsset.distinct('category', filter).then(arr => arr.filter(Boolean).sort()),
      UnregisteredAsset.distinct('location', filter).then(arr => arr.filter(Boolean).sort())
    ]);
    res.json({ categories, locations });
  } catch (error) {
    console.error('Error fetching no-serial filters:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
