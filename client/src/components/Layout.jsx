import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { Menu, Settings } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, branding } = useAuth();

  return (
    <div className="flex h-screen bg-app-page text-app-main">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar Wrapper */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out 
        ${isCollapsed ? 'md:w-20' : 'md:w-64'} 
        w-64 
        md:relative md:translate-x-0 
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar 
          onClose={() => setSidebarOpen(false)} 
          isCollapsed={isCollapsed} 
          toggleCollapse={() => setIsCollapsed(!isCollapsed)} 
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="flex items-center justify-between p-4 bg-slate-900 text-white shadow md:hidden z-30">
            <button onClick={() => setSidebarOpen(true)} className="text-white p-1">
                <Menu size={24} />
            </button>
            {user?.role === 'Technician' ? (
              <span className="font-bold text-lg">Expo City Dubai</span>
            ) : (
              <img src={branding?.logoUrl || '/logo.svg'} alt="Expo City Dubai" className="h-8" />
            )}
            {user?.role === 'Admin' && (
              <Link to="/setup" className="text-white p-1">
                <Settings size={24} />
              </Link>
            )}
            {user?.role !== 'Admin' && <div className="w-8"></div>}
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between p-4 bg-white shadow-sm z-30 px-8">
            <h2 className="text-xl font-semibold text-gray-800">
              {/* Dynamic Title could go here, for now empty or Breadcrumb */}
            </h2>
            <div className="flex items-center gap-4">
              {user?.role === 'Admin' && (
                <Link to="/setup" className="text-gray-600 hover:text-amber-600 transition-colors p-2 rounded-full hover:bg-gray-100" title="Setup">
                  <Settings size={24} />
                </Link>
              )}
            </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
