import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const PpmHistory = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await api.get('/ppm/history-logs');
        setLogs(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
        // Backward-compatible fallback when backend has not reloaded new isolated route yet.
        if (Number(error?.response?.status) === 404) {
          try {
            const old = await api.get('/ppm');
            const tasks = Array.isArray(old.data) ? old.data : (Array.isArray(old.data?.items) ? old.data.items : []);
            const fallbackLogs = [];
            tasks.forEach((t) => {
              (t.history || []).forEach((h) => {
                fallbackLogs.push({
                  _id: `${t._id}-${h.at || h.date || ''}-${h.action || ''}`,
                  createdAt: h.at || h.date || t.updatedAt || t.createdAt,
                  action: h.action || 'Legacy Task History',
                  user: h.user || '-',
                  comments: h.details || '',
                  assets_included: 1
                });
              });
            });
            setLogs(fallbackLogs);
            return;
          } catch {
            // fall through to generic error
          }
        }
        alert(error.response?.data?.message || 'Failed to load PPM history');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const entries = useMemo(() => {
    const out = [...logs].map((h) => ({
      id: String(h._id),
      at: h.createdAt || h.updatedAt || null,
      action: h.action || '-',
      user: h.user || '-',
      comments: h.comments || '',
      assets_included: Number(h.assets_included || 0)
    }));
    const keyword = q.trim().toLowerCase();
    if (!keyword) return out;
    return out.filter((r) =>
      [r.action, r.user, r.comments, String(r.assets_included)]
        .map((v) => String(v || '').toLowerCase()).join(' ').includes(keyword)
    );
  }, [logs, q]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">PPM History</h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by action, user, comments, assets included..."
        className="w-full md:w-[520px] border rounded-lg px-3 py-2 text-sm"
      />
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left">Timestamp</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Comments</th>
              <th className="px-3 py-2 text-left">Assets Included</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-4 text-slate-500">Loading...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No PPM history found.</td></tr>
            ) : entries.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{row.at ? new Date(row.at).toLocaleString() : '-'}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2">{row.user}</td>
                <td className="px-3 py-2">{row.comments || '-'}</td>
                <td className="px-3 py-2">{row.assets_included}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PpmHistory;
