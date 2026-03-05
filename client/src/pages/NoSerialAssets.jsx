import { useEffect, useState, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Box, Search, Plus, Package, Edit2, Trash2, AlertTriangle } from 'lucide-react';

const LOW_STOCK_THRESHOLD = 5;
const DEBOUNCE_MS = 300;

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

const NoSerialAssets = () => {
  const { user } = useAuth();
  const [assets, setAssets] = useState([]);
  const [filters, setFilters] = useState({ categories: [], locations: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const debouncedSearch = useDebounce(search, DEBOUNCE_MS);

  const [consumeModal, setConsumeModal] = useState(null);
  const [consumeQty, setConsumeQty] = useState(1);
  const [consumeNotes, setConsumeNotes] = useState('');
  const [consumeLoading, setConsumeLoading] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ asset_name: '', description: '', category: '', location: '', quantity: 0 });
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  const fetchFilters = useCallback(async () => {
    try {
      const res = await api.get('/assets/no-serial/filters');
      setFilters(res.data || { categories: [], locations: [] });
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (debouncedSearch) params.q = debouncedSearch;
      if (categoryFilter) params.category = categoryFilter;
      if (locationFilter) params.location = locationFilter;
      const res = await api.get('/assets/no-serial', { params });
      setAssets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, categoryFilter, locationFilter]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const isAdmin = user?.role === 'Admin' || user?.role === 'Super Admin';

  const handleConsume = async () => {
    if (!consumeModal || consumeQty < 1) return;
    setConsumeLoading(true);
    try {
      await api.post(`/assets/no-serial/${consumeModal._id}/consume`, {
        quantity: Math.max(1, parseInt(consumeQty, 10) || 1),
        notes: consumeNotes || undefined
      });
      setConsumeModal(null);
      setConsumeQty(1);
      setConsumeNotes('');
      fetchAssets();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update quantity');
    } finally {
      setConsumeLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.asset_name?.trim()) return;
    setAddLoading(true);
    try {
      await api.post('/assets/no-serial', {
        asset_name: addForm.asset_name.trim(),
        description: addForm.description?.trim() || '',
        category: addForm.category?.trim() || '',
        location: addForm.location?.trim() || '',
        quantity: Math.max(0, parseInt(addForm.quantity, 10) || 0)
      });
      setShowAddForm(false);
      setAddForm({ asset_name: '', description: '', category: '', location: '', quantity: 0 });
      fetchAssets();
      fetchFilters();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add asset');
    } finally {
      setAddLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingId || !editForm) return;
    setEditLoading(true);
    try {
      await api.put(`/assets/no-serial/${editingId}`, editForm);
      setEditingId(null);
      setEditForm(null);
      fetchAssets();
      fetchFilters();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this unregistered asset?')) return;
    try {
      await api.delete(`/assets/no-serial/${id}`);
      fetchAssets();
      fetchFilters();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const openConsumeModal = (asset) => {
    setConsumeModal(asset);
    setConsumeQty(1);
    setConsumeNotes('');
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Package size={28} className="text-amber-500" />
          Assets Without Serial Numbers
        </h1>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-lg shadow-sm transition-colors"
          >
            <Plus size={20} />
            Add Asset
          </button>
        )}
      </div>

      {/* Search and filters */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2 relative">
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, description, category, location..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
          >
            <option value="">All categories</option>
            {(filters.categories || []).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
          >
            <option value="">All locations</option>
            {(filters.locations || []).map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {assets.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Box size={48} className="mx-auto mb-3 text-slate-300" />
              <p>No unregistered assets found.</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-3 text-amber-600 hover:underline font-medium"
                >
                  Add the first asset
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assets.map((a) => (
                      <tr key={a._id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-900">{a.asset_name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">{a.description || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{a.category || '—'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{a.location || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${a.quantity < LOW_STOCK_THRESHOLD ? 'text-red-600' : 'text-slate-900'}`}>
                            {a.quantity}
                          </span>
                          {a.quantity < LOW_STOCK_THRESHOLD && a.quantity > 0 && (
                            <span className="ml-1 inline-flex items-center text-amber-600" title="Low stock">
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openConsumeModal(a)}
                              disabled={a.quantity < 1}
                              className="px-3 py-1.5 text-sm font-medium bg-amber-500 text-black rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Add to inventory
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingId(a._id);
                                    setEditForm({
                                      asset_name: a.asset_name,
                                      description: a.description || '',
                                      category: a.category || '',
                                      location: a.location || '',
                                      quantity: a.quantity
                                    });
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                                  title="Edit"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(a._id)}
                                  className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {assets.map((a) => (
                  <div key={a._id} className="p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-semibold text-slate-900">{a.asset_name}</h3>
                        {a.description && <p className="text-sm text-slate-600 mt-0.5 line-clamp-2">{a.description}</p>}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {a.category && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{a.category}</span>}
                          {a.location && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{a.location}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`font-semibold ${a.quantity < LOW_STOCK_THRESHOLD ? 'text-red-600' : 'text-slate-900'}`}>
                          Qty: {a.quantity}
                        </span>
                        {a.quantity < LOW_STOCK_THRESHOLD && a.quantity > 0 && (
                          <span className="text-amber-600 flex items-center gap-0.5 text-xs">
                            <AlertTriangle size={12} /> Low stock
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => openConsumeModal(a)}
                          disabled={a.quantity < 1}
                          className="px-3 py-1.5 text-sm font-medium bg-amber-500 text-black rounded-lg hover:bg-amber-600 disabled:opacity-50"
                        >
                          Add to inventory
                        </button>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(a._id);
                                setEditForm({
                                  asset_name: a.asset_name,
                                  description: a.description || '',
                                  category: a.category || '',
                                  location: a.location || '',
                                  quantity: a.quantity
                                });
                              }}
                              className="p-1.5 text-slate-500 hover:text-amber-600 rounded"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button type="button" onClick={() => handleDelete(a._id)} className="p-1.5 text-slate-500 hover:text-red-600 rounded">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Consume modal */}
      {consumeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !consumeLoading && setConsumeModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Add to inventory</h3>
            <p className="text-sm text-slate-600 mb-4">
              <strong>{consumeModal.asset_name}</strong> — Available: {consumeModal.quantity}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={consumeModal.quantity}
                  value={consumeQty}
                  onChange={(e) => setConsumeQty(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea
                  value={consumeNotes}
                  onChange={(e) => setConsumeNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  placeholder="e.g. issued to technician, job ref..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => !consumeLoading && setConsumeModal(null)}
                className="flex-1 py-2 border border-slate-300 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConsume}
                disabled={consumeLoading || consumeQty < 1 || consumeQty > consumeModal.quantity}
                className="flex-1 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {consumeLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add asset modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !addLoading && setShowAddForm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Add unregistered asset</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Asset name *</label>
                <input
                  type="text"
                  value={addForm.asset_name}
                  onChange={(e) => setAddForm((f) => ({ ...f, asset_name: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={addForm.description}
                  onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input
                  type="text"
                  value={addForm.category}
                  onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                  list="add-categories"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <datalist id="add-categories">
                  {(filters.categories || []).map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  value={addForm.location}
                  onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))}
                  list="add-locations"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <datalist id="add-locations">
                  {(filters.locations || []).map((loc) => <option key={loc} value={loc} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Initial quantity</label>
                <input
                  type="number"
                  min={0}
                  value={addForm.quantity}
                  onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <p className="text-xs text-slate-500">If an asset with the same name exists, quantity will be added to it.</p>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => !addLoading && setShowAddForm(false)}
                  className="flex-1 py-2 border border-slate-300 rounded-lg font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" disabled={addLoading || !addForm.asset_name?.trim()} className="flex-1 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  {addLoading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingId && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !editLoading && (setEditingId(null), setEditForm(null))}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Edit asset</h3>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Asset name *</label>
                <input
                  type="text"
                  value={editForm.asset_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, asset_name: e.target.value }))}
                  required
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input
                  type="text"
                  value={editForm.category}
                  onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  value={editForm.location}
                  onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => !editLoading && (setEditingId(null), setEditForm(null))} className="flex-1 py-2 border border-slate-300 rounded-lg font-medium text-slate-700">
                  Cancel
                </button>
                <button type="submit" disabled={editLoading} className="flex-1 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  {editLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoSerialAssets;
