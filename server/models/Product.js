const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  image: { type: String, default: '' },
  children: [{ 
    name: { type: String, required: true, trim: true },
    image: { type: String, default: '' },
    children: [{ 
      name: { type: String, required: true, trim: true },
      image: { type: String, default: '' },
      children: [{
        name: { type: String, required: true, trim: true },
        image: { type: String, default: '' },
        children: []
      }]
    }]
  }],
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true
  }
}, { timestamps: true });

productSchema.index({ name: 1, store: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);
