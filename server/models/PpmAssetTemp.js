const mongoose = require('mongoose');

const ppmAssetTempSchema = new mongoose.Schema(
  {
    ppm_task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PpmTask', required: true, index: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    source: { type: String, enum: ['excel', 'manual'], default: 'manual' },
    unique_id: { type: String, default: '' },
    abs_code: { type: String, default: '' },
    name: { type: String, default: '' },
    model_number: { type: String, default: '' },
    serial_number: { type: String, default: '' },
    qr_code: { type: String, default: '' },
    rf_id: { type: String, default: '' },
    mac_address: { type: String, default: '' },
    location: { type: String, default: '' },
    ticket: { type: String, default: '' },
    manufacturer: { type: String, default: '' },
    status: { type: String, default: '' },
    maintenance_vendor: { type: String, default: '' }
  },
  { timestamps: true, collection: 'ppm_assets_temp' }
);

module.exports = mongoose.model('PpmAssetTemp', ppmAssetTempSchema);
