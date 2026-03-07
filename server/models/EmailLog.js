const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
  to: { type: String, required: true, index: true },
  subject: { type: String, default: '' },
  status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true, index: true },
  providerMessageId: { type: String, default: '' },
  reason: { type: String, default: '' },
  context: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('EmailLog', emailLogSchema);

