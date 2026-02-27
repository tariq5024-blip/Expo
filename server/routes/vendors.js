const express = require('express');
const router = express.Router();
const Vendor = require('../models/Vendor');
const Store = require('../models/Store');
const { protect, admin, adminOrViewer } = require('../middleware/authMiddleware');

async function applyViewerStoreFilter(req, filter) {
  if (req.user?.role !== 'Viewer') {
    if (req.activeStore) {
      filter.store = req.activeStore;
    }
    return;
  }

  const scope = req.user.accessScope || 'All';
  if (scope === 'All') {
    if (req.activeStore) {
      filter.store = req.activeStore;
    }
    return;
  }

  const mainStores = await Store.find({
    isMainStore: true,
    name: { $regex: scope, $options: 'i' }
  }).select('_id').lean();

  const mainIds = mainStores.map(s => s._id);
  const childStores = await Store.find({ parentStore: { $in: mainIds } }).select('_id').lean();
  const allowedIds = [...mainIds, ...childStores.map(s => s._id)];

  if (req.activeStore) {
    const isAllowed = allowedIds.some(id => String(id) === String(req.activeStore));
    filter.store = isAllowed ? req.activeStore : { $in: [] };
  } else {
    filter.store = { $in: allowedIds };
  }
}

// @desc    Get all vendors
// @route   GET /api/vendors
// @access  Private/Admin
router.get('/', protect, adminOrViewer, async (req, res) => {
  try {
    const filter = {};
    await applyViewerStoreFilter(req, filter);
    const vendors = await Vendor.find(filter).sort({ createdAt: -1 }).lean();
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get single vendor
// @route   GET /api/vendors/:id
// @access  Private/Admin
router.get('/:id', protect, adminOrViewer, async (req, res) => {
  try {
    const filter = { _id: req.params.id };
    await applyViewerStoreFilter(req, filter);

    const vendor = await Vendor.findOne(filter).lean();
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a vendor
// @route   POST /api/vendors
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  try {
    const { name, taxId } = req.body;
    
    // Check for duplicates within the store context
    const query = { name };
    if (req.activeStore) {
      query.store = req.activeStore;
    }
    const nameExists = await Vendor.findOne(query);
    if (nameExists) {
      return res.status(400).json({ message: 'Vendor with this name already exists in this store' });
    }

    if (taxId) {
      const taxQuery = { taxId };
      if (req.activeStore) {
        taxQuery.store = req.activeStore;
      }
      const taxExists = await Vendor.findOne(taxQuery);
      if (taxExists) {
        return res.status(400).json({ message: 'Vendor with this Tax ID already exists in this store' });
      }
    }

    const vendor = await Vendor.create({
      ...req.body,
      store: req.activeStore // Bind to active store
    });
    res.status(201).json(vendor);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Update a vendor
// @route   PUT /api/vendors/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    // Check isolation
    if (req.activeStore && vendor.store && vendor.store.toString() !== req.activeStore.toString()) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    vendor.name = req.body.name || vendor.name;
    vendor.contactPerson = req.body.contactPerson || vendor.contactPerson;
    vendor.phone = req.body.phone || vendor.phone;
    vendor.email = req.body.email || vendor.email;
    vendor.address = req.body.address || vendor.address;
    vendor.taxId = req.body.taxId || vendor.taxId;
    vendor.paymentTerms = req.body.paymentTerms || vendor.paymentTerms;
    vendor.status = req.body.status || vendor.status;

    const updatedVendor = await vendor.save();
    res.json(updatedVendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Delete a vendor
// @route   DELETE /api/vendors/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);

    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    
    // Check isolation
    if (req.activeStore && vendor.store && vendor.store.toString() !== req.activeStore.toString()) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    await vendor.deleteOne();
    res.json({ message: 'Vendor removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
