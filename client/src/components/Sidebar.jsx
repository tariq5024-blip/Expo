import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Box, Users, Store, LogOut, Ticket, ChevronDown, ChevronRight, Settings, Menu, Calendar, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ChangePasswordModal from './ChangePasswordModal';
import api from '../api/axios';
import PropTypes from 'prop-types';

const SidebarItem = ({ item, depth = 0, openSubMenu, toggleSubMenu, location, onClose, isActive, isCollapsed, theme }) => {
  const isSubMenuOpen = openSubMenu[item.name];
  const hasSubItems = item.subItems && item.subItems.length > 0;
  
  // If collapsed, we don't indent
  const paddingLeft = isCollapsed ? 0 : depth * 12 + 16;
  
  // If collapsed and this is a sub-item, don't show it (simple minimize behavior)
  if (isCollapsed && depth > 0) return null;

  if (hasSubItems) {
    return (
      <div>
        <button
          onClick={() => toggleSubMenu(item.name)}
          style={{ paddingLeft: isCollapsed ? 0 : `${paddingLeft}px` }}
          className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between'} w-full py-2 rounded-lg transition-colors ${
            location.pathname.startsWith(item.path || '/assets') && depth === 0
              ? theme.item.activeDepth0
              : theme.item.inactiveDepth0
          } ${depth > 0 ? 'text-sm' : ''}`}
          title={isCollapsed ? item.name : ''}
        >
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            {item.icon && item.icon}
            {!isCollapsed && <span>{item.name}</span>}
          </div>
          {!isCollapsed && (isSubMenuOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
        </button>
        {/* Only show subitems if NOT collapsed */}
        {!isCollapsed && isSubMenuOpen && (
          <ul className={`mt-1 space-y-1 border-l ${theme.divider} ml-6 pl-2`}>
            {item.subItems.map((sub) => (
              <li key={sub.uniqueKey || sub.path || sub.name}>
                <SidebarItem 
                  item={sub} 
                  depth={depth + 1} 
                  openSubMenu={openSubMenu}
                  toggleSubMenu={toggleSubMenu}
                  location={location}
                  onClose={onClose}
                  isActive={isActive}
                  isCollapsed={isCollapsed}
                  theme={theme}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <Link
      to={item.path}
      onClick={() => onClose && onClose()}
      style={{ paddingLeft: isCollapsed ? 0 : `${paddingLeft}px` }}
      className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3'} py-2 rounded-lg transition-colors ${
        isActive(item.path)
          ? (depth === 0 ? theme.item.activeDepth0 : theme.item.activeDepth1)
          : (depth === 0 ? theme.item.inactiveDepth0 : theme.item.inactiveDepth1)
      } ${depth > 0 ? 'text-sm' : ''}`}
      title={isCollapsed ? item.name : ''}
    >
      {item.icon && item.icon}
      {!isCollapsed && <span>{item.name}</span>}
    </Link>
  );
};

SidebarItem.propTypes = {
  item: PropTypes.shape({
    name: PropTypes.string.isRequired,
    path: PropTypes.string,
    icon: PropTypes.element,
    subItems: PropTypes.array,
    uniqueKey: PropTypes.string
  }).isRequired,
  depth: PropTypes.number,
  openSubMenu: PropTypes.object.isRequired,
  toggleSubMenu: PropTypes.func.isRequired,
  location: PropTypes.object.isRequired,
  onClose: PropTypes.func,
  isActive: PropTypes.func.isRequired,
  isCollapsed: PropTypes.bool,
  theme: PropTypes.object.isRequired
};

