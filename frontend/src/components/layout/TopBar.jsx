import { useAuth } from '../../context/AuthContext';
import { useProfileAvatar } from '../../context/ProfileAvatarContext';
import './TopBar.css';

function getInitials(email) {
  if (!email) return 'U';
  const parts = email.split('@')[0].split(/[._-]/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function TopBar({ title, notificationCount, onBellClick }) {
  const { user } = useAuth();
  const { avatarPreviewUrl } = useProfileAvatar();
  const initials = getInitials(user?.email);
  const displayName = user?.email?.split('@')[0] ?? 'User';

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-right">
        <div className="search-box">
          <span className="search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search jobs, companies..."
            aria-label="Search jobs and companies"
          />
        </div>

        <button type="button" className="notif-btn" aria-label="Reminders" onClick={onBellClick}>
          🔔
          {notificationCount > 0 && <span className="notif-badge">{notificationCount}</span>}
        </button>

        <div className="user-pill">
          <div className={`user-avatar${avatarPreviewUrl ? ' user-avatar--photo' : ''}`}>
            {avatarPreviewUrl ? (
              <img src={avatarPreviewUrl} alt="" className="user-avatar-img" />
            ) : (
              initials
            )}
          </div>
          <div className="user-info">
            <span className="user-name">{displayName}</span>
            <span className="user-role">Job Seeker</span>
          </div>
        </div>
      </div>
    </header>
  );
}
