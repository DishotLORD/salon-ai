export default function DashboardLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f3f4f6',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: '3px solid #fecaca',
          borderTopColor: '#dc2626',
          animation: 'spin 0.9s linear infinite',
        }}
      />
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
