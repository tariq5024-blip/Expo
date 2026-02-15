const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Asset = require('../models/Asset');
const Store = require('../models/Store');
const Request = require('../models/Request');
const ActivityLog = require('../models/ActivityLog');
const PurchaseOrder = require('../models/PurchaseOrder');
const Vendor = require('../models/Vendor');
const Pass = require('../models/Pass');
const Permit = require('../models/Permit');
const AssetCategory = require('../models/AssetCategory');
const bcrypt = require('bcryptjs');
const { backupDatabase } = require('../backup_db');

const upload = multer({ storage: multer.memoryStorage() });

// Simple in-process lock to prevent concurrent resets
let RESET_LOCK = false;

// Helper to get directory size
const getDirSize = (dirPath) => {
  let size = 0;
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stats.size;
      }
    });
  }
  return size;
};

// @desc    Get system storage stats
// @route   GET /api/system/storage
// @access  Private/Admin
router.get('/storage', protect, admin, async (req, res) => {
  try {
    const dbStats = await mongoose.connection.db.stats();
    const dbSize = dbStats.dataSize || 0;
    
    const uploadsPath = path.join(__dirname, '../uploads');
    const uploadsSize = getDirSize(uploadsPath);
    
    const usedBytes = dbSize + uploadsSize;
    const limitBytes = 512 * 1024 * 1024; // 512 MB limit
    const percentUsed = Math.min(Math.round((usedBytes / limitBytes) * 100), 100);
    
    res.json({
      usedBytes,
      limitBytes,
      percentUsed
    });
  } catch (error) {
    console.error('Error fetching storage stats:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Trigger database backup
// @route   POST /api/system/backup
// @access  Private/Admin
router.post('/backup', protect, admin, async (req, res) => {
  try {
    const backupDir = await backupDatabase();
    res.json({ message: 'Backup completed successfully', path: backupDir });
  } catch (error) {
    console.error('Error running backup:', error);
    res.status(500).json({ message: error.message || 'Backup failed' });
  }
});

// @desc    Download full backup as JSON file
// @route   GET /api/system/backup-file
// @access  Private/SuperAdmin
router.get('/backup-file', protect, superAdmin, async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const [
      users,
      stores,
      assets,
      requests,
      activityLogs,
      purchaseOrders,
      vendors,
      passes,
      permits,
      assetCategories
    ] = await Promise.all([
      User.find({}).lean(),
      Store.find({}).lean(),
      Asset.find({}).lean(),
      Request.find({}).lean(),
      ActivityLog.find({}).lean(),
      PurchaseOrder.find({}).lean(),
      Vendor.find({}).lean(),
      Pass.find({}).lean(),
      Permit.find({}).lean(),
      AssetCategory.find({}).lean()
    ]);

    const payload = {
      meta: {
        createdAt: new Date().toISOString(),
        version: 1
      },
      collections: {
        users,
        stores,
        assets,
        requests,
        activityLogs,
        purchaseOrders,
        vendors,
        passes,
        permits,
        assetCategories
      }
    };

    const json = JSON.stringify(payload, null, 2);
    const fileName = `expo-backup-${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(json);
  } catch (error) {
    console.error('Error generating backup file:', error);
    res.status(500).json({ message: error.message || 'Failed to generate backup file' });
  }
});

// @desc    Restore database from uploaded backup file
// @route   POST /api/system/restore-from-file
// @access  Private/SuperAdmin
router.post('/restore-from-file', protect, superAdmin, upload.single('backup'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Backup file is required' });
  }

  try {
    const content = req.file.buffer.toString('utf8');
    const payload = JSON.parse(content);
    const collections = payload.collections || {};

    await User.deleteMany({});
    await Store.deleteMany({});
    await Asset.deleteMany({});
    await Request.deleteMany({});
    await ActivityLog.deleteMany({});
    await PurchaseOrder.deleteMany({});
    await Vendor.deleteMany({});
    await Pass.deleteMany({});
    await Permit.deleteMany({});
    await AssetCategory.deleteMany({});

    if (collections.users?.length) await User.insertMany(collections.users, { ordered: false });
    if (collections.stores?.length) await Store.insertMany(collections.stores, { ordered: false });
    if (collections.assets?.length) await Asset.insertMany(collections.assets, { ordered: false });
    if (collections.requests?.length) await Request.insertMany(collections.requests, { ordered: false });
    if (collections.activityLogs?.length) await ActivityLog.insertMany(collections.activityLogs, { ordered: false });
    if (collections.purchaseOrders?.length) await PurchaseOrder.insertMany(collections.purchaseOrders, { ordered: false });
    if (collections.vendors?.length) await Vendor.insertMany(collections.vendors, { ordered: false });
    if (collections.passes?.length) await Pass.insertMany(collections.passes, { ordered: false });
    if (collections.permits?.length) await Permit.insertMany(collections.permits, { ordered: false });
    if (collections.assetCategories?.length) await AssetCategory.insertMany(collections.assetCategories, { ordered: false });

    res.json({ message: 'Restore completed successfully' });
  } catch (error) {
    console.error('Error restoring from backup file:', error);
    res.status(500).json({ message: error.message || 'Failed to restore from backup file' });
  }
});

// @desc    Request database reset (Store Admin)
// @route   POST /api/system/request-reset
// @access  Private/Admin
router.post('/request-reset', protect, admin, async (req, res) => {
  try {
    // If Super Admin, they can just use /reset. This is for Store Admins.
    if (req.user.role === 'Super Admin') {
      return res.status(400).json({ message: 'Super Admin should use the main reset function.' });
    }

    if (!req.user.assignedStore) {
      return res.status(400).json({ message: 'No assigned store found for this admin.' });
    }

    const store = await Store.findById(req.user.assignedStore);
    if (!store) {
      return res.status(404).json({ message: 'Store not found.' });
    }

    store.deletionRequested = true;
    store.deletionRequestedAt = new Date();
    store.deletionRequestedBy = `${req.user.name} (${req.user.email})`;
    await store.save();

    // Log the request
    await ActivityLog.create({
      user: req.user.name,
      email: req.user.email,
      role: req.user.role,
      action: 'System Reset Request',
      details: `Deletion requested for Store: ${store.name}`,
      store: store._id
    });

    res.json({ message: 'Deletion request submitted to Super Admin.' });
  } catch (error) {
    console.error('Error requesting reset:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reset database (keep users)
// @route   POST /api/system/reset
// @access  Private/SuperAdmin
router.post('/reset', protect, superAdmin, async (req, res) => {
  const { password, storeId, includeUsers } = req.body;
  
  if (!password) {
    return res.status(400).json({ message: 'Password is required' });
  }

  try {
    if (RESET_LOCK) {
      return res.status(429).json({ message: 'Another reset is in progress. Please wait and try again.' });
    }
    RESET_LOCK = true;

    // Verify admin password
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    // Safety Check: Require explicit storeId
    if (!storeId) {
      return res.status(400).json({ message: 'Safety Error: storeId is required. Use "all" for full reset.' });
    }

    let filter = {};
    let resetScope = "Full System";

    if (storeId !== 'all') {
      filter = { store: storeId };
      resetScope = `Store: ${storeId}`;
    }
    // If storeId === 'all', filter remains {} (Delete All)

    // Handle User Deletion if requested
    if (includeUsers) {
      const userFilter = { ...filter };
      // NEVER delete Super Admin accounts
      userFilter.role = { $ne: 'Super Admin' };
      
      // If specific store reset, we target users assigned to that store
      if (storeId !== 'all') {
        userFilter.assignedStore = storeId;
      }

      await User.deleteMany(userFilter);
    }

    // Clear collections
    // NOTE: We intentionally preserve 'User' (Admins/Technicians), 'Store' (Definitions), and 'AssetCategory' (Configuration)
    // as per requirements to only delete "operational/transactional" data.
    // Delete sequentially to reduce transient failures
    const deleted = {};
    deleted.assets = await Asset.deleteMany(filter);
    deleted.requests = await Request.deleteMany(filter);
    deleted.activityLogs = await ActivityLog.deleteMany(filter);
    deleted.purchaseOrders = await PurchaseOrder.deleteMany(filter);
    deleted.vendors = await Vendor.deleteMany(filter);
    deleted.passes = await Pass.deleteMany(filter);
    deleted.permits = await Permit.deleteMany(filter);

    // Reset deletionRequested flag if a specific store was reset
    if (storeId && storeId !== 'all') {
      await Store.findByIdAndUpdate(storeId, { 
        deletionRequested: false, 
        deletionRequestedAt: null,
        deletionRequestedBy: null
      });
    }

    // Optional: Clear uploads folder except .gitkeep
    // Only if full reset? Or if we track file ownership by store?
    // Currently file ownership isn't strictly tracked by store in filesystem structure, 
    // but referenced in DB.
    // If we delete DB records, files become orphans.
    // For specific store reset, cleaning files is hard without scanning all records.
    // Let's skip file cleanup for store-specific reset to be safe, 
    // or only do it for full reset.
    if (!storeId || storeId === 'all') {
        const uploadsPath = path.join(__dirname, '../uploads');
        if (fs.existsSync(uploadsPath)) {
          const files = fs.readdirSync(uploadsPath);
          files.forEach(file => {
            if (file !== '.gitkeep') {
              try {
                fs.unlinkSync(path.join(uploadsPath, file));
              } catch (e) {
                // Ignore file deletion errors to avoid aborting reset
              }
            }
          });
        }
    }

    // Log this action (create new log)
    // If we just deleted logs for this store, this new log will start the history again.
    await ActivityLog.create({
      user: req.user.name,
      email: req.user.email,
      role: req.user.role,
      action: 'System Reset',
      details: `${resetScope} reset performed (${includeUsers ? 'Users DELETED' : 'Users preserved'})`,
      store: storeId && storeId !== 'all' ? storeId : null
    });

    res.json({ 
      message: 'System reset successful',
      stats: {
        scope: resetScope,
        usersDeleted: includeUsers ? 'Yes' : 'No',
        assetsDeleted: deleted.assets?.deletedCount ?? 0,
        requestsDeleted: deleted.requests?.deletedCount ?? 0,
        logsDeleted: deleted.activityLogs?.deletedCount ?? 0,
        purchaseOrdersDeleted: deleted.purchaseOrders?.deletedCount ?? 0,
        vendorsDeleted: deleted.vendors?.deletedCount ?? 0,
        passesDeleted: deleted.passes?.deletedCount ?? 0,
        permitsDeleted: deleted.permits?.deletedCount ?? 0
      }
    });
  } catch (error) {
    console.error('Error resetting system:', error);
    res.status(500).json({ message: error.message });
  } finally {
    RESET_LOCK = false;
  }
});

// @desc    Cancel database reset request (Super Admin)
// @route   POST /api/system/cancel-reset
// @access  Private/SuperAdmin
router.post('/cancel-reset', protect, superAdmin, async (req, res) => {
  const { storeId } = req.body;
  
  if (!storeId) {
    return res.status(400).json({ message: 'Store ID is required' });
  }

  try {
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    store.deletionRequested = false;
    store.deletionRequestedAt = null;
    await store.save();

    await ActivityLog.create({
      user: req.user.name,
      email: req.user.email,
      role: req.user.role,
      action: 'System Reset Cancelled',
      details: `Deletion request rejected/cancelled for Store: ${store.name}`,
      store: store._id
    });

    res.json({ message: 'Reset request cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling reset:', error);
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all stores
// @route   GET /api/system/stores
// @access  Private
router.get('/stores', protect, async (req, res) => {
  try {
    const stores = await Store.find({});
    res.json(stores);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Seed default stores
// @route   POST /api/system/seed
// @access  Private/SuperAdmin
router.post('/seed', protect, superAdmin, async (req, res) => {
  try {
    const storesData = [
      { name: 'SCY ASSET', alias: 'scy' },
      { name: 'IT ASSET', alias: 'it' },
      { name: 'NOC ASSET', alias: 'noc' }
    ];

    const results = [];

    for (const data of storesData) {
      let store = await Store.findOne({ name: data.name });
      if (!store) {
        store = await Store.create({ 
            name: data.name, 
            isMainStore: true
        });
        results.push(`Created: ${store.name}`);
      } else {
        if (!store.isMainStore) {
            store.isMainStore = true;
            await store.save();
            results.push(`Updated (set Main): ${store.name}`);
        } else {
            results.push(`Exists: ${store.name}`);
        }
      }
    }

    res.json({ message: 'Seeding complete', results });
  } catch (error) {
    console.error('Seeding error:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
