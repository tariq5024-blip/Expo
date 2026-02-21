const User = require('../models/User');
const Session = require('../models/Session');

const protect = async (req, res, next) => {
  try {
    const sid = req.cookies?.sid;

    if (!sid) {
      return res.status(401).json({ message: 'Not authorized, no session' });
    }

    const now = new Date();
    const session = await Session.findOne({ sid, expiresAt: { $gt: now } }).lean();
    if (!session) {
      return res.status(401).json({ message: 'Session expired or invalid' });
    }
    req.user = await User.findById(session.user).select('-password');
    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (req.user.role === 'Super Admin') {
      const activeStoreId = req.headers['x-active-store'];
      if (activeStoreId && activeStoreId !== 'undefined' && activeStoreId !== 'null' && activeStoreId !== 'all') {
        req.activeStore = activeStoreId;
      }
    } else if (req.user.assignedStore) {
      req.activeStore = req.user.assignedStore.toString();
    }
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: 'Not authorized' });
  }
};

const admin = (req, res, next) => {
  if (req.user && (req.user.role === 'Admin' || req.user.role === 'Super Admin')) {
    next();
  } else {
    res.status(401).json({ message: 'Not authorized as an admin' });
  }
};

const superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'Super Admin') {
    next();
  } else {
    res.status(401).json({ message: 'Not authorized as a super admin' });
  }
};

module.exports = { protect, admin, superAdmin };
