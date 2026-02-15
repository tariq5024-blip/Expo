const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const Asset = require('../models/Asset');
const mongoose = require('mongoose');
const { protect, admin } = require('../middleware/authMiddleware');

// @desc    Get all stores (with optional filtering)
// @route   GET /api/stores
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const filter = {};
    
    // Filter by isMainStore
    if (req.query.main === 'true') {
      filter.isMainStore = true;
    } else if (req.query.main === 'false') {
      filter.isMainStore = false;
    }

    // Filter by parentStore
    if (req.query.parent) {
      filter.parentStore = req.query.parent;
    }

    // Filter by deletionRequested
    if (req.query.deletionRequested === 'true') {
      filter.deletionRequested = true;
    }

    // Role-Based Filtering
    if (req.user.role !== 'Super Admin' && req.user.assignedStore) {
        // If user is restricted to a store, only show that store OR its children
        // But logic depends on what is being requested.
        // If requesting main stores (Portal), show only the assigned one.
        if (req.query.main === 'true') {
            filter._id = req.user.assignedStore;
        } 
        // If requesting children (Locations page), force parentStore to be assignedStore
        // (This prevents them from seeing other store's locations even if they try)
        else if (req.query.parent) {
             if (req.query.parent !== req.user.assignedStore.toString()) {
                 return res.json([]); // Not allowed to see other parents
             }
        }
        // If just requesting all stores generally (fallback)
        else {
             // Show assigned store OR children of assigned store
             // This is complex for a simple query.
             // Let's assume most queries are targeted.
             // If no specific query, maybe restrict to assigned store ID?
             // Or allow finding children of assigned store.
             // For safety, let's just force the scope.
             filter.$or = [
                 { _id: req.user.assignedStore },
                 { parentStore: req.user.assignedStore }
             ];
        }
    }

    // Sort by name for better UX
    let stores = await Store.find(filter).sort({ name: 1 }).lean();

    if (req.query.includeAssetTotals === 'true' && stores.length > 0) {
      const match = {};

      // Scope by parent store (main store) and its child locations
      let allowedStoreIds = [];
      if (req.query.parent) {
        const parentId = new mongoose.Types.ObjectId(req.query.parent);
        allowedStoreIds = [parentId, ...stores.map(s => s._id)];
      } else if (req.activeStore) {
        allowedStoreIds = [new mongoose.Types.ObjectId(req.activeStore)];
      }
      if (allowedStoreIds.length > 0) {
        match.store = { $in: allowedStoreIds };
      }

      const totals = await Asset.aggregate([
        { $match: match },
        {
          $project: {
            locLower: { $toLower: { $ifNull: ['$location', ''] } },
            statusLower: { $toLower: { $ifNull: ['$status', ''] } },
            condLower: { $toLower: { $ifNull: ['$condition', ''] } },
            assigned_to: 1,
            assigned_to_external: 1
          }
        },
        {
          $group: {
            _id: '$locLower',
            total: { $sum: 1 },
            disposed: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$statusLower', 'disposed'] },
                      { $eq: ['$condLower', 'disposed'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            installed: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $eq: ['$statusLower', 'in use'] },
                      { $ifNull: ['$assigned_to', false] },
                      {
                        $and: [
                          { $ifNull: ['$assigned_to_external.name', false] },
                          { $ne: ['$assigned_to_external.name', ''] }
                        ]
                      }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      const totalsMap = totals.reduce((acc, t) => {
        const total = t.total || 0;
        const disposed = t.disposed || 0;
        const installed = t.installed || 0;
        const available = Math.max(total - disposed - installed, 0);
        acc[String(t._id || '')] = available;
        return acc;
      }, {});

      stores = stores.map(s => ({
        ...s,
        availableAssetCount: totalsMap[String((s.name || '').toLowerCase())] || 0
      }));
    }

    res.json(stores);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a store (Location)
// @route   POST /api/stores
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  const { name, isMainStore, parentStore } = req.body;
  try {
    // Determine context from request
    let finalParentStore = parentStore;
    let finalIsMainStore = isMainStore || false;

    // RBAC & Isolation
    if (req.user.role !== 'Super Admin') {
      // Regular Admin cannot create Main Store
      finalIsMainStore = false;
      
      // Regular Admin MUST create under their assigned store
      if (req.user.assignedStore) {
        finalParentStore = req.user.assignedStore;
      } else {
        return res.status(403).json({ message: 'No assigned store found for Admin' });
      }
    } else {
      // Super Admin: if activeStore is set (e.g. via portal selection) and no parent specified, use it
      if (req.activeStore && !finalParentStore && !finalIsMainStore) {
          finalParentStore = req.activeStore;
      }
    }

    const store = await Store.create({ 
      name, 
      isMainStore: finalIsMainStore,
      parentStore: finalParentStore
    });
    res.status(201).json(store);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Update a store
// @route   PUT /api/stores/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (store) {
      // RBAC & Isolation
      if (req.user.role !== 'Super Admin') {
        // Can only edit their own assigned store OR children of their assigned store
        const isAssignedStore = req.user.assignedStore && store._id.toString() === req.user.assignedStore.toString();
        const isChildOfAssignedStore = req.user.assignedStore && store.parentStore?.toString() === req.user.assignedStore.toString();

        if (!isAssignedStore && !isChildOfAssignedStore) {
          return res.status(403).json({ message: 'Not authorized to update this store' });
        }

        // Prevent changing critical fields
        if (req.body.parentStore || req.body.isMainStore !== undefined) {
             // For safety, ignore these fields or throw error. Here we just ensure they aren't used.
             // (Logic below uses req.body directly, so we must be careful)
             // Let's explicitly block if they try to change structure
             if (req.body.parentStore && req.body.parentStore !== store.parentStore?.toString()) {
                return res.status(403).json({ message: 'Cannot move store to another parent' });
             }
        }
      }

      store.name = req.body.name || store.name;
      
      // Only allow structure changes if Super Admin
      if (req.user.role === 'Super Admin') {
        if (req.body.parentStore !== undefined) {
          store.parentStore = req.body.parentStore;
        }
        if (req.body.isMainStore !== undefined) {
          store.isMainStore = req.body.isMainStore;
        }
      }

      const updatedStore = await store.save();
      res.json(updatedStore);
    } else {
      res.status(404).json({ message: 'Store not found' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete a store
// @route   DELETE /api/stores/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (store) {
      // RBAC & Isolation
      if (req.user.role !== 'Super Admin') {
        // Prevent deleting Main Store
        if (store.isMainStore) {
            return res.status(403).json({ message: 'Cannot delete Main Store' });
        }
        
        // Prevent deleting their own assigned root store (The "Database")
        if (req.user.assignedStore && store._id.toString() === req.user.assignedStore.toString()) {
            return res.status(403).json({ message: 'Cannot delete your assigned root store. Please request a reset via Setup.' });
        }

        // Can only delete children of their assigned store
        const isChildOfAssignedStore = req.user.assignedStore && store.parentStore?.toString() === req.user.assignedStore.toString();

        if (!isChildOfAssignedStore) {
          return res.status(403).json({ message: 'Not authorized to delete this store' });
        }
      }

      await store.deleteOne();
      res.json({ message: 'Store removed' });
    } else {
      res.status(404).json({ message: 'Store not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
