import { createContext, useState, useEffect, useContext } from 'react';
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
        try {
          // Verify session with server
          const res = await api.get('/auth/me');
          setUser(res.data); // Update with fresh data from server
          
          if (storedActiveStore) {
            setActiveStore(JSON.parse(storedActiveStore));
          }
        } catch (error) {
          // If 401/403, clear local storage (session expired/invalid)
          console.error('Session verification failed:', error);
          localStorage.removeItem('user');
          localStorage.removeItem('activeStore');
          setUser(null);
          setActiveStore(null);
        }
      }
      setLoading(false);
    };

    verifySession();
  }, []);

  const login = async (email, password) => {
    setGlobalLoading(true);
    const response = await api.post('/auth/login', { email, password });
    const userData = response.data;
    
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);

    // If regular admin/technician, set their assigned store as active
    if (userData.role !== 'Super Admin' && userData.assignedStore) {
      setActiveStore(userData.assignedStore);
      localStorage.setItem('activeStore', JSON.stringify(userData.assignedStore));
    } else if (userData.role === 'Super Admin') {
      // Super Admin: Clear active store initially (force selection) unless we want to persist last choice
      // For now, let's clear it to force Portal selection
      setActiveStore(null);
      localStorage.removeItem('activeStore');
    }

    setGlobalLoading(false);
    return userData;
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
    globalLoading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node
};
