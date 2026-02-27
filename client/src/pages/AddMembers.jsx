import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, X } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const AddMembers = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('technician');
  const [stores, setStores] = useState([]);
  const [members, setMembers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    assignedStore: '',
    accessScope: 'All'
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const fetchMembers = useCallback(async () => {
    setFetching(true);
    try {
      let endpoint = '/users';
      if (activeTab === 'admin') endpoint = '/users/admins';
      if (activeTab === 'viewer') endpoint = '/users/viewers';
      
      const res = await api.get(endpoint);
      setMembers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching members:', err);
      setMessage({ type: 'error', text: 'Failed to fetch members' });
      setMembers([]); // Ensure it's an array on error
    } finally {
      setFetching(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const res = await api.get('/stores?main=true');
        setStores(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching stores:', err);
        setStores([]); // Ensure it's an array on error
      }
    };
    fetchStores();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleEdit = (member) => {
    setEditingId(member._id);
    setFormData({
      name: member.name,
      username: member.username,
      email: member.email,
      phone: member.phone,
      password: '', // Leave empty to keep unchanged
      assignedStore: member.assignedStore?._id || member.assignedStore || '',
      accessScope: member.accessScope || 'All'
    });
    setMessage({ type: '', text: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({
      name: '',
      username: '',
      email: '',
      phone: '',
      password: '',
      assignedStore: '',
      accessScope: 'All'
    });
    setMessage({ type: '', text: '' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this member?')) return;

    try {
      await api.delete(`/users/${id}`);
      setMessage({ type: 'success', text: 'Member deleted successfully' });
      fetchMembers();
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || 'Error deleting member' 
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const payload = { ...formData };
      
      // Clean payload based on role
      if (activeTab === 'viewer') {
        delete payload.assignedStore;
        // ensure accessScope is present (default All)
        if (!payload.accessScope) payload.accessScope = 'All';
      } else {
        delete payload.accessScope;
        // Remove assignedStore only if empty (Admin MUST have assignedStore)
        if (!payload.assignedStore) {
          delete payload.assignedStore;
        }
      }

      // Remove password if empty during edit
      if (editingId && !payload.password) {
        delete payload.password;
      }

      if (editingId) {
        await api.put(`/users/${editingId}`, payload);
        setMessage({ type: 'success', text: 'User updated successfully!' });
      } else {
        let endpoint = '/users';
        if (activeTab === 'admin') endpoint = '/users/admins';
        if (activeTab === 'viewer') endpoint = '/users/viewers';
        
        await api.post(endpoint, payload);
        setMessage({ type: 'success', text: 'User created successfully!' });
      }

      handleCancelEdit(); // Reset form
      fetchMembers(); // Refresh list
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.message || `Error ${editingId ? 'updating' : 'creating'} user` 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Member Management</h1>
      
      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          className={`px-4 py-2 font-medium ${
            activeTab === 'technician' 
              ? 'border-b-2 border-amber-600 text-amber-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => {
            setActiveTab('technician');
            handleCancelEdit();
          }}
        >
          Technicians
        </button>
        {user?.role === 'Super Admin' && (
          <>
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === 'admin' 
                  ? 'border-b-2 border-amber-600 text-amber-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => {
                setActiveTab('admin');
                handleCancelEdit();
              }}
            >
              Admins
            </button>
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === 'viewer' 
                  ? 'border-b-2 border-amber-600 text-amber-600' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => {
                setActiveTab('viewer');
                handleCancelEdit();
              }}
            >
              Viewers
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Section */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-lg shadow-md sticky top-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">
                {editingId ? 'Edit Member' : 'Add New Member'}
              </h2>
              {editingId && (
                <button 
                  onClick={handleCancelEdit}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {message.text && (
              <div className={`p-4 mb-4 rounded ${
                message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Full Name</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Username</label>
                <input
                  type="text"
                  name="username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="text"
                  name="phone"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {editingId ? 'Password (leave blank to keep unchanged)' : 'Password'}
                </label>
                <input
                  type="password"
                  name="password"
                  required={!editingId}
                  value={formData.password}
                  onChange={handleChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>

              {(activeTab === 'technician' || activeTab === 'viewer' || (activeTab === 'admin' && user?.role === 'Super Admin')) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {activeTab === 'viewer' ? 'Access Scope' : `Assigned Store ${activeTab === 'admin' ? '(Required)' : '(Optional)'}`}
                  </label>
                  
                  {activeTab === 'viewer' ? (
                    <select
                      name="accessScope"
                      value={formData.accessScope}
                      onChange={handleChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    >
                      <option value="All">All Stores</option>
                      <option value="SCY">SCY Stores Only</option>
                      <option value="NOC">NOC Stores Only</option>
                      <option value="IT">IT Store Only</option>
                    </select>
                  ) : (
                    <select
                      name="assignedStore"
                      value={formData.assignedStore}
                      onChange={handleChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                    >
                      <option value="">Select Store</option>
                      {stores.map(store => (
                        <option key={store._id} value={store._id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <div className="pt-4 flex gap-3">
                {editingId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 ${
                    loading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? 'Saving...' : (editingId ? 'Update Member' : 'Create Member')}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* List Section */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">
                {activeTab === 'technician' ? 'Technicians List' : 
                 activeTab === 'admin' ? 'Admins List' : 'Viewers List'}
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    {(activeTab === 'technician' || activeTab === 'viewer' || (activeTab === 'admin' && user?.role === 'Super Admin')) && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {activeTab === 'viewer' ? 'Access Scope' : 'Store'}
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {fetching ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-4 text-center text-gray-500">Loading members...</td>
                    </tr>
                  ) : members.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="px-6 py-4 text-center text-gray-500">No members found</td>
                    </tr>
                  ) : (
                    members.map((member) => (
                      <tr key={member._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{member.name}</div>
                          <div className="text-sm text-gray-500">{member.username}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{member.email}</div>
                          <div className="text-sm text-gray-500">{member.phone}</div>
                        </td>
                        {(activeTab === 'technician' || activeTab === 'viewer' || (activeTab === 'admin' && user?.role === 'Super Admin')) && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {activeTab === 'viewer' 
                              ? (member.accessScope === 'All' ? 'All Stores' : `${member.accessScope} Stores`)
                              : (member.assignedStore?.name || '-')}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEdit(member)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                            title="Edit"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(member._id)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddMembers;
