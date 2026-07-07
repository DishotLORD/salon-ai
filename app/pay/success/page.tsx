export default function PaymentSuccessPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f8fafc',
        fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 24px rgba(15,23,42,0.06)',
          padding: '40px 36px',
          maxWidth: 420,
          textAlign: 'center',
          display: 'grid',
          gap: 12,
          justifyItems: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(34,197,94,0.12)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Deposit received</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
          Thank you! Your reservation deposit has been paid and your booking is confirmed.
          You can close this window.
        </p>
      </div>
    </main>
  )
}
