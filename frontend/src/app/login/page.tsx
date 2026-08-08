'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeRef, setChallengeRef] = useState('');
  const [phoneMasked, setPhoneMasked] = useState('');
  const [step, setStep] = useState<'CREDENTIALS' | 'OTP'>('CREDENTIALS');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const url = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3006';
      const res = await fetch(`${url}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      const data = await res.json();
      if (res.ok && data.requiresOtp) {
        setChallengeRef(data.challengeRef);
        setPhoneMasked(data.phoneMasked);
        setStep('OTP');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const url = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3006';
      const res = await fetch(`${url}/auth/login/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeRef, code: otp })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push('/dashboard');
      } else {
        setError(data.error || 'Invalid login OTP');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Welcome Back</h1>
        <p>{step === 'CREDENTIALS' ? 'Sign in to access your digital tickets.' : `Enter the login OTP sent to ${phoneMasked}.`}</p>
        
        {error && <div className="error-alert">{error}</div>}
        
        {step === 'CREDENTIALS' ? <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Phone Number</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={(e) => setPhone(e.target.value)} 
              required 
              placeholder="017xxxxxxxx"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form> : <form onSubmit={handleVerifyOtp}>
          <div className="form-group">
            <label>Login OTP</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
              required
              placeholder="Enter SMS code"
            />
          </div>
          <button type="submit" disabled={loading || !otp} className="btn-primary">
            {loading ? 'Verifying...' : 'Verify OTP & Sign In'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: '12px' }}
            onClick={() => { setStep('CREDENTIALS'); setOtp(''); setError(''); }}
          >
            Use different credentials
          </button>
        </form>}
        <p className="auth-link">
          Don&apos;t have an account? <a href="/register">Register here</a>
        </p>
      </div>
    </div>
  );
}
