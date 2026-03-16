import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const defaultForm = {
  name: '',
  type: '',
  model: '',
  serial_number: '',
  mac_address: '',
  po_number: '',
  location: '',
  comment: '',
  status: 'Available'
};

const Tools = () => {
  const { user } = useAuth();
  const [tools, setTools] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [historyModal, setHistoryModal] = useState({ open: false, toolName: '', rows: [] });
  const [editingTool, setEditingTool] = useState(null);
  const [editForm, setEditForm] = useState(defaultForm);
  const [updating, setUpdating] = useState(false);

  const canWrite = user?.role === 'Admin' || user?.role === 'Super Admin';

  const loadTools = async ({ q, s } = {}) => {
    try {
      setLoading(true);
      const res = await api.get('/tools', {
        params: {
          q: q || undefined,
          status: s || undefined
        }
      });
      setTools(res.data || []);
    } catch (error) {
      console.error('Error loading tools:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadTools({ q: debouncedSearch, s: status });
  }, [debouncedSearch, status]);

  const list = useMemo(() => tools, [tools]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!canWrite) return;
    try {
      setSaving(true);
      await api.post('/tools', form);
      setForm(defaultForm);
      await loadTools();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to register tool');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!canWrite) return;
    if (!window.confirm('Delete this tool?')) return;
    try {
      await api.delete(`/tools/${id}`);
      await loadTools();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete tool');
    }
  };

  const onEditClick = (tool) => {
    setEditingTool(tool);
    setEditForm({
      name: tool.name || '',
      type: tool.type || '',
      model: tool.model || '',
      serial_number: tool.serial_number || '',
      mac_address: tool.mac_address || '',
      po_number: tool.po_number || '',
      location: tool.location || '',
      comment: tool.comment || '',
      status: tool.status || 'Available'
    });
  };

  const onEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const onEditSave = async () => {
    if (!editingTool) return;
    try {
      setUpdating(true);
      await api.put(`/tools/${editingTool._id}`, editForm);
      setEditingTool(null);
      await loadTools();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update tool');
    } finally {
      setUpdating(false);
    }
  };

  const openHistory = async (tool) => {
    try {
      const res = await api.get(`/tools/${tool._id}/history`);
      setHistoryModal({
        open: true,
        toolName: tool.name,
        rows: res.data || []
      });
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to load history');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tools</h1>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="border border-slate-300 rounded-lg px-3 py-2"
            placeholder="Search by name, type, serial, mac, po, comment"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="border border-slate-300 rounded-lg px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Available">Available</option>
            <option value="Issued">Issued</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Retired">Retired</option>
          </select>
          <button onClick={() => loadTools({ q: debouncedSearch, s: status })} className="rounded-lg px-4 py-2 bg-slate-900 text-white hover:bg-black">Refresh</button>
        </div>
      </div>

      {canWrite && (
        <form onSubmit={onCreate} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="font-semibold mb-3">Register Tool</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input name="name" value={form.name} onChange={onChange} required placeholder="Tool Name" className="border border-slate-300 rounded-lg px-3 py-2" />
            <input name="type" value={form.type} onChange={onChange} placeholder="Type" className="border border-slate-300 rounded-lg px-3 py-2" />
            <input name="model" value={form.model} onChange={onChange} placeholder="Model" className="border border-slate-300 rounded-lg px-3 py-2" />
            <input name="serial_number" value={form.serial_number} onChange={onChange} placeholder="Serial" className="border border-slate-300 rounded-lg px-3 py-2" />
            <input name="mac_address" value={form.mac_address} onChange={onChange} placeholder="MAC" className="border border-slate-300 rounded-lg px-3 py-2" />
            <input name="po_number" value={form.po_number} onChange={onChange} placeholder="PO Number" className="border border-slate-300 rounded-lg px-3 py-2" />
            <input name="location" value={form.location} onChange={onChange} placeholder="Location" className="border border-slate-300 rounded-lg px-3 py-2" />
            <select name="status" value={form.status} onChange={onChange} className="border border-slate-300 rounded-lg px-3 py-2">
              <option value="Available">Available</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Retired">Retired</option>
            </select>
          </div>
          <textarea name="comment" value={form.comment} onChange={onChange} placeholder="Comment" className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2" rows={2} />
          <div className="mt-3">
            <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 bg-amber-600 text-black hover:bg-amber-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Register Tool'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Model</th>
              <th className="px-3 py-2 text-left">Serial</th>
              <th className="px-3 py-2 text-left">MAC</th>
              <th className="px-3 py-2 text-left">PO</th>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Holder</th>
              <th className="px-3 py-2 text-left">Comment</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-4 text-slate-500" colSpan={11}>Loading tools...</td></tr>
            ) : list.length === 0 ? (
              <tr><td className="px-3 py-4 text-slate-500" colSpan={11}>No tools found.</td></tr>
            ) : (
              list.map((tool) => (
                <tr key={tool._id} className="border-t">
                  <td className="px-3 py-2">{tool.name}</td>
                  <td className="px-3 py-2">{tool.type || '-'}</td>
                  <td className="px-3 py-2">{tool.model || '-'}</td>
                  <td className="px-3 py-2">{tool.serial_number || '-'}</td>
                  <td className="px-3 py-2">{tool.mac_address || '-'}</td>
                  <td className="px-3 py-2">{tool.po_number || '-'}</td>
                  <td className="px-3 py-2">{tool.location || '-'}</td>
                  <td className="px-3 py-2">{tool.status}</td>
                  <td className="px-3 py-2">{tool.currentHolder?.name || '-'}</td>
                  <td className="px-3 py-2">{tool.comment || '-'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-3">
                      <button onClick={() => openHistory(tool)} className="text-indigo-600 hover:underline">History</button>
                      {canWrite && <button onClick={() => onEditClick(tool)} className="text-amber-600 hover:underline">Edit</button>}
                      {canWrite && <button onClick={() => onDelete(tool._id)} className="text-red-600 hover:underline">Delete</button>}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {historyModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold">Tool History - {historyModal.toolName}</h3>
              <button onClick={() => setHistoryModal({ open: false, toolName: '', rows: [] })} className="text-slate-500 hover:text-slate-800">Close</button>
            </div>
            <div className="p-4 space-y-2">
              {historyModal.rows.length === 0 ? (
                <p className="text-sm text-slate-500">No history found.</p>
              ) : historyModal.rows.map((h, idx) => (
                <div key={`${h.createdAt}-${idx}`} className="border border-slate-200 rounded-lg p-3 text-sm">
                  <div className="font-medium">{h.action}</div>
                  <div className="text-slate-600">By: {h.actorName || '-'}</div>
                  <div className="text-slate-600">User: {h.targetUserName || '-'}</div>
                  <div className="text-slate-600">Note: {h.note || '-'}</div>
                  <div className="text-slate-500 text-xs">{new Date(h.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {editingTool && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold">Edit Tool</h3>
              <button onClick={() => setEditingTool(null)} className="text-slate-500 hover:text-slate-800">Close</button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input name="name" value={editForm.name} onChange={onEditChange} placeholder="Tool Name" className="border border-slate-300 rounded-lg px-3 py-2" />
                <input name="type" value={editForm.type} onChange={onEditChange} placeholder="Type" className="border border-slate-300 rounded-lg px-3 py-2" />
                <input name="model" value={editForm.model} onChange={onEditChange} placeholder="Model" className="border border-slate-300 rounded-lg px-3 py-2" />
                <input name="serial_number" value={editForm.serial_number} onChange={onEditChange} placeholder="Serial" className="border border-slate-300 rounded-lg px-3 py-2" />
                <input name="mac_address" value={editForm.mac_address} onChange={onEditChange} placeholder="MAC" className="border border-slate-300 rounded-lg px-3 py-2" />
                <input name="po_number" value={editForm.po_number} onChange={onEditChange} placeholder="PO Number" className="border border-slate-300 rounded-lg px-3 py-2" />
                <input name="location" value={editForm.location} onChange={onEditChange} placeholder="Location" className="border border-slate-300 rounded-lg px-3 py-2" />
                <select name="status" value={editForm.status} onChange={onEditChange} className="border border-slate-300 rounded-lg px-3 py-2">
                  <option value="Available">Available</option>
                  <option value="Issued">Issued</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Retired">Retired</option>
                </select>
              </div>
              <textarea name="comment" value={editForm.comment} onChange={onEditChange} placeholder="Comment" className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2" rows={3} />
            </div>
            <div className="px-4 py-3 border-t flex justify-end gap-2">
              <button onClick={() => setEditingTool(null)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</button>
              <button onClick={onEditSave} disabled={updating} className="px-4 py-2 rounded-lg bg-amber-600 text-black hover:bg-amber-700 disabled:opacity-50">
                {updating ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;

