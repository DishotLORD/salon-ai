'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      console.log('Logged in:', data.user?.email)
      window.location.replace('/dashboard')
    }
  }

  const handleSignUp = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setError('Аккаунт создан! Теперь войдите.')
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: 'linear-gradient(145deg, #0a0a1a 0%, #1a0a2e 100%)',
        padding: '26px 28px 18px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 680,
          height: 680,
          borderRadius: '50%',
          background: 'rgba(124, 58, 237, 0.36)',
          filter: 'blur(88px)',
          top: -220,
          left: -200,
          pointerEvents: 'none',
          animation: 'blobPulseA 24s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 620,
          height: 620,
          borderRadius: '50%',
          background: 'rgba(236, 72, 153, 0.32)',
          filter: 'blur(84px)',
          top: '12%',
          right: -210,
          pointerEvents: 'none',
          animation: 'blobPulseB 28s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 560,
          height: 560,
          borderRadius: '50%',
          background: 'rgba(79, 70, 229, 0.3)',
          filter: 'blur(82px)',
          bottom: -180,
          left: '26%',
          pointerEvents: 'none',
          animation: 'blobPulseC 22s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'rgba(6, 182, 212, 0.26)',
          filter: 'blur(76px)',
          bottom: -120,
          right: '20%',
          pointerEvents: 'none',
          animation: 'blobPulseD 30s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 620,
          height: 620,
          top: '4%',
          left: '-5%',
          backgroundImage: 'url(/salon.png)',
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.2,
          filter: 'invert(1) brightness(2)',
          pointerEvents: 'none',
          transformOrigin: 'center',
          animation: 'sketchDriftA 26s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 520,
          height: 520,
          top: '6%',
          right: '-3%',
          backgroundImage: 'url(/restaurant.png)',
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.17,
          filter: 'invert(1) brightness(2)',
          pointerEvents: 'none',
          transformOrigin: 'center',
          animation: 'sketchDriftB 30s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          bottom: '8%',
          left: '2%',
          backgroundImage: 'url(/coffee.png)',
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.15,
          filter: 'invert(1) brightness(2)',
          pointerEvents: 'none',
          transformOrigin: 'center',
          animation: 'sketchDriftC 24s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 700,
          bottom: '-2%',
          right: '-7%',
          backgroundImage: 'url(/dental.png)',
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.18,
          filter: 'invert(1) brightness(2)',
          pointerEvents: 'none',
          transformOrigin: 'center',
          animation: 'sketchDriftD 28s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          pointerEvents: 'none',
        }}
      />
      <main
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 460,
            borderRadius: 20,
            border: '1px solid #e5e7eb',
            background: '#ffffff',
            padding: '28px 28px 24px',
            boxShadow: '0 22px 42px rgba(15, 23, 42, 0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#dc2626',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: '0.03em',
              }}
            >
              SA
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Salon AI</div>
          </div>

          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#111827' }}>
            Welcome Back
          </h1>
          <p style={{ margin: '8px 0 0', color: '#6b7280', fontSize: 14 }}>Securely access your dashboard</p>

          <div style={{ marginTop: 20 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: '#4b5563',
                letterSpacing: '0.04em',
                marginBottom: 6,
              }}
            >
              BUSINESS EMAIL
            </label>
            <input
              type="email"
              placeholder="name@business.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginBottom: 14,
                padding: '12px 13px',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                fontSize: 14,
                outline: 'none',
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#4b5563',
                  letterSpacing: '0.04em',
                }}
              >
                PASSWORD
              </label>
              <a href="#" style={{ fontSize: 12, color: '#6b7280', textDecoration: 'none' }}>
                Forgot Password?
              </a>
            </div>

            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginBottom: 12,
                padding: '12px 13px',
                borderRadius: 10,
                border: '1px solid #d1d5db',
                fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {error && <p style={{ color: '#dc2626', margin: '0 0 12px', fontSize: 14 }}>{error}</p>}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 10,
              padding: '12px 14px',
              background: '#dc2626',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.72 : 1,
            }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>

          <div
            style={{
              margin: '16px 0 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#9ca3af',
              fontSize: 12,
            }}
          >
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <span>Or continue with</span>
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              type="button"
              style={{
                borderRadius: 10,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                padding: '10px 12px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Google
            </button>
            <button
              type="button"
              style={{
                borderRadius: 10,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                padding: '10px 12px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Apple
            </button>
          </div>

          <p style={{ margin: '16px 0 0', fontSize: 13, color: '#6b7280', textAlign: 'center' }}>
            New to Salon AI?{' '}
            <button
              type="button"
              onClick={handleSignUp}
              disabled={loading}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                padding: 0,
              }}
            >
              Sign up for a 14-day trial
            </button>
          </p>
        </div>
      </main>

      <footer
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          color: '#6b7280',
          fontSize: 12,
          paddingTop: 10,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <span>&copy; 2024 SALON AI</span>
        <div style={{ display: 'flex', gap: 14 }}>
          <a href="#" style={{ color: '#6b7280', textDecoration: 'none' }}>
            PRIVACY
          </a>
          <a href="#" style={{ color: '#6b7280', textDecoration: 'none' }}>
            TERMS
          </a>
          <a href="#" style={{ color: '#6b7280', textDecoration: 'none' }}>
            SECURITY
          </a>
        </div>
      </footer>
      <style>{`
        @keyframes blobPulseA {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(56px, -34px, 0) scale(1.12); }
        }

        @keyframes blobPulseB {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-42px, 28px, 0) scale(1.08); }
        }

        @keyframes blobPulseC {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(40px, -26px, 0) scale(1.1); }
        }

        @keyframes blobPulseD {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-28px, -24px, 0) scale(1.09); }
        }

        @keyframes sketchDriftA {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-3deg); }
          50% { transform: translate3d(24px, -16px, 0) rotate(3deg); }
        }

        @keyframes sketchDriftB {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(4deg); }
          50% { transform: translate3d(-22px, 18px, 0) rotate(-4deg); }
        }

        @keyframes sketchDriftC {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-2deg); }
          50% { transform: translate3d(18px, -20px, 0) rotate(4deg); }
        }

        @keyframes sketchDriftD {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(3deg); }
          50% { transform: translate3d(-20px, -18px, 0) rotate(-3deg); }
        }
      `}</style>
    </div>
  )
}