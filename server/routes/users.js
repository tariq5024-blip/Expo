const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Store = require('../models/Store');
const bcrypt = require('bcryptjs');
const { protect, admin, superAdmin } = require('../middleware/authMiddleware');
const { sendStoreEmail, getStoreNotificationRecipients } = require('../utils/storeEmail');

const sendWelcomeEmail = async (userDoc) => {
  if (!userDoc?.email) return;
  try {
    const store = userDoc.assignedStore ? await Store.findById(userDoc.assignedStore).lean() : null;
    const storeName = store?.name || 'All Stores';
    const configuredRecipients = await getStoreNotificationRecipients(userDoc.assignedStore || null);
    const recipients = Array.from(
      new Set([userDoc.email, ...configuredRecipients].map((v) => String(v || '').trim().toLowerCase()).filter(Boolean))
    );
    await sendStoreEmail({
      storeId: userDoc.assignedStore || null,
      to: recipients.join(','),
      subject: 'Welcome to Expo IT Asset Management',
      text: `Hello ${userDoc.name}, your ${userDoc.role} account has been created for ${storeName}.`,
      html: `<p>Hello <strong>${userDoc.name}</strong>,</p><p>Your <strong>${userDoc.role}</strong> account has been created for <strong>${storeName}</strong>.</p><p>You can now log in to the Expo IT Asset Management portal.</p>`
    });
  } catch (error) {
    // Account creation should not fail if email service fails
    console.error('Welcome email error:', error.message);
  }
};

// @desc    Get all users (technicians)
// @route   GET /api/users
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const filter = { role: 'Technician' };
    
    // RBAC: If not Super Admin, filter by assigned store
    if (req.user.role !== 'Super Admin' && req.user.assignedStore) {
      filter.assignedStore = req.user.assignedStore;
    } else if (req.user.role === 'Super Admin' && req.activeStore) {
      // If Super Admin has selected a store context, filter by it
      filter.assignedStore = req.activeStore;
    }

    const users = await User.find(filter).populate('assignedStore').lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a technician
// @route   POST /api/users
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  const { name, username, email, phone, password, assignedStore } = req.body;

  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const payload = {
      name,
      username,
      email,
      phone,
      password: hashedPassword,
      role: 'Technician'
    };

    // RBAC: Assign store
    if (req.user.role === 'Super Admin') {
      if (assignedStore) payload.assignedStore = assignedStore;
    } else if (req.user.assignedStore) {
      // Regular Admin creates technician in their own store
      payload.assignedStore = req.user.assignedStore;
    }

    const user = await User.create(payload);

    if (user) {
      await sendWelcomeEmail(user);
      res.status(201).json({
        _id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role,
        assignedStore: user.assignedStore
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // RBAC: Check if admin has permission to delete this user
    if (req.user.role !== 'Super Admin') {
      if (user.role === 'Admin' || user.role === 'Super Admin') {
         return res.status(403).json({ message: 'Cannot delete admin users' });
      }
      if (req.user.assignedStore && user.assignedStore && 
          req.user.assignedStore.toString() !== user.assignedStore.toString()) {
        return res.status(403).json({ message: 'Not authorized to delete users from other stores' });
      }
    }

    await user.deleteOne();
    res.json({ message: 'User removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // RBAC Check
    if (req.user.role !== 'Super Admin') {
      // Allow editing SELF
      const isSelf = req.user._id.toString() === user._id.toString();

      if (!isSelf) {
        if (user.role === 'Admin' || user.role === 'Super Admin') {
          return res.status(403).json({ message: 'Cannot edit other admin users' });
        }
        if (req.user.assignedStore && user.assignedStore && 
            req.user.assignedStore.toString() !== user.assignedStore.toString()) {
          return res.status(403).json({ message: 'Not authorized to edit users from other stores' });
        }
      }
    }

    user.name = req.body.name || user.name;
    user.username = req.body.username || user.username;
    user.email = req.body.email || user.email;
    user.phone = req.body.phone || user.phone;
    
    if (req.body.password) {
       const salt = await bcrypt.genSalt(10);
       user.password = await bcrypt.hash(req.body.password, salt);
    }

    // Allow updating store only if Super Admin
    if (req.user.role === 'Super Admin') {
      if (req.body.assignedStore !== undefined) {
        user.assignedStore = req.body.assignedStore;
      }
      if (user.role === 'Viewer' && req.body.accessScope) {
        user.accessScope = req.body.accessScope;
      }
    }

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      accessScope: updatedUser.accessScope,
      assignedStore: updatedUser.assignedStore
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// ---------------- ADMIN MANAGEMENT (Super Admin Only) ----------------

// @desc    Get all admins
// @route   GET /api/users/admins
// @access  Private/SuperAdmin
router.get('/admins', protect, superAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'Admin' }).populate('assignedStore').lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create an admin
// @route   POST /api/users/admins
// @access  Private/SuperAdmin
router.post('/admins', protect, superAdmin, async (req, res) => {
  const { name, username, email, phone, password, assignedStore } = req.body;
  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const user = await User.create({
      name,
      username,
      email,
      phone,
      password: hashedPassword,
      role: 'Admin',
      assignedStore // Super Admin assigns the store
    });

    if (user) {
      await sendWelcomeEmail(user);
      res.status(201).json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedStore: user.assignedStore
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// ---------------- VIEWER MANAGEMENT (Super Admin Only) ----------------

// @desc    Get all viewers
// @route   GET /api/users/viewers
// @access  Private/SuperAdmin
router.get('/viewers', protect, superAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'Viewer' }).populate('assignedStore').lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Create a viewer
// @route   POST /api/users/viewers
// @access  Private/SuperAdmin
router.post('/viewers', protect, superAdmin, async (req, res) => {
  const { name, username, email, phone, password, accessScope } = req.body;
  try {
    const userExists = await User.findOne({ $or: [{ email }, { username }] });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    const user = await User.create({
      name,
      username,
      email,
      phone,
      password: hashedPassword,
      role: 'Viewer',
      accessScope: accessScope || 'All',
      assignedStore: null 
    });

    if (user) {
      await sendWelcomeEmail(user);
      res.status(201).json({
        _id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessScope: user.accessScope,
        assignedStore: user.assignedStore
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
