const mongoose = require('mongoose');
const AssetCategory = require('./models/AssetCategory');
const Asset = require('./models/Asset');
const Store = require('./models/Store');
require('dotenv').config({path: './.env'});

async function getStoreIds(storeId) {
  if (!storeId) return [];
  const children = await Store.find({ parentStore: storeId }).select('_id');
  return [storeId, ...children.map(c => c._id)].map(id => new mongoose.Types.ObjectId(id));
}

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Simulate req.activeStore
    const targetStoreId = '698f3d54f3b42be907b647c9'; // SCY ASSET
    console.log('Target Store ID:', targetStoreId);

    const filter = {};
    if (targetStoreId) {
      filter.$or = [
        { store: targetStoreId },
        { store: null },
        { store: { $exists: false } }
      ];
    }
    
    console.log('Filter:', JSON.stringify(filter, null, 2));

    const categories = await AssetCategory.find(filter).sort({ name: 1 }).lean();
    console.log('Found Categories:', categories.length);
    if (categories.length > 0) {
        console.log('First Category Name:', categories[0].name);
    } else {
        // Debug: why none?
        console.log('Checking count of ALL categories...');
        const allCount = await AssetCategory.countDocuments({});
        console.log('Total Categories in DB:', allCount);
        
        // Check one category to see its store field
        const one = await AssetCategory.findOne({}).lean();
        console.log('One Category Store Field:', one.store);
    }

    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
