const mongoose = require('mongoose');
const AssetCategory = require('./models/AssetCategory');
require('dotenv').config({path: './.env'});

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Simulate req.activeStore
    const targetStoreId = '698f3d54f3b42be907b647c9'; // SCY ASSET

    const filter = {};
    if (targetStoreId) {
      filter.$or = [
        { store: targetStoreId },
        { store: null },
        { store: { $exists: false } }
      ];
    }
    
    const categories = await AssetCategory.find(filter).sort({ name: 1 }).lean();
    console.log('Found Categories:', categories.length);
    
    let allProducts = [];
    
    const traverse = (products, catName, typeName, catId, typeId, parentPath) => {
      products.forEach(prod => {
        const currentPath = `${parentPath} > ${prod.name}`;
        allProducts.push({
          _id: prod._id,
          name: prod.name,
          categoryName: catName,
          typeName: typeName,
          path: currentPath
        });
        if (prod.children && prod.children.length > 0) {
          traverse(prod.children, catName, typeName, catId, typeId, currentPath);
        }
      });
    };

    categories.forEach(cat => {
      if (cat.types && cat.types.length > 0) {
        cat.types.forEach(type => {
          if (type.products && type.products.length > 0) {
            traverse(type.products, cat.name, type.name, cat._id, type._id, `${cat.name} > ${type.name}`);
          }
        });
      }
    });

    console.log('Total Products Generated:', allProducts.length);
    if (allProducts.length > 0) {
        console.log('First 3 Products:', allProducts.slice(0, 3));
    }

    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
