import { useEffect, useState } from 'react';
import api from '../api/axios';

const AdminTechnicianAssets = () => {
  const [assets, setAssets] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [total, setTotal] = useState(0);

  const getDerivedStatus = (asset) => {
    // 1. Condition-based statuses (Priority)
    const cond = String(asset.condition || '').toLowerCase();
    if (cond.includes('faulty') || asset.status === 'Faulty') {
      return { label: 'Faulty', color: 'bg-red-100 text-red-800' };
    }
    if (cond.includes('repair') || asset.status === 'Under Repair') {
      return { label: 'Under Repair', color: 'bg-amber-100 text-amber-800' };
    }
    if (cond.includes('disposed') || asset.status === 'Disposed') {
      return { label: 'Disposed', color: 'bg-gray-100 text-gray-800' };
    }
    if (cond.includes('scrap') || asset.status === 'Scrapped') {
      return { label: 'Scrapped', color: 'bg-gray-100 text-gray-800' };
    }

    if (asset.status === 'Testing') {
      return { label: 'Testing', color: 'bg-indigo-100 text-indigo-800' };
    }

    // 2. Assignment status
    if (asset.assigned_to) {
      return { label: 'In Use', color: 'bg-blue-100 text-blue-800' };
    }

    // 3. Spare status (Only for Available New/Used)
    if (asset.status === 'New') {
      return { label: 'In Store (New)', color: 'bg-green-100 text-green-800' };
    }
    if (asset.status === 'Used') {
      return { label: 'In Store (Used)', color: 'bg-green-100 text-green-800' };
    }

    // 4. Fallback
    return { label: asset.status, color: 'bg-gray-100 text-gray-800' };
  };

  const loadAssets = async (q, p = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/assets/by-technician', {
        params: {
          query: q || undefined,
          page: p,
          limit
        }
      });
      setAssets(res.data.items || []);
      setTotal(res.data.total || 0);
      setPage(res.data.page || 1);
      
      const pr = await api.get('/assets/return-pending');
      setPending(pr.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      await loadAssets('', 1);
    };
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => {
    setPage(1);
    loadAssets(search.trim(), 1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.ceil(total / limit)) {
      loadAssets(search.trim(), newPage);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Technician Assets</h1>
      
      <div className="bg-white p-4 rounded shadow mb-6">
        <h2 className="text-lg font-semibold mb-3">Pending Returns</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-gray-500">No pending return requests</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Requested By</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pending.map(a => (
                  <tr key={a._id}>
                    <td className="px-6 py-4">{a.name}</td>
                    <td className="px-6 py-4">{a.serial_number}</td>
                    <td className="px-6 py-4">{a.return_request?.requested_by_name || '-'}</td>
                    <td className="px-6 py-4">{a.return_request?.condition}</td>
                    <td className="px-6 py-4">{a.return_request?.ticket_number}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3">
                        <button
                          onClick={async () => { await api.post('/assets/return-approve', { assetId: a._id }); loadAssets(search.trim()); }}
                          className="text-green-600"
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => { await api.post('/assets/return-reject', { assetId: a._id }); loadAssets(search.trim()); }}
                          className="text-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="bg-white p-4 rounded shadow mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="text"
          placeholder="Search by technician name, email, phone, username"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded"
        />
        <button onClick={onSearch} className="bg-amber-600 hover:bg-amber-700 text-black px-4 py-2 rounded">Search</button>
        <button onClick={() => { setSearch(''); setPage(1); loadAssets('', 1); }} className="bg-gray-200 text-gray-700 px-4 py-2 rounded">Clear</button>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="bg-white rounded shadow overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Technician</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assets.map(a => (
                  <tr key={a._id}>
                    <td className="px-6 py-4">{a.name}</td>
                    <td className="px-6 py-4">{a.model_number}</td>
                    <td className="px-6 py-4">{a.serial_number}</td>
                    <td className="px-6 py-4">{a.ticket_number || '-'}</td>
                    <td className="px-6 py-4">{a.store?.name}</td>
                    <td className="px-6 py-4">
                      {a.status === 'New' ? 'Spare (New)' : 
                       a.status === 'Used' ? 'Spare (Used)' : 
                       a.status === 'Faulty' ? 'Faulty' : 
                       a.status === 'Disposed' ? 'Disposed' : a.status}
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const { label, color } = getDerivedStatus(a);
                        return (
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${color}`}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      {a.assigned_to ? (
                        <div>
                          <div className="font-medium">{a.assigned_to.name}</div>
                          <div className="text-xs text-gray-500">{a.assigned_to.email}</div>
                          <div className="text-xs text-gray-500">{a.assigned_to.phone || ''}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(a.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4 p-4 bg-white rounded shadow">
            <button
              disabled={page === 1}
              onClick={() => handlePageChange(page - 1)}
              className="px-4 py-2 border rounded disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {Math.ceil(total / limit) || 1}
            </span>
            <button
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => handlePageChange(page + 1)}
              className="px-4 py-2 border rounded disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminTechnicianAssets;
