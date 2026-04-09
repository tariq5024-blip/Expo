import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const PpmManagerSection = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState({});
  const [busyId, setBusyId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedTaskId, setExpandedTaskId] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      // Preferred isolated route
      try {
        const { data } = await api.get('/ppm/manager/section');
        setRows(Array.isArray(data) ? data : []);
        return;
      } catch (primaryError) {
        // Fallback for older backend: manager pending route
        if (Number(primaryError?.response?.status) !== 404) throw primaryError;
      }
      try {
        const { data } = await api.get('/ppm/manager/pending');
        const normalized = (Array.isArray(data) ? data : []).map((t) => ({
          ...t,
          assets: Array.isArray(t?.assets) ? t.assets : (t?.asset ? [t.asset] : [])
        }));
        setRows(normalized);
        return;
      } catch (legacyError) {
        if (Number(legacyError?.response?.status) !== 404) throw legacyError;
      }
      // Final compatibility fallback: use generic PPM tasks list and treat open tasks as manager queue
      const { data: tasksData } = await api.get('/ppm', { params: { limit: 500 } });
      const rowsCompat = (Array.isArray(tasksData) ? tasksData : (tasksData?.items || []))
        .filter((t) => ['Scheduled', 'In Progress', 'Not Completed'].includes(String(t?.status || '')))
        .map((t) => ({ ...t, assets: t?.asset ? [t.asset] : [] }));
      setRows(rowsCompat);
    } catch (error) {
      const msg = String(error?.response?.data?.message || '');
      if (!/not allowed/i.test(msg) && !/api endpoint not found/i.test(msg) && Number(error?.response?.status) !== 404) {
        alert(msg || 'Failed to load manager section');
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredRows = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    const byStatus = statusFilter === 'all'
      ? rows
      : rows.filter((r) => String(r?.status || '').toLowerCase() === statusFilter);
    if (!q) return byStatus;
    return byStatus.filter((t) => {
      const assets = Array.isArray(t?.assets) ? t.assets : [];
      return (
        String(t?._id || '').toLowerCase().includes(q)
        || String(t?.status || '').toLowerCase().includes(q)
        || assets.some((a) => (
          String(a?.unique_id || '').toLowerCase().includes(q)
          || String(a?.abs_code || '').toLowerCase().includes(q)
          || String(a?.name || '').toLowerCase().includes(q)
          || String(a?.model_number || '').toLowerCase().includes(q)
          || String(a?.serial_number || '').toLowerCase().includes(q)
        ))
      );
    });
  }, [rows, query, statusFilter]);

  const summary = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((x) => String(x?.status || '') === 'Pending').length;
    const modified = rows.filter((x) => String(x?.status || '') === 'Modified').length;
    const totalAssets = rows.reduce((acc, t) => acc + (Array.isArray(t?.assets) ? t.assets.length : 0), 0);
    return { total, pending, modified, totalAssets };
  }, [rows]);

  const act = async (taskId, status) => {
    const c = String(comment[taskId] || '').trim();
    if (!c) return alert('Comment is required.');
    try {
      setBusyId(String(taskId));
      // Preferred isolated manager-action route, fallback to legacy manager-review route.
      try {
        await api.patch('/ppm/manager-action', { ppm_task_id: taskId, status, comment: c });
      } catch (primaryError) {
        if (Number(primaryError?.response?.status) !== 404 && !/api endpoint not found/i.test(String(primaryError?.response?.data?.message || ''))) throw primaryError;
        await api.patch(`/ppm/${taskId}/manager-review`, { decision: status, comment: c });
      }
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to submit manager action');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">PPM Manager Section</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Queue Tasks</div>
          <div className="text-2xl font-bold mt-1 text-app-accent">{summary.total}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Pending</div>
          <div className="text-2xl font-bold mt-1 text-app-accent">{summary.pending}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Modified</div>
          <div className="text-2xl font-bold mt-1 text-app-accent">{summary.modified}</div>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <div className="text-xs uppercase text-slate-500">Assets In Queue</div>
          <div className="text-2xl font-bold mt-1 text-app-accent">{summary.totalAssets}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-3 shadow-sm flex flex-wrap gap-2 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search task id, UID, ABS, model, serial..."
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="modified">Modified</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="btn-app-outline text-sm"
        >
          Refresh
        </button>
      </div>

      {loading ? <div className="text-sm text-slate-500">Loading…</div> : null}
      {!loading && filteredRows.length === 0 ? <div className="text-sm text-slate-500">No manager tasks match the current filters.</div> : null}

      <div className="space-y-3">
        {filteredRows.map((t) => {
          const assets = Array.isArray(t?.assets) ? t.assets : [];
          const expanded = expandedTaskId === String(t._id);
          return (
            <div key={t._id} className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">
                  Task: <span className="font-mono">{t._id}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex px-2 py-0.5 rounded-full border border-[rgb(var(--accent-color)/0.35)] bg-app-accent-soft text-app-accent">
                    {t.status}
                  </span>
                  <span className="inline-flex px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                    Assets: {assets.length}
                  </span>
                </div>
              </div>

              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setExpandedTaskId(expanded ? '' : String(t._id))}
                  className="btn-app-soft text-xs"
                >
                  {expanded ? 'Hide assets' : 'View assets'}
                </button>
              </div>

              {expanded ? (
                <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden">
                  <div className="max-h-[min(70vh,40rem)] overflow-auto overflow-x-auto custom-scrollbar">
                    <table className="min-w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 shadow-[0_1px_0_rgb(226_232_240)]">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold text-slate-700">Unique ID</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-700">ABS</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-700">Name</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-700">Model</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-700">Serial</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-700">Ticket</th>
                          <th className="px-2 py-2 text-left font-semibold text-slate-700">Vendor</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {assets.length === 0 ? (
                          <tr><td colSpan={7} className="px-2 py-3 text-slate-500">No assets attached.</td></tr>
                        ) : assets.map((a, idx) => (
                          <tr key={`${t._id}-${idx}`} className="border-t border-slate-100 hover:bg-slate-50/80">
                            <td className="px-2 py-1.5 font-mono align-top">{a?.unique_id || '-'}</td>
                            <td className="px-2 py-1.5 font-mono align-top">{a?.abs_code || '-'}</td>
                            <td className="px-2 py-1.5 align-top">{a?.name || '-'}</td>
                            <td className="px-2 py-1.5 align-top">{a?.model_number || '-'}</td>
                            <td className="px-2 py-1.5 font-mono align-top">{a?.serial_number || '-'}</td>
                            <td className="px-2 py-1.5 align-top">{a?.ticket || '-'}</td>
                            <td className="px-2 py-1.5 align-top">{a?.maintenance_vendor || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <textarea
                className="mt-2 w-full border rounded-lg px-2 py-1.5 text-sm"
                rows={2}
                placeholder="Manager comment (required)"
                value={comment[t._id] || ''}
                onChange={(e) => setComment((prev) => ({ ...prev, [t._id]: e.target.value }))}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busyId === String(t._id)} onClick={() => act(t._id, 'Approved')} className="btn-app-primary">Approve</button>
                <button type="button" disabled={busyId === String(t._id)} onClick={() => act(t._id, 'Rejected')} className="btn-app-outline">Reject</button>
                <button type="button" disabled={busyId === String(t._id)} onClick={() => act(t._id, 'Modified')} className="btn-app-soft">Modify</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PpmManagerSection;
