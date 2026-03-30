import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/jobhub_logo.svg';
import './Sidebar.css';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: '📊', path: '/dashboard' },
  { label: 'Profile', icon: '👤', path: '/profile' },
  { label: 'Documents', icon: '📋', path: '/documents' },
  { label: 'Settings', icon: '⚙️', path: '/settings' },
];

export default function Sidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={logo} alt="JobHub" className="sidebar-logo" />
      </div>

      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <NavLink to={item.path} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <button type="button" onClick={handleLogout} aria-label="Logout">
          <span className="nav-icon">🚪</span>
          Logout
        </button>
      </div>
    </aside>
  );
}
