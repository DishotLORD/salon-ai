export default function PaymentCancelledPage() {
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
            background: 'rgba(245,158,11,0.12)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="8" x2="12" y2="13" />
            <circle cx="12" cy="16.5" r="0.5" fill="#d97706" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Payment not completed</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
          Your deposit was not charged. Your reservation is still held — you can retry the
          payment link from the chat, or contact the restaurant directly.
        </p>
      </div>
    </main>
  )
}
