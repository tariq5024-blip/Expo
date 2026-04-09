import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const emptyForm = () => ({
  product_name: '',
  name: '',
  model_number: '',
  serial_number: '',
  abs_code: '',
  qr_code: '',
  rfid: '',
  mac_address: '',
  ip_address: '',
  ticket_number: '',
  manufacturer: '',
  maintenance_vendor: '',
  location: '',
  status: 'In Store',
  condition: 'New',
  store: ''
});

const formFromAsset = (a) => {
  if (!a) return emptyForm();
  const initialStatus = a.disposed ? 'Disposed' : (a.reserved ? 'Reserved' : (a.status || 'In Store'));
  const initialCondition = a.disposed ? 'Disposed' : (a.condition || 'New');
  const mv =
    String(a.maintenance_vendor || '').trim() ||
    String(a.customFields?.maintenance_vendor || '').trim();
  return {
    product_name: String(a.product_name || '').trim(),
    name: String(a.name || '').trim(),
    model_number: String(a.model_number || '').trim(),
    serial_number: String(a.serial_number || '').trim(),
    abs_code: String(a.abs_code || '').trim(),
    qr_code: String(a.qr_code || '').trim(),
    rfid: String(a.rfid || '').trim(),
    mac_address: String(a.mac_address || '').trim(),
    ip_address: String(a.ip_address || '').trim(),
    ticket_number: String(a.ticket_number || '').trim(),
    manufacturer: String(a.manufacturer || '').trim(),
    maintenance_vendor: mv,
    location: String(a.location || '').trim(),
    status: initialStatus,
    condition: initialCondition,
    store: String(a.store?._id || a.store || '')
  };
};

const normalizeChange = (name, value) => {
  if (
    [
      'status',
      'condition',
      'store',
      'location',
      'expo_tag',
      'abs_code',
      'product_number',
      'operating_system',
      'specification',
      'service_tag',
      'assign_to_department',
      'product_name',
      'maintenance_vendor'
    ].includes(name)
  ) {
    return value;
  }
  return typeof value === 'string' ? value.toUpperCase() : value;
};

/**
 * Compact asset editor opened from PPM work orders (same PUT as Assets, without assign / gate pass).
 */
export default function PpmInlineAssetEditModal({ open, assetId, onClose, onSaved }) {
  const { activeStore } = useAuth();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stores, setStores] = useState([]);
  const [asset, setAsset] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const handleField = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: normalizeChange(name, value) }));
  };

  const loadData = useCallback(async () => {
    const id = String(assetId || '').trim();
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return;
    setLoading(true);
    setAsset(null);
    try {
      const storesUrl = activeStore?._id ? `/stores?parent=${activeStore._id}` : '/stores';
      const [storesRes, assetRes] = await Promise.all([api.get(storesUrl), api.get(`/assets/${id}`)]);
      setStores(Array.isArray(storesRes.data) ? storesRes.data : []);
      const a = assetRes.data;
      setAsset(a);
      setForm(formFromAsset(a));
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Could not load asset');
      onCloseRef.current();
    } finally {
      setLoading(false);
    }
  }, [assetId, activeStore?._id]);

  useEffect(() => {
    if (!open || !assetId) return;
    loadData();
  }, [open, assetId, loadData]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleSave = async () => {
    if (!asset?._id || saving) return;
    setSaving(true);
    try {
      const customFieldsPayload = {
        ...(asset.customFields && typeof asset.customFields === 'object' ? { ...asset.customFields } : {}),
        maintenance_vendor: String(form.maintenance_vendor || '').trim()
      };

      const updateData = {
        ...form,
        product_name: form.product_name,
        customFields: customFieldsPayload
      };

      const markDisposed = form.status === 'Disposed' || form.condition === 'Disposed';
      const markReserved = form.status === 'Reserved';
      const markUnderRepair = form.status === 'Under Repair/Workshop';
      if (markDisposed) {
        updateData.disposed = true;
        updateData.reserved = false;
        updateData.status = 'In Store';
        updateData.condition = 'Faulty';
      } else if (asset.disposed) {
        updateData.disposed = false;
      }
      if (!markDisposed) {
        updateData.reserved = markReserved;
        if (markReserved) {
          updateData.status = 'In Store';
        }
        if (markUnderRepair) {
          updateData.status = 'Under Repair/Workshop';
          updateData.condition = 'Under Repair/Workshop';
        }
      }

      if (!updateData.store) {
        delete updateData.store;
      }

      await api.put(`/assets/${asset._id}`, updateData);
      alert('Asset updated');
      onSaved?.();
      onClose();
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ppm-inline-edit-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-200">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-white">
          <div>
            <h2 id="ppm-inline-edit-title" className="text-lg font-semibold text-slate-900">
              Edit asset
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Changes save to inventory immediately. For technician assignment or gate passes, use the full Assets editor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <p className="text-sm text-slate-600 py-8 text-center">Loading asset…</p>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700">
                <span className="text-slate-500 font-sans font-medium">Unique ID </span>
                {asset?.uniqueId || '—'}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Product name</label>
                  <input
                    name="product_name"
                    value={form.product_name}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Name / asset type</label>
                  <input name="name" value={form.name} onChange={handleField} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
                  <input
                    name="model_number"
                    value={form.model_number}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Serial</label>
                  <input
                    name="serial_number"
                    value={form.serial_number}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">ABS code</label>
                  <input name="abs_code" value={form.abs_code} onChange={handleField} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Ticket number</label>
                  <input
                    name="ticket_number"
                    value={form.ticket_number}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">QR code</label>
                  <input name="qr_code" value={form.qr_code} onChange={handleField} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">RF ID</label>
                  <input name="rfid" value={form.rfid} onChange={handleField} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">MAC address</label>
                  <input
                    name="mac_address"
                    value={form.mac_address}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">IP address</label>
                  <input
                    name="ip_address"
                    value={form.ip_address}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Manufacturer</label>
                  <input
                    name="manufacturer"
                    value={form.manufacturer}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Maintenance vendor</label>
                  <input
                    name="maintenance_vendor"
                    value={form.maintenance_vendor}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                  <select
                    name="location"
                    value={form.location}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Select location</option>
                    {stores.map((s) => (
                      <option key={s._id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Condition</label>
                  <select
                    name="condition"
                    value={form.condition}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="New">New</option>
                    <option value="Used">Used</option>
                    <option value="Faulty">Faulty</option>
                    <option value="Repaired">Repaired</option>
                    <option value="Under Repair/Workshop">Under Repair/Workshop</option>
                    <option value="Disposed">Disposed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleField}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="In Store">In Store</option>
                    <option value="In Use">In Use</option>
                    <option value="Missing">Missing</option>
                    <option value="Reserved">Reserved</option>
                    <option value="Disposed">Disposed</option>
                    <option value="Under Repair/Workshop">Under Repair/Workshop</option>
                  </select>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 justify-between border-t border-slate-200 pt-4">
                <Link
                  to={`/assets?edit=${encodeURIComponent(String(asset?._id || ''))}`}
                  className="text-sm text-indigo-700 hover:underline"
                  onClick={onClose}
                >
                  Open full editor in Assets →
                </Link>
                <div className="flex gap-2">
                  <button type="button" onClick={onClose} className="btn-app-outline-md text-[13px] font-semibold py-2 px-4">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="btn-app-primary-md text-[13px] font-semibold py-2 px-4 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
