import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import * as XLSX from 'xlsx';

const DisposalProcess = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('faulty');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const isFaulty = activeTab === 'faulty';
      const primary = await api.get('/assets', {
        params: {
          status: isFaulty ? 'Faulty' : 'Disposed',
          limit: 100
        }
      });
      const secondaryFaulty = await api.get('/assets', {
        params: {
          condition: isFaulty ? 'Faulty' : 'Disposed',
          limit: 100
        }
      });
      // Include 'Scrapped' condition as pending disposal candidates
      const secondaryScrapped = isFaulty 
        ? await api.get('/assets', { params: { condition: 'Scrapped', limit: 100 } })
        : { data: { items: [] } };
      const merged = [
        ...(primary.data.items || []), 
        ...(secondaryFaulty.data.items || []),
        ...((secondaryScrapped.data.items) || [])
      ];
      const dedup = [];
      const seen = new Set();
      for (const a of merged) {
        const key = a._id || `${a.serial_number}-${a.store?._id || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          dedup.push(a);
        }
      }
      setAssets(dedup);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchAssets, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAssets]);

  const handleDispose = async (assetId) => {
    if (!window.confirm('Are you sure you want to mark this asset as Disposed? This action cannot be easily undone.')) return;
    
    try {
      await api.put(`/assets/${assetId}`, { status: 'Disposed', condition: 'Disposed' });
      fetchAssets(); // Refresh list
    } catch (err) {
      console.error(err);
      alert('Failed to dispose asset');
    }
  };

  const exportDisposedToExcel = () => {
    const rows = assets.map(a => ({
      UniqueID: a.uniqueId || '',
      Category: a.category || '',
      AssetType: a.name || '',
      ProductName: a.product_name || '',
      SerialNumber: a.serial_number || '',
      ModelNumber: a.model_number || '',
      Manufacturer: a.manufacturer || '',
      Condition: a.condition || '',
      Status: a.status || '',
      Store: (a.store?.parentStore?.name) || (a.store?.name) || '',
      Location: a.location || '',
      UpdatedAt: a.updatedAt ? new Date(a.updatedAt).toLocaleString() : ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Disposed');
    XLSX.writeFile(wb, 'disposed_history.xlsx');
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Disposal Process</h1>

      <div className="flex gap-4 mb-6 border-b">
        <button
          className={`pb-2 px-4 font-medium ${activeTab === 'faulty' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('faulty')}
        >
          Faulty (Pending Disposal)
        </button>
        <button
          className={`pb-2 px-4 font-medium ${activeTab === 'disposed' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('disposed')}
        >
          Disposed History
        </button>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={fetchAssets}
            className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-300"
          >
            Refresh
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow">
        {loading ? (
          <p>Loading...</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-gray-500">No assets found in this category.</p>
        ) : (
          <div className="overflow-x-auto">
            {activeTab === 'disposed' && (
              <div className="flex justify-end mb-3">
                <button
                  onClick={exportDisposedToExcel}
                  className="bg-amber-600 hover:bg-amber-700 text-black px-4 py-2 rounded"
                >
                  Download Excel
                </button>
              </div>
            )}
            <div className="flex items-center justify-between mb-3 text-sm text-gray-600">
              <div>
                <span className="font-semibold">Total:</span> {assets.length}
              </div>
              {activeTab === 'faulty' && (
                <div>
                  <span className="font-semibold">Ready to dispose:</span> {assets.filter(a => a.status === 'Faulty').length}
                </div>
              )}
            </div>
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manufacturer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unique ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assets.map(a => (
                  <tr key={a._id}>
                    <td className="px-6 py-4">{a.category || '-'}</td>
                    <td className="px-6 py-4">{a.name}</td>
                    <td className="px-6 py-4">{a.product_name || '-'}</td>
                    <td className="px-6 py-4">{a.serial_number}</td>
                    <td className="px-6 py-4">{a.model_number || '-'}</td>
                    <td className="px-6 py-4">{a.manufacturer || '-'}</td>
                    <td className="px-6 py-4">{a.condition || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${a.status === 'Faulty' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{a.uniqueId || '-'}</td>
                    <td className="px-6 py-4">{a.location || '-'}</td>
                    <td className="px-6 py-4">
                      {activeTab === 'faulty' && (
                        <button
                          onClick={() => handleDispose(a._id)}
                          className="text-red-600 hover:text-red-900 font-medium"
                        >
                          Mark as Disposed
                        </button>
                      )}
                      {activeTab === 'disposed' && (
                        <span className="text-gray-400">Archived</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DisposalProcess;
