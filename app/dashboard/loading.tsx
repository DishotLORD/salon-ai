export default function DashboardLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--t-bg-app)',
        color: 'var(--t-text-muted)',
        fontSize: 14,
      }}
    >
      Loading dashboard…
    </div>
  )
}
