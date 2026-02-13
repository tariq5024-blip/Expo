const express = require('express');
const router = express.Router();
const Request = require('../models/Request');
const xlsx = require('xlsx');
const { protect, admin } = require('../middleware/authMiddleware');
const sendEmail = require('../utils/sendEmail');

router.post('/', protect, async (req, res) => {
  try {
    const { item_name, quantity, description, store } = req.body;
    const request = await Request.create({
      item_name,
      quantity,
      description,
      requester: req.user._id,
      store
    });

    // Notify admin on new request
    try {
      const adminRecipient = process.env.SMTP_EMAIL;
      await sendEmail({
        email: adminRecipient,
        subject: `New Technician Request - ${req.user?.name || 'Unknown'}`,
        html: `
          <div style="font-family: system-ui, Arial, sans-serif">
            <h2>New Request Submitted</h2>
            <p><strong>Technician:</strong> ${req.user?.name || '-'} (${req.user?.email || '-'})</p>
            <p><strong>Item:</strong> ${item_name}</p>
            <p><strong>Quantity:</strong> ${quantity}</p>
            <p><strong>Description:</strong> ${description || '-'}</p>
            <p><strong>Store:</strong> ${store || '-'}</p>
            <p style="color: #6b7280; font-size: 12px">Expo Stores</p>
          </div>
        `
      });
    } catch (mailErr) {
      // Silent fail, do not block API
    }

    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/', protect, admin, async (req, res) => {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (req.activeStore) filter.store = req.activeStore;
    
    let requests = await Request.find(filter)
      .populate('requester', 'name email phone username')
      .populate('store', 'name')
      .sort({ createdAt: -1 })
      .lean();
    if (q) {
      const rx = new RegExp(q, 'i');
      requests = requests.filter(r =>
        rx.test(r.requester?.name || '') ||
        rx.test(r.requester?.email || '') ||
        rx.test(r.requester?.phone || '') ||
        rx.test(r.requester?.username || '')
      );
    }
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', protect, admin, async (req, res) => {
  try {
    const request = await Request.findById(req.params.id).populate('requester', 'name email');
    if (!request) return res.status(404).json({ message: 'Request not found' });
    
    // Isolation Check
    if (req.activeStore && request.store && request.store.toString() !== req.activeStore.toString()) {
      return res.status(404).json({ message: 'Request not found' });
    }

    request.status = req.body.status || request.status;
    await request.save();

    // Notify technician on status change
    if (request.requester?.email) {
      try {
        await sendEmail({
          email: request.requester.email,
          subject: `Your Request Status Updated: ${request.status}`,
          html: `
            <div style="font-family: system-ui, Arial, sans-serif">
              <h2>Request Status Updated</h2>
              <p><strong>Item:</strong> ${request.item_name}</p>
              <p><strong>Quantity:</strong> ${request.quantity}</p>
              <p><strong>New Status:</strong> ${request.status}</p>
              <p style="color: #6b7280; font-size: 12px">Expo Stores</p>
            </div>
          `
        });
      } catch (mailErr) {
        // Silent fail
      }
    }

    res.json(request);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;

// Export requests to Excel
router.get('/export', protect, admin, async (req, res) => {
  try {
    const { status, q } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (req.activeStore) filter.store = req.activeStore;
    
    let requests = await Request.find(filter)
      .populate('requester', 'name email phone username')
      .populate('store', 'name')
      .sort({ updatedAt: -1 })
      .lean();
    if (q) {
      const rx = new RegExp(q, 'i');
      requests = requests.filter(r =>
        rx.test(r.requester?.name || '') ||
        rx.test(r.requester?.email || '') ||
        rx.test(r.requester?.phone || '') ||
        rx.test(r.requester?.username || '')
      );
    }
    const header = ['ITEM','QUANTITY','DESCRIPTION','STATUS','STORE','TECHNICIAN NAME','TECHNICIAN EMAIL','TECHNICIAN PHONE','TECHNICIAN USERNAME','CREATED AT','UPDATED AT'];
    const rows = requests.map(r => ([
      r.item_name,
      r.quantity,
      r.description || '',
      r.status,
      r.store ? r.store.name : '',
      r.requester ? r.requester.name : '',
      r.requester ? r.requester.email : '',
      r.requester ? (r.requester.phone || '') : '',
      r.requester ? (r.requester.username || '') : '',
      r.createdAt,
      r.updatedAt
    ]));
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 24 },{ wch: 10 },{ wch: 32 },{ wch: 12 },{ wch: 16 },{ wch: 22 },{ wch: 26 },{ wch: 18 },{ wch: 18 },{ wch: 22 },{ wch: 22 }];
    ws['!autofilter'] = { ref: 'A1:K1' };
    xlsx.utils.book_append_sheet(wb, ws, 'REQUESTS');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=REQUESTS_EXPORT.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Technician: list own requests
router.get('/mine', protect, async (req, res) => {
  try {
    const filter = { requester: req.user._id };
    if (req.activeStore) {
      filter.store = req.activeStore;
    }
    const my = await Request.find(filter)
      .populate('store', 'name')
      .sort({ updatedAt: -1 })
      .lean();
    res.json(my);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
