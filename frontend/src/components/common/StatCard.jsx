import './StatCard.css';

export default function StatCard({ icon, label, value, trend, trendDirection, accentClass, bars }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon-wrap ${accentClass}`}>{icon}</div>

      <div className="stat-text">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        <div className={`stat-trend ${trendDirection}`}>
          {trendDirection === 'up' ? '▲' : '▼'} {trend}
        </div>
      </div>

      <div className="mini-chart" aria-hidden="true">
        {bars.map((bar, index) => (
          <div
            key={index}
            className="mini-bar"
            style={{ height: `${bar.height}px`, background: bar.color }}
          />
        ))}
      </div>
    </div>
  );
}
