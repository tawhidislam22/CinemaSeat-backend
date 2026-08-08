'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AuthNav() {
  const [isLogged, setIsLogged] = useState(false);

  useEffect(() => {
    // Check initial state
    const token = localStorage.getItem('token');
    setIsLogged(!!token);

    // Add a simple listener for storage changes
    const handleStorageChange = () => {
      setIsLogged(!!localStorage.getItem('token'));
    };

    window.addEventListener('storage', handleStorageChange);
    // Periodically check (useful since we might navigate using router.push and not trigger 'storage' event)
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsLogged(false);
    window.location.href = '/login';
  };

  if (isLogged) {
    return (
      <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
        <Link href="/dashboard" className="btn btn-primary" style={{padding: '8px 20px'}}>Dashboard</Link>
        <button onClick={handleLogout} className="btn btn-secondary" style={{padding: '8px 20px'}}>Logout</button>
      </div>
    );
  }

  return (
    <div style={{display: 'flex', gap: '15px'}}>
      <Link href="/login" className="btn btn-secondary" style={{padding: '8px 20px'}}>Login</Link>
      <Link href="/register" className="btn btn-primary" style={{padding: '8px 20px'}}>Register</Link>
    </div>
  );
}
