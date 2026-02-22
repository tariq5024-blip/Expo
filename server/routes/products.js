const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const { protect, admin } = require('../middleware/authMiddleware');
const Product = require('../models/Product');
const Asset = require('../models/Asset');

// Ensure uploads are placed under server/uploads relative to this file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});
const upload = multer({ storage });

async function resizeImage(filePath) {
  try {
    await sharp(filePath).resize(300, 300, { fit: 'inside' }).toFile(`${filePath}-resized`);
  } catch {}
}

function findInTree(list, id) {
  for (let i = 0; i < list.length; i++) {
    const node = list[i];
    if (node._id.toString() === id) {
      return { node, parentList: list, index: i };
    }
    if (node.children && node.children.length > 0) {
      const found = findInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

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
    const products = await Product.find(filter).sort({ name: 1 }).lean();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', protect, admin, upload.single('image'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    if (req.file) await resizeImage(req.file.path);
    const image = req.file ? `/uploads/${path.basename(req.file.path)}` : '';
    const query = { name: new RegExp(`^${name}$`, 'i') };
    if (req.activeStore) query.store = req.activeStore;
    const exists = await Product.findOne(query);
    if (exists) return res.status(400).json({ message: 'Product already exists' });
    const doc = await Product.create({ name, image, children: [], store: req.activeStore });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/:id/children', protect, admin, upload.single('image'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name is required' });
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Parent product not found' });
    if (req.file) await resizeImage(req.file.path);
    const image = req.file ? `/uploads/${req.file.filename}` : '';
    if (!product.children) product.children = [];
    if (product.children.some(c => String(c.name).toLowerCase() === String(name).toLowerCase())) {
      return res.status(400).json({ message: 'Child already exists' });
    }
    product.children.push({ name, image, children: [] });
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', protect, admin, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const { name } = req.body;
    const oldName = product.name;
    if (name) product.name = name;
    if (req.file) {
      await resizeImage(req.file.path);
      product.image = `/uploads/${path.basename(req.file.path)}`;
    }
    const updated = await product.save();
    // Update assets if name changed
    if (name) {
      await Asset.updateMany({ product_name: oldName }, { $set: { product_name: name } });
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const assetCount = await Asset.countDocuments({ product_name: product.name });
    if (assetCount > 0) {
      return res.status(400).json({ message: `Cannot delete. Used by ${assetCount} assets.` });
    }
    await product.deleteOne();
    res.json({ message: 'Product removed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/bulk-create', protect, admin, async (req, res) => {
  const { parentId, names } = req.body;
  if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ message: 'No product names provided' });
  try {
    let targetDoc;
    let rootDoc;
    if (parentId) {
      rootDoc = await Product.findById(parentId);
      if (!rootDoc) {
        const filter = {};
        if (req.activeStore) {
          filter.$or = [
            { store: req.activeStore },
            { store: null },
            { store: { $exists: false } }
          ];
        }
        const roots = await Product.find(filter);
        for (const r of roots) {
          const found = findInTree(r.children || [], String(parentId));
          if (found && found.node) {
            rootDoc = r;
            targetDoc = found.node;
            break;
          }
        }
      }
      if (!rootDoc) return res.status(404).json({ message: 'Parent product not found' });
      if (!targetDoc) targetDoc = rootDoc;

      if (!targetDoc.children) targetDoc.children = [];
    }
    const created = [];
    for (const n of names) {
      const name = String(n || '').trim();
      if (!name) continue;
      if (!parentId) {
        const exists = await Product.findOne({ name, store: req.activeStore });
        if (!exists) {
          const doc = await Product.create({ name, image: '', children: [], store: req.activeStore });
          created.push(doc);
        }
      } else if (targetDoc) {
        if (!targetDoc.children.some(c => String(c.name).toLowerCase() === name.toLowerCase())) {
          targetDoc.children.push({ name, image: '', children: [] });
        }
      }
    }
    if (parentId && rootDoc) {
      rootDoc.markModified('children');
      await rootDoc.save();
      return res.json({ message: 'Bulk children created', parent: rootDoc });
    }
    res.json({ message: `Created ${created.length} root products`, items: created });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