const Sidebar = ({ onClose, isCollapsed, toggleCollapse }) => {
  const { user, logout, activeStore } = useAuth();
  const location = useLocation();
  const [openSubMenu, setOpenSubMenu] = useState({});
  const [productsTree, setProductsTree] = useState([]);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get('/products');
        setProductsTree(res.data || []);
      } catch (err) {
        console.error('Failed to fetch products:', err);
      }
    };

    if (user?.role === 'Admin') {
      fetchProducts();
    }
  }, [user, location.pathname]);

  const toggleSubMenu = (name) => {
    setOpenSubMenu(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={20} />, roles: ['Admin'] },
    {
      name: 'Events',
      icon: <Calendar size={20} />,
      roles: ['Admin', 'Technician'],
      subItems: [
        { name: 'Recent Activity', path: '/events/recent-activity', uniqueKey: 'recent-activity' },
        { name: 'System Logs', path: '/events/system-logs', uniqueKey: 'system-logs', roles: ['Admin'] } // System Logs is Admin Only
      ]
    },
    { 
      name: 'Assets', 
      icon: <Box size={20} />, 
      roles: ['Admin'],
      subItems: [
        { name: 'All Assets', path: '/assets', uniqueKey: 'all-assets' },
        ...productsTree.map(root => ({
          name: root.name,
          path: `/assets?product=${encodeURIComponent(root.name)}`,
          uniqueKey: `prod-root-${root._id}`,
          subItems: (root.children || []).map(child => ({
            name: child.name,
            path: `/assets?product=${encodeURIComponent(child.name)}`,
            uniqueKey: `prod-child-${root._id}-${child.name}`,
            subItems: (child.children || []).map(grand => ({
              name: grand.name,
              path: `/assets?product=${encodeURIComponent(grand.name)}`,
              uniqueKey: `prod-grand-${root._id}-${child.name}-${grand.name}`
            }))
          }))
        }))
      ]
    },
    { name: 'Tech Assets', path: '/admin-tech-assets', icon: <Box size={20} />, roles: ['Admin'] },
    { name: 'Add Members', path: '/add-members', icon: <Users size={20} />, roles: ['Admin'] },
    { name: 'Locations', path: '/stores', icon: <Store size={20} />, roles: ['Admin'] },
    { name: 'Gate Passes', path: '/passes', icon: <Ticket size={20} />, roles: ['Admin'] },
    { name: 'Products', path: '/products', icon: <Box size={20} />, roles: ['Admin'] },
    { name: 'Scanner', path: '/scanner', icon: <Box size={20} />, roles: ['Technician'] },
    { name: 'My Assets', path: '/my-assets', icon: <Box size={20} />, roles: ['Technician'] },
    { name: 'Request Tools', path: '/tech-request', icon: <Box size={20} />, roles: ['Technician'] },
  ];

  const filterItems = (items) => {
    return items.reduce((acc, item) => {
      // Check if user role is allowed for this item
      if (item.roles) {
        const hasRole = item.roles.includes(user?.role);
        const isSuperAdminAccessingAdmin = user?.role === 'Super Admin' && item.roles.includes('Admin');
        
        if (!hasRole && !isSuperAdminAccessingAdmin) {
          return acc;
        }
      }
      
      const newItem = { ...item };
      
      // Recursively filter subItems
      if (newItem.subItems && newItem.subItems.length > 0) {
        // If subItems have roles defined, filter them. 
        // If not defined, assume they inherit parent's visibility (or are visible to all who can see parent)
        // In our case, 'System Logs' has explicit roles.
        const filteredSubItems = filterItems(newItem.subItems);
        
        // If subItems were filtered out completely, but the parent itself has a path, keep parent.
        // If parent is just a container (no path), and all subItems are gone, maybe remove parent?
        // For now, let's just keep the filtered subItems.
        newItem.subItems = filteredSubItems;
      }
      
      acc.push(newItem);
      return acc;
    }, []);
  };

  const filteredItems = filterItems(navItems);

  // Separate Events item to pin to bottom
  const mainNavItems = filteredItems.filter(item => item.name !== 'Events');
  const filteredEvents = filteredItems.filter(item => item.name === 'Events');

  const isActive = (itemPath) => {
    if (itemPath.includes('?')) {
      return location.pathname + location.search === itemPath;
    }
    return location.pathname === itemPath;
  };

  const getTheme = () => {
    const name = activeStore?.name?.toUpperCase() || '';
    
    // IT Store - Professional Tech Theme (Dark Slate with Cyan/Sky Accents)
    if (name.includes('IT')) {
      return {
        sidebarBg: 'bg-slate-950', // Very dark slate (almost black)
        sidebarText: 'text-slate-300', // Muted text for reduced eye strain
        divider: 'border-cyan-900/30',
        item: {
          activeDepth0: 'bg-cyan-950/50 text-cyan-400 border-r-2 border-cyan-400', // Tech glow effect
          inactiveDepth0: 'text-slate-400 hover:bg-slate-900 hover:text-cyan-200',
          activeDepth1: 'text-cyan-400 font-bold',
          inactiveDepth1: 'text-slate-500 hover:text-cyan-200'
        },
        logoText: 'text-slate-200',
        storeText: 'text-cyan-500'
      };
    }
    
    // NOC Store - Professional Monitoring Theme (Deep Neutral/Black with Emerald Accents)
    if (name.includes('NOC')) {
      return {
        sidebarBg: 'bg-neutral-950', // Deep neutral black
        sidebarText: 'text-neutral-400',
        divider: 'border-emerald-900/30',
        item: {
          activeDepth0: 'bg-emerald-950/40 text-emerald-400 border-l-2 border-emerald-500', // Status indicator style
          inactiveDepth0: 'text-neutral-400 hover:bg-neutral-900 hover:text-emerald-200',
          activeDepth1: 'text-emerald-400 font-bold',
          inactiveDepth1: 'text-neutral-500 hover:text-emerald-200'
        },
        logoText: 'text-neutral-200',
        storeText: 'text-emerald-500'
      };
    }

    // Default SCY - Original Slate & Amber
    return {
      sidebarBg: 'bg-slate-900',
      sidebarText: 'text-white',
      divider: 'border-white/10',
      item: {
        activeDepth0: 'bg-amber-500 text-black',
        inactiveDepth0: 'text-slate-300 hover:bg-slate-800',
        activeDepth1: 'text-amber-500',
        inactiveDepth1: 'text-slate-400 hover:text-white'
      },
      logoText: 'text-slate-300',
      storeText: 'text-amber-500'
    };
  };

  const theme = getTheme();

  return (
    <div className={`flex flex-col h-full w-full ${theme.sidebarBg} ${theme.sidebarText} shadow-2xl transition-colors duration-500`}>
      <div className={`p-4 border-b ${theme.divider} flex flex-col items-center relative transition-all duration-300`}>
        {/* Desktop Toggle Button */}
        <button 
          onClick={toggleCollapse} 
          className={`hidden md:block absolute top-4 ${isCollapsed ? 'left-1/2 transform -translate-x-1/2' : 'right-4'} ${theme.logoText} hover:opacity-80 z-10`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <Menu size={20} />
        </button>

        {!isCollapsed ? (
          <div className="mt-6 flex flex-col items-center w-full">
            <img src="/logo.svg" alt="Expo City Dubai" className="h-14 w-auto" />
            <p className={`text-sm ${theme.logoText} mt-3 text-center font-medium`}>{user?.name}</p>
            <p className={`text-xs ${theme.storeText} font-bold uppercase tracking-wider text-center mt-1`}>{activeStore?.name || user?.role}</p>
          </div>
        ) : (
          <div className="mt-10 flex justify-center w-full">
             <img src="/logo.svg" alt="Expo City Dubai" className="h-8 w-auto" />
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 custom-scrollbar flex flex-col">
        <ul className="space-y-2 px-2 flex-1">
          {mainNavItems.map((item) => (
            <li key={item.name}>
              <SidebarItem 
                item={item} 
                openSubMenu={openSubMenu}
                toggleSubMenu={toggleSubMenu}
                location={location}
                onClose={onClose}
                isActive={isActive}
                isCollapsed={isCollapsed}
                theme={theme}
              />
            </li>
          ))}
        </ul>

        {/* Events Section - Pinned to Bottom */}
        {filteredEvents.map((item) => (
          <div key={item.name} className={`px-2 mt-2 pt-2 border-t ${theme.divider}`}>
            <SidebarItem 
              item={item} 
              openSubMenu={openSubMenu}
              toggleSubMenu={toggleSubMenu}
              location={location}
              onClose={onClose}
              isActive={isActive}
              isCollapsed={isCollapsed}
              theme={theme}
            />
          </div>
        ))}
      </nav>

      <div className={`p-2 border-t ${theme.divider} bg-black/20`}>
        {user?.role === 'Super Admin' && (
          <Link
            to="/portal"
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} w-full py-3 ${theme.storeText} hover:bg-black/10 rounded-lg transition-colors mb-2`}
            title="Switch Store"
          >
            <Store size={20} />
            {!isCollapsed && <span>Switch Store</span>}
          </Link>
        )}
        <button
          onClick={() => setIsPasswordModalOpen(true)}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} w-full py-3 ${theme.sidebarText} hover:bg-black/10 rounded-lg transition-colors mb-1`}
          title="Change Password"
        >
          <Lock size={20} />
          {!isCollapsed && <span>Change Password</span>}
        </button>

        <button
          onClick={logout}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} w-full py-3 text-red-400 hover:bg-black/10 rounded-lg transition-colors`}
          title="Logout"
        >
          <LogOut size={20} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>

      <ChangePasswordModal 
        isOpen={isPasswordModalOpen} 
        onClose={() => setIsPasswordModalOpen(false)} 
      />
    </div>
  );
};

Sidebar.propTypes = {
  onClose: PropTypes.func,
  isCollapsed: PropTypes.bool,
  toggleCollapse: PropTypes.func
};

export default Sidebar;
