import { useEffect, useMemo, useState } from 'react';
import api from '../api/axios';

const TechTools = () => {
  const [tools, setTools] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [allRes, myRes] = await Promise.all([
        api.get('/tools'),
        api.get('/tools', { params: { mine: true } })
      ]);
      setTools(allRes.data || []);
      setMine(myRes.data || []);
    } catch (error) {
      console.error('Error loading technician tools:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tools || [])
      .filter((t) => t.status === 'Available')
      .filter((t) => {
        if (!q) return true;
        return [t.name, t.type, t.model, t.serial_number, t.mac_address, t.location]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });
  }, [tools, query]);

  const myIssued = useMemo(() => mine.filter((t) => t.status === 'Issued'), [mine]);

  const issueTool = async (toolId) => {
    try {
      await api.post(`/tools/${toolId}/issue`, { comment: note });
      setNote('');
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to get tool');
    }
  };

  const returnTool = async (toolId) => {
    try {
      await api.post(`/tools/${toolId}/return`, { comment: note });
      setNote('');
      await load();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to return tool');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tools Panel</h1>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search available tools by name/type/model/serial/mac/location"
          className="border border-slate-300 rounded-lg px-3 py-2"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional comment for get/return"
          className="border border-slate-300 rounded-lg px-3 py-2"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold">Available Tools</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Model</th>
              <th className="px-3 py-2 text-left">Serial</th>
              <th className="px-3 py-2 text-left">MAC</th>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-left">PO</th>
              <th className="px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-4 text-slate-500">Loading...</td></tr>
            ) : available.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-4 text-slate-500">No available tools.</td></tr>
            ) : available.map((tool) => (
              <tr key={tool._id} className="border-t">
                <td className="px-3 py-2">{tool.name}</td>
                <td className="px-3 py-2">{tool.type || '-'}</td>
                <td className="px-3 py-2">{tool.model || '-'}</td>
                <td className="px-3 py-2">{tool.serial_number || '-'}</td>
                <td className="px-3 py-2">{tool.mac_address || '-'}</td>
                <td className="px-3 py-2">{tool.location || '-'}</td>
                <td className="px-3 py-2">{tool.po_number || '-'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => issueTool(tool._id)} className="px-3 py-1 rounded bg-amber-600 text-black hover:bg-amber-700">
                    Get Tool
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold">My Issued Tools</div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Model</th>
              <th className="px-3 py-2 text-left">Serial</th>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-500">Loading...</td></tr>
            ) : myIssued.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-slate-500">No issued tools.</td></tr>
            ) : myIssued.map((tool) => (
              <tr key={tool._id} className="border-t">
                <td className="px-3 py-2">{tool.name}</td>
                <td className="px-3 py-2">{tool.type || '-'}</td>
                <td className="px-3 py-2">{tool.model || '-'}</td>
                <td className="px-3 py-2">{tool.serial_number || '-'}</td>
                <td className="px-3 py-2">{tool.location || '-'}</td>
                <td className="px-3 py-2">
                  <button onClick={() => returnTool(tool._id)} className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700">
                    Return Tool
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TechTools;

