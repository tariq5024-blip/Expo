const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  username: {
    type: String,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    default: ''
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['Super Admin', 'Admin', 'Technician', 'Viewer'],
    default: 'Technician',
    index: true
  },
  accessScope: {
    type: String,
    enum: ['All', 'SCY', 'NOC', 'IT'],
    default: 'All'
  },
  assignedStore: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true
  },
  notificationPreferences: {
    enabled: { type: Boolean, default: true },
    notifyReceiver: { type: Boolean, default: true },
    notifyIssuer: { type: Boolean, default: true },
    notifyLineManager: { type: Boolean, default: false }
  },
  /** Per-user Assets grid: { columns: [{ id, label, key, visible, builtin }] } */
  assetsTableColumnsConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
