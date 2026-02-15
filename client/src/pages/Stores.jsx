import { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const Stores = () => {
  const { activeStore } = useAuth();
  const [stores, setStores] = useState([]);
  const [newName, setNewName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingId, setEditingId] = useState('');
  const [editingName, setEditingName] = useState('');

  const fetchStores = useCallback(async () => {
    try {
      const res = await api.get(`/stores?parent=${activeStore._id}&includeAssetTotals=true`);
      setStores(res.data);
    } catch (err) {
      console.error(err);
    }
  }, [activeStore]);

  useEffect(() => {
    if (activeStore) {
      fetchStores();
    }
  }, [activeStore, fetchStores]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/stores', { 
        name: newName
      });
      setNewName('');
      fetchStores();
    } catch {
      alert('Error adding store');
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm('Are you sure?')) return;
    try {
      await api.delete(`/stores/${id}`);
      fetchStores();
    } catch {
      alert('Error deleting store');
    }
  };
  
  const startEdit = (store) => {
    setEditingId(store._id);
    setEditingName(store.name);
  };
  
  const cancelEdit = () => {
    setEditingId('');
    setEditingName('');
  };
  
  const saveEdit = async () => {
    try {
      await api.put(`/stores/${editingId}`, { 
        name: editingName
      });
      cancelEdit();
      fetchStores();
    } catch {
      alert('Error updating store');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Locations</h1>
      
      <div className="bg-white p-4 rounded shadow mb-6">
        <input
          type="text"
          placeholder="Search locations"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border p-2 rounded w-full"
        />
      </div>
      
      <form onSubmit={handleAdd} className="mb-8 flex flex-wrap gap-4 items-end bg-white p-4 rounded shadow">
        <div>
          <label className="block text-sm font-medium text-gray-700">Location Name</label>
          <input 
            type="text" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            placeholder="Location Name" 
            className="border p-2 rounded w-64"
            required
          />
        </div>
        <button type="submit" className="bg-amber-600 hover:bg-amber-700 text-black px-4 py-2 rounded h-10">Add Location</button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.filter(s => {
          if (!searchTerm.trim()) return true;
          return (s.name || '').toLowerCase().includes(searchTerm.toLowerCase());
        }).map(store => {
          return (
            <div key={store._id} className="bg-white p-4 rounded shadow">
              {editingId === store._id ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="border p-2 rounded"
                  />
                  <div className="flex gap-2 justify-end mt-2">
                    <button onClick={saveEdit} className="bg-green-600 text-white px-3 py-1 rounded text-sm">Save</button>
                    <button onClick={cancelEdit} className="bg-gray-500 text-white px-3 py-1 rounded text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-lg">{store.name}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    Total available in store: <span className="font-semibold">{store.availableAssetCount ?? 0}</span>
                  </div>
                  <div className="flex gap-2 justify-end border-t pt-2">
                    <button onClick={() => startEdit(store)} className="text-amber-600 text-sm hover:underline">Edit</button>
                    <button onClick={() => handleDelete(store._id)} className="text-red-500 text-sm hover:underline">Delete</button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Stores;
