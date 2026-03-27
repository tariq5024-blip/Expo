import { useEffect, useState, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const TechAssets = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/assets/my');
        setAssets(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const groups = useMemo(() => {
    const newGroups = {
      'Received/New': [],
      'Received/Used': [],
      'Returned/New': [],
      'Returned/Used': [],
      'Returned/Faulty': [],
      'Returned/Repaired': []
    };
    
    const q = query.toLowerCase();

    const classify = (a) => {
      const lastByMe = [...(a.history || [])].reverse().find(h => h.user === user?.name);
      const lastCollected = [...(a.history || [])].reverse().find(h => /^Collected\//.test(h.action) && h.user === user?.name);
      if (a.assigned_to && user && a.assigned_to._id === user._id) {
        if (lastCollected) {
          const sub = lastCollected.action.split('/')[1];
          return sub === 'New' ? 'Received/New' : 'Received/Used';
        }
        return 'Received/Used';
      }
      if (lastByMe && /^Returned\/(New|Used|Faulty|Repaired)$/i.test(lastByMe.action)) {
        const cond = lastByMe.action.split('/')[1];
        if (cond === 'New') return 'Returned/New';
        if (cond === 'Used') return 'Returned/Used';
        if (cond === 'Faulty') return 'Returned/Faulty';
        if (cond === 'Repaired') return 'Returned/Repaired';
        return 'Returned/Faulty';
      }
      if (lastByMe && lastByMe.action === 'Reported Faulty') return 'Returned/Faulty';
      return 'Other';
    };

    assets.forEach(a => {
      const cls = classify(a);
      if (newGroups[cls]) {
        if (!q || 
          (a.name || '').toLowerCase().includes(q) ||
          (a.model_number || '').toLowerCase().includes(q) ||
          (a.serial_number || '').toLowerCase().includes(q) ||
          (a.mac_address || '').toLowerCase().includes(q) ||
          (a.store?.name || '').toLowerCase().includes(q)
        ) {
          newGroups[cls].push(a);
        }
      }
    });
    
    return newGroups;
  }, [assets, query, user]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Assets</h1>
      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, model, serial, MAC or store"
          className="w-full max-w-md border p-2 rounded"
        />
      </div>
      {Object.entries(groups).map(([title, list]) => (
        <div key={title} className="mb-6">
          <h2 className="text-lg font-semibold mb-3">{title}</h2>
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">No items</p>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block bg-white rounded shadow overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Model</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Serial</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">MAC</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Store</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {list.map(a => (
                      <tr key={a._id}>
                        <td className="px-4 py-2">{a.name}</td>
                        <td className="px-4 py-2">{a.model_number}</td>
                        <td className="px-4 py-2">{a.serial_number}</td>
                        <td className="px-4 py-2">{a.mac_address || '-'}</td>
                        <td className="px-4 py-2">{a.ticket_number || '-'}</td>
                        <td className="px-4 py-2">{a.store?.name}</td>
                        <td className="px-4 py-2">{`${a.status || '-'} / ${a.condition || '-'}`}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{new Date(a.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {list.map(a => (
                  <div key={a._id} className="bg-white p-4 rounded-lg shadow border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-gray-900">{a.name}</h3>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{a.store?.name}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-600 mb-4">
                      <div>
                        <span className="block text-xs text-gray-400 uppercase">Model</span>
                        {a.model_number}
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 uppercase">Serial</span>
                        <span className="font-mono text-xs">{a.serial_number}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 uppercase">Ticket</span>
                        {a.ticket_number || '-'}
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 uppercase">MAC</span>
                        <span className="font-mono text-xs">{a.mac_address || '-'}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 uppercase">Status</span>
                        {`${a.status || '-'} / ${a.condition || '-'}`}
                      </div>
                      <div>
                        <span className="block text-xs text-gray-400 uppercase">Updated</span>
                        {new Date(a.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default TechAssets;
