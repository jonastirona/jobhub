import Sidebar from './Sidebar';
import TopBar from './TopBar';
import './AppShell.css';

export default function AppShell({ title, notificationCount = 0, children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell-main">
        <TopBar title={title} notificationCount={notificationCount} />
        <main className="app-shell-content">{children}</main>
      </div>
    </div>
  );
}
