const mongoose = require('mongoose');

const ppmHistoryLogSchema = new mongoose.Schema(
  {
    ppm_task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PpmTask', required: true, index: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    user: { type: String, default: '' },
    email: { type: String, default: '' },
    role: { type: String, default: '' },
    action: { type: String, required: true },
    comments: { type: String, default: '' },
    assets_included: { type: Number, default: 0 }
  },
  { timestamps: true, collection: 'ppm_history_logs' }
);

module.exports = mongoose.model('PpmHistoryLog', ppmHistoryLogSchema);
