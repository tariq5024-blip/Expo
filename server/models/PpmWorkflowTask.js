const mongoose = require('mongoose');

const ppmWorkflowTaskSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    schedule_date: { type: Date, default: Date.now, index: true },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Modified'], default: 'Pending', index: true },
    manager_comment: { type: String, default: '' },
    sent_to_manager_at: { type: Date, default: null },
    approved_broadcast_at: { type: Date, default: null }
  },
  { timestamps: true, collection: 'ppm_tasks' }
);

module.exports = mongoose.model('PpmWorkflowTask', ppmWorkflowTaskSchema);
