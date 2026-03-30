import { useAuth } from '../../context/AuthContext';
import './TopBar.css';

function getInitials(email) {
  if (!email) return 'U';
  const parts = email.split('@')[0].split(/[._-]/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function TopBar({ title, notificationCount }) {
  const { user } = useAuth();
  const initials = getInitials(user?.email);
  const displayName = user?.email?.split('@')[0] ?? 'User';

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-right">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input type="text" placeholder="Search jobs, companies..." />
        </div>

        <button type="button" className="notif-btn" aria-label="Notifications">
          🔔
          {notificationCount > 0 && <span className="notif-badge">{notificationCount}</span>}
        </button>

        <div className="user-pill">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-role">Job Seeker</span>
          </div>
        </div>
      </div>
    </header>
  );
}
