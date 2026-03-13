import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api from '../api/axios';
import PropTypes from 'prop-types';

/* eslint-disable react-refresh/only-export-components */
const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);


export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeStore, setActiveStore] = useState(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [branding, setBranding] = useState({ logoUrl: '/logo.svg', theme: 'default' });

  const resolveStoreIdForBranding = useCallback((storeValue = activeStore, userValue = user) => {
    if (storeValue && storeValue !== 'all') {
      return storeValue?._id || storeValue || '';
    }
    if (userValue?.role !== 'Super Admin' && userValue?.assignedStore) {
      return userValue.assignedStore?._id || userValue.assignedStore || '';
    }
    return '';
  }, [activeStore, user]);

  const setFavicon = (href) => {
    try {
      const head = document.head || document.getElementsByTagName('head')[0];
      // Remove existing favicons
      Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="mask-icon"]')).forEach(el => el.parentNode.removeChild(el));
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
      link.href = href;
      head.appendChild(link);
    } catch {
      // Non-blocking
    }
  };

  const fetchBranding = useCallback(async (storeOverride = undefined, userOverride = undefined) => {
    try {
      const storeId = resolveStoreIdForBranding(
        storeOverride === undefined ? activeStore : storeOverride,
        userOverride === undefined ? user : userOverride
      );
      const params = storeId ? { storeId } : undefined;
      const res = await api.get('/system/public-config', { params });
      const logoUrl = res.data?.logoUrl || '/logo.svg';
      const theme = res.data?.theme || 'default';
      setBranding({ logoUrl, theme });
      setFavicon(logoUrl);
      document.documentElement.dataset.theme = theme;
    } catch {
      setBranding({ logoUrl: '/logo.svg', theme: 'default' });
      setFavicon('/logo.svg');
      document.documentElement.dataset.theme = 'default';
    }
  }, [activeStore, resolveStoreIdForBranding, user]);

  useEffect(() => {
    (async () => {
      try {
        await api.get('/auth/csrf-token');
      } catch (error) {
        console.error('CSRF token fetch failed:', error);
      }
    })();

    const verifySession = async () => {
      const storedUser = localStorage.getItem('user');
      const storedActiveStore = localStorage.getItem('activeStore');

      if (storedUser) {
        let parsedStoredUser = null;
        try {
          // Hydrate from local storage first to survive browser refreshes
          // when the session check is temporarily unavailable.
          parsedStoredUser = JSON.parse(storedUser);
          setUser(parsedStoredUser);

          if (storedActiveStore) {
            setActiveStore(JSON.parse(storedActiveStore));
          }

          // Verify session with server
          const res = await api.get('/auth/me');
          setUser(res.data); // Update with fresh data from server

          // Keep local cache in sync with server user payload
          localStorage.setItem('user', JSON.stringify(res.data));
        } catch (error) {
          const status = error?.response?.status;
          const isUnauthorized = status === 401 || status === 403;

          if (isUnauthorized) {
            // Session is really invalid, clear local state.
            localStorage.removeItem('user');
            localStorage.removeItem('activeStore');
            setUser(null);
            setActiveStore(null);
          } else {
            // Temporary network/backend issue: preserve local session state.
            console.error('Session verification deferred due to transient error:', error);
            if (!parsedStoredUser) {
              localStorage.removeItem('user');
              localStorage.removeItem('activeStore');
              setUser(null);
              setActiveStore(null);
            }
          }
        }
      }
      setLoading(false);
    };

    verifySession();
  }, []);

  useEffect(() => {
    if (loading) return;
    fetchBranding();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStore, user?._id, loading]);

  const login = async (email, password) => {
    setGlobalLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const userData = response.data;

      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);

      // If regular admin/technician, set their assigned store as active
      if (userData.role !== 'Super Admin' && userData.assignedStore) {
        setActiveStore(userData.assignedStore);
        localStorage.setItem('activeStore', JSON.stringify(userData.assignedStore));
      } else if (userData.role === 'Super Admin') {
        // Super Admin: Clear active store initially (force selection).
        setActiveStore(null);
        localStorage.removeItem('activeStore');
      }

      return userData;
    } finally {
      setGlobalLoading(false);
    }
  };

  const logout = async () => {
    setGlobalLoading(true);
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    }
    localStorage.removeItem('user');
    localStorage.removeItem('activeStore');
    setUser(null);
    setActiveStore(null);
    setGlobalLoading(false);
  };

  const selectStore = (store) => {
    setActiveStore(store);
    localStorage.setItem('activeStore', JSON.stringify(store));
  };

  const value = {
    user,
    activeStore,
    login,
    logout,
    selectStore,
    loading,
    globalLoading,
    branding,
    refreshBranding: async () => {
      await fetchBranding();
    }
  };
  
  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center bg-app-page">
          <div className="flex flex-col items-center gap-3 text-app-main">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-slate-500">Loading application...</p>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node
};
