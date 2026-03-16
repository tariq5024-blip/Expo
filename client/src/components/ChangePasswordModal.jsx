import { useEffect, useRef, useState } from 'react';
import { X, Lock, Eye, EyeOff } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const ChangePasswordModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
        setError('Password must be at least 6 characters');
        return;
    }

    setLoading(true);
    try {
      // 1. Verify current password
      await api.post('/auth/verify-password', { password: currentPassword });
      
      // 2. Update password
      // Note: We use the user's ID. The backend allows users to update themselves.
      await api.put(`/users/${user._id}`, { password: newPassword });
      
      setSuccess('Password updated successfully');
      
      // Clear sensitive fields immediately
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      closeTimerRef.current = setTimeout(() => {
        onClose();
        setSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to update password. Please check your current password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 animate-scale-in">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
          <h3 className="font-semibold text-lg text-slate-800 dark:text-white flex items-center gap-2">
            <Lock size={18} className="text-amber-500" />
            Change Password
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center gap-2">
            <span className="font-bold">!</span> {error}
          </div>}
          {success && <div className="p-3 bg-green-50 text-green-600 text-sm rounded-lg border border-green-100 flex items-center gap-2">
             <span className="font-bold">✓</span> {success}
          </div>}

          {/* Current Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all"
                required
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full pl-3 pr-10 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all"
                required
                minLength={6}
                placeholder="Minimum 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all"
              required
              placeholder="Re-enter new password"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                  Updating...
                </>
              ) : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
