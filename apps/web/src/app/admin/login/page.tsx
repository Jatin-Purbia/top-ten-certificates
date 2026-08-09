'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field } from '@pathey/ui';
import { apiUrl } from '@/lib/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const response = await fetch(apiUrl('/admin/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = await response
      .json()
      .catch(() => ({ error: { message: 'The server returned an unreadable response.' } }));
    if (!response.ok) {
      setError(json.error?.message ?? 'Sign-in failed');
      return;
    }
    localStorage.setItem('admin_token', json.data.token);
    router.push('/admin');
  };

  return (
    <main className="public-page">
      <Card style={{ width: 'min(460px,100%)' }}>
        <div className="brand" style={{ color: 'var(--navy)' }}>
          <span className="brand-mark" />
          पाथेय कण
        </div>
        <h1>Administrator sign in</h1>
        <p style={{ color: 'var(--muted)' }}>Use your administrator email and password.</p>
        {error && (
          <p className="notice notice-danger" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit">Sign in</Button>
        </form>
      </Card>
    </main>
  );
}
