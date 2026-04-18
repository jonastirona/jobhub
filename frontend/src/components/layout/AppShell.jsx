import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useReminders } from '../../hooks/useReminders';
import ReminderPanel from '../ReminderPanel/ReminderPanel';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import './AppShell.css';

function isToday(isoString) {
  if (!isoString) return false;
  const datePart = isoString.split('T')[0];
  const d = new Date(`${datePart}T00:00:00`);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export default function AppShell({ title, children }) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;
  const { reminders, refetch } = useReminders(accessToken);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dueTodayDismissed, setDueTodayDismissed] = useState(false);

  const pending = reminders.filter((r) => !r.completed_at);
  const dueToday = pending.filter((r) => isToday(r.due_date));
  const showAlert = dueToday.length > 0 && !dueTodayDismissed;

  useEffect(() => {
    setDueTodayDismissed(false);
  }, [reminders]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell-main">
        <TopBar
          title={title}
          notificationCount={pending.length}
          onBellClick={() => setPanelOpen(true)}
        />
        {showAlert && (
          <div className="app-shell-alert">
            <span>
              🔔 You have {dueToday.length} reminder{dueToday.length > 1 ? 's' : ''} due today.
            </span>
            <div className="app-shell-alert-actions">
              <button
                type="button"
                className="app-shell-alert-btn"
                onClick={() => setPanelOpen(true)}
              >
                View
              </button>
              <button
                type="button"
                className="app-shell-alert-dismiss"
                onClick={() => setDueTodayDismissed(true)}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        <main className="app-shell-content">{children}</main>
      </div>

      {panelOpen && (
        <ReminderPanel
          accessToken={accessToken}
          reminders={reminders}
          onClose={() => setPanelOpen(false)}
          onRefetch={refetch}
        />
      )}
    </div>
  );
}
