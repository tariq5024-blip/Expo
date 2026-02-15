const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  model_number: { type: String, trim: true, default: '' },
  image: { type: String, default: '' }
});

productSchema.add({
  children: [productSchema]
});

const assetCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  image: {
    type: String, // Path to uploaded image
    default: ''
  },
  types: [{
    name: { type: String, required: true },
    products: [productSchema]
  }],
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true
  }
}, { timestamps: true });

// Compound index for store-scoped uniqueness
assetCategorySchema.index({ name: 1, store: 1 }, { unique: true });

module.exports = mongoose.model('AssetCategory', assetCategorySchema);
