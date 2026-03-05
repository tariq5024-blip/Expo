const mongoose = require('mongoose');

/**
 * Assets without serial numbers - used by technicians for bulk/unregistered items.
 * Tracks quantity; decreases when technicians "add to inventory" (consume).
 */
const unregisteredAssetSchema = new mongoose.Schema({
  asset_name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  location: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: false,
    index: true
  }
}, { timestamps: true });

// Compound index for duplicate check: same name + store (or both null)
unregisteredAssetSchema.index({ asset_name: 1, store: 1 }, { unique: false });

module.exports = mongoose.model('UnregisteredAsset', unregisteredAssetSchema);
