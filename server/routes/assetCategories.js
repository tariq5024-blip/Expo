const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AssetCategory = require('../models/AssetCategory');
const Asset = require('../models/Asset');
const Store = require('../models/Store');
const { protect, admin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

// Helper to get store and its children IDs
async function getStoreIds(storeId) {
  if (!storeId) return [];
  const children = await Store.find({ parentStore: storeId }).select('_id');
  // Ensure all IDs are ObjectIds for aggregation matching
  return [storeId, ...children.map(c => c._id)].map(id => new mongoose.Types.ObjectId(id));
}

// Helper to resize image
const resizeImage = async (filePath) => {
  try {
    const buffer = await sharp(filePath)
      .resize(500, 500, {
        fit: 'cover',
        position: 'center'
      })
      .toBuffer();
    await fs.promises.writeFile(filePath, buffer);
  } catch (error) {
    console.error('Error resizing image:', error);
  }
};

// Configure multer for image upload
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(null, `product-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpg|jpeg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Images only!'));
    }
  },
});

// Helper to find product recursively
const findInTree = (list, id) => {
  for (let i = 0; i < list.length; i++) {
    if (list[i]._id.toString() === id) {
      return { product: list[i], parentList: list, index: i };
    }
    if (list[i].children && list[i].children.length > 0) {
      const found = findInTree(list[i].children, id);
      if (found) return found;
    }
  }
  return null;
};

// Helper to find category and product info
const findCategoryAndProduct = async (productId, activeStoreId) => {
  const filter = {};
  if (activeStoreId) {
    filter.$or = [
      { store: activeStoreId },
      { store: null },
      { store: { $exists: false } }
    ];
  }
  const categories = await AssetCategory.find(filter).lean();
  for (const cat of categories) {
    if (cat.types) {
      for (const type of cat.types) {
        if (type.products) {
          const result = findInTree(type.products, productId);
          if (result) {
            return { category: cat, type, ...result };
          }
        }
      }
    }
  }
  return null;
};

// @desc    Get all categories
// @route   GET /api/asset-categories
// @access  Private (Admin/Tech)
router.get('/', protect, async (req, res) => {
  try {
    const filter = {};
    if (req.activeStore) {
      filter.$or = [
        { store: req.activeStore },
        { store: null },
        { store: { $exists: false } }
      ];
    }
    const categories = await AssetCategory.find(filter).sort({ name: 1 }).lean();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Get products (Level 3+) with stats
// @route   GET /api/asset-categories/stats
// @access  Private (Admin/Tech)
router.get('/stats', protect, async (req, res) => {
  try {
    const filter = {};
    let targetStoreId = null;

    if (req.activeStore) {
      targetStoreId = req.activeStore;
    }
    
    // For categories, we might only want the main store ones?
    // But assets can be in child stores.
    // The previous code filtered categories by `req.activeStore`.
    // Let's assume categories are managed at the Parent Store level.
    if (targetStoreId) {
      filter.$or = [
        { store: targetStoreId },
        { store: null },
        { store: { $exists: false } }
      ];
    }

    console.log('STATS DEBUG: ActiveStore:', req.activeStore);
    console.log('STATS DEBUG: Filter:', JSON.stringify(filter));

    const categories = await AssetCategory.find(filter).sort({ name: 1 }).lean();
    console.log('STATS DEBUG: Categories found:', categories.length);
    
    // Flatten hierarchy to get all products (Level 3+)
    let allProducts = [];
    
    const traverse = (products, catName, typeName, catId, typeId, parentPath) => {
      products.forEach(prod => {
        const currentPath = `${parentPath} > ${prod.name}`;
        
        allProducts.push({
          _id: prod._id,
          name: prod.name,
          image: prod.image || '',
          categoryName: catName,
          typeName: typeName,
          categoryId: catId,
          typeId: typeId,
          path: currentPath,
          hierarchy: parentPath
        });
        
        if (prod.children && prod.children.length > 0) {
          traverse(prod.children, catName, typeName, catId, typeId, currentPath);
        }
      });
    };

    try {
      categories.forEach(cat => {
        if (cat.types && cat.types.length > 0) {
          cat.types.forEach(type => {
            if (type.products && type.products.length > 0) {
              traverse(type.products, cat.name, type.name, cat._id, type._id, `${cat.name} > ${type.name}`);
            }
          });
        }
      });
      console.log('STATS DEBUG: Products generated count:', allProducts.length);
    } catch (err) {
      console.error('STATS DEBUG: Traversal failed:', err);
    }

    // Asset Aggregation Filter (Include Child Stores)
    const assetMatch = {};
    if (targetStoreId) {
      console.log('STATS DEBUG: Getting store IDs for', targetStoreId);
      try {
        const storeIds = await getStoreIds(targetStoreId);
        console.log('STATS DEBUG: Store IDs count:', storeIds.length);
        assetMatch.store = { $in: storeIds };
      } catch (e) {
        console.error('STATS DEBUG: getStoreIds failed:', e);
        throw e;
      }
    }

    console.log('STATS DEBUG: Starting Aggregation');
    // Aggregation to get counts per product_name
    const stats = await Asset.aggregate([
      { $match: assetMatch },
      {
        $group: {
          _id: '$product_name',
          total: { $sum: 1 },
          disposed: { $sum: { $cond: [{ $eq: ['$status', 'Disposed'] }, 1, 0] } },
          faulty: { $sum: { $cond: [{ $eq: ['$status', 'Faulty'] }, 1, 0] } },
          underRepair: { $sum: { $cond: [{ $eq: ['$status', 'Under Repair'] }, 1, 0] } },
          inUse: { 
            $sum: { 
              $cond: [
                { 
                  $and: [
                    { $ne: ['$status', 'Disposed'] },
                    { $ne: ['$status', 'Faulty'] },
                    { $ne: ['$status', 'Under Repair'] },
                    { 
                      $or: [
                        { $ifNull: ['$assigned_to', false] }, 
                        { 
                          $and: [
                            { $ifNull: ['$assigned_to_external.name', false] },
                            { $ne: ['$assigned_to_external.name', ''] }
                          ]
                        },
                        { $eq: ['$status', 'In Use'] }
                      ]
                    }
                  ]
                }, 
                1, 
                0
              ] 
            } 
          }
        }
      }
    ]);

    // Map stats to a lookup object (Case-Insensitive Accumulation)
    const statsMap = {};
    stats.forEach(s => {
      if (s._id) {
        const key = String(s._id).toLowerCase();
        if (!statsMap[key]) {
          statsMap[key] = { ...s };
        } else {
          // Accumulate if multiple asset product_names map to same lowercase key
          statsMap[key].total += s.total;
          statsMap[key].disposed += s.disposed;
          statsMap[key].faulty += s.faulty;
          statsMap[key].underRepair += s.underRepair;
          statsMap[key].inUse += s.inUse;
        }
      }
    });

    // Combine products with stats
    const result = allProducts.map(prod => {
      const s = statsMap[String(prod.name).toLowerCase()] || { total: 0, inUse: 0, faulty: 0, underRepair: 0, disposed: 0 };
      const inStore = s.total - s.inUse - s.faulty - s.underRepair - s.disposed;
      
      return {
        ...prod,
        total: s.total,
        inUse: s.inUse,
        inStore: Math.max(0, inStore),
        faulty: s.faulty,
        underRepair: s.underRepair,
        disposed: s.disposed
      };
    });

    console.log('STATS DEBUG: Products returned:', result.length);
    const seen = new Set();
    const deduped = [];
    for (const item of result) {
      const key = String(item.name || '').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }
    res.json(deduped);
  } catch (err) {
    console.error('STATS DEBUG: Error in /stats:', err);
    res.status(500).json({ message: err.message });
  }
});

// @desc    Update specific product (Level 3+) image/name
// @route   PUT /api/asset-categories/products/:id
// @access  Private/Admin
router.put('/products/:id', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    const productId = req.params.id;
    
    const found = await findCategoryAndProduct(productId, req.activeStore);
    
    if (!found) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { category, type, product } = found;
    const oldName = product.name;

    if (name) {
      const conflict = type.products.some(p => p._id.toString() !== product._id.toString() && String(p.name).toLowerCase() === String(name).toLowerCase());
      if (conflict) {
        return res.status(400).json({ message: 'Product already exists in this type' });
      }
      product.name = name;
    }
    if (req.file) {
      await resizeImage(req.file.path);
      product.image = `/uploads/${req.file.filename}`;
    }

    await category.save();

    // If name changed, update assets
    if (name && oldName && name !== oldName) {
      const query = { product_name: oldName };
      if (category) query.category = category.name;
      if (type) query.product_type = type.name;

      await Asset.updateMany(
        query,
        { $set: { product_name: name } }
      );
    }

    res.json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// @desc    Delete specific product (Level 3+)
// @route   DELETE /api/asset-categories/products/:id
// @access  Private/Admin
router.delete('/products/:id', protect, admin, async (req, res) => {
  try {
    const productId = req.params.id;
    
    const found = await findCategoryAndProduct(productId, req.activeStore);
    
    if (!found) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const { category, type, product, parentList } = found;

    // Check dependencies
    const query = { product_name: product.name };
    if (category) query.category = category.name;
    if (type) query.product_type = type.name;
    if (category.store) query.store = category.store; // Scope dependency check to store

    const assetCount = await Asset.countDocuments(query);
    if (assetCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete product. It is used by ${assetCount} assets.` 
      });
    }

    // Remove product from parent list
    parentList.pull(productId);
    await category.save();

    res.json({ message: 'Product removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Add child to a product (Level 4+)
// @route   POST /api/asset-categories/products/:id/children
// @access  Private/Admin
router.post('/products/:id/children', protect, admin, upload.single('image'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });

  try {
    const productId = req.params.id;
    const found = await findCategoryAndProduct(productId, req.activeStore);
    
    if (!found) {
      return res.status(404).json({ message: 'Parent product not found' });
    }

    const { category, product } = found;
    
    // Check if child with same name exists
    if (product.children && product.children.some(c => String(c.name).toLowerCase() === String(name).toLowerCase())) {
      return res.status(400).json({ message: 'Child product already exists' });
    }

    if (req.file) {
      await resizeImage(req.file.path);
    }
    const image = req.file ? `/uploads/${req.file.filename}` : '';

    if (!product.children) product.children = [];
    product.children.push({ name, image, children: [] });
    
    await category.save();
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Create category with image
// @route   POST /api/asset-categories
// @access  Private/Admin
router.post('/', protect, admin, upload.single('image'), async (req, res) => {
  const { name } = req.body;
  
  if (req.file) {
    await resizeImage(req.file.path);
  }
  const image = req.file ? `/uploads/${req.file.filename}` : '';

  try {
    const query = {};
    if (req.activeStore) {
      query.store = req.activeStore;
    }
    query.name = new RegExp(`^${name}$`, 'i');
    const exists = await AssetCategory.findOne(query);
    if (exists) {
      return res.status(400).json({ message: 'Category already exists in this store' });
    }
    const category = await AssetCategory.create({ 
      name, 
      image, 
      types: [],
      store: req.activeStore 
    });
    res.status(201).json(category);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// @desc    Update category (name and/or image)
// @route   PUT /api/asset-categories/:id
// @access  Private/Admin
router.put('/:id', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    const category = await AssetCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (req.activeStore && category.store && category.store.toString() !== req.activeStore.toString()) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const oldName = category.name;

    if (name) {
      category.name = name;
    }

    if (req.file) {
      await resizeImage(req.file.path);
      category.image = `/uploads/${req.file.filename}`;
    }

    const updatedCategory = await category.save();

    // Update assets if name changed
    if (name && oldName !== name) {
      await Asset.updateMany(
        { category: oldName },
        { $set: { category: name } }
      );
    }

    res.json(updatedCategory);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// @desc    Delete category
// @route   DELETE /api/asset-categories/:id
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const category = await AssetCategory.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }
    
    // Check ownership if activeStore is set
    if (req.activeStore && category.store && category.store.toString() !== req.activeStore.toString()) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Check if any assets use this category
    const query = { category: category.name };
    if (category.store) query.store = category.store;
    
    const assetCount = await Asset.countDocuments(query);
    if (assetCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category. It contains ${assetCount} assets.` 
      });
    }

    await AssetCategory.deleteOne({ _id: category._id });
    res.json({ message: 'Category removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Add Type to Category
// @route   POST /api/asset-categories/:id/types
// @access  Private/Admin
router.post('/:id/types', protect, admin, async (req, res) => {
  const { name } = req.body;
  try {
    const category = await AssetCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    
    // Check ownership
    if (req.activeStore && category.store && category.store.toString() !== req.activeStore.toString()) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (category.types.some(t => String(t.name).toLowerCase() === String(name).toLowerCase())) {
      return res.status(400).json({ message: 'Type already exists in this category' });
    }
    
    category.types.push({ name, products: [] });
    await category.save();
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Add Product to Type
// @route   POST /api/asset-categories/:id/types/:typeName/products
// @access  Private/Admin
router.post('/:id/types/:typeName/products', protect, admin, async (req, res) => {
  const { name } = req.body;
  try {
    const category = await AssetCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    
    if (req.activeStore && category.store && category.store.toString() !== req.activeStore.toString()) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const type = category.types.find(t => t.name === req.params.typeName);
    if (!type) return res.status(404).json({ message: 'Type not found' });
    
    if (type.products.some(p => String(p.name).toLowerCase() === String(name).toLowerCase())) {
      return res.status(400).json({ message: 'Product already exists in this type' });
    }
    
    type.products.push({ name, image: '', children: [] });
    await category.save();
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
