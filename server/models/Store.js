const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  isMainStore: {
    type: Boolean,
    default: false,
    index: true
  },
  parentStore: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    default: null,
    index: true
  },
  deletionRequested: {
    type: Boolean,
    default: false
  },
  deletionRequestedAt: {
    type: Date
  },
  deletionRequestedBy: {
    type: String, // Store email or name of requester
    default: null
  },
  emailConfig: {
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
    encryption: { type: String, enum: ['TLS', 'SSL'], default: 'TLS' },
    fromEmail: { type: String, default: '' },
    fromName: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null }
  }
}, { timestamps: true });

module.exports = mongoose.model('Store', storeSchema);
