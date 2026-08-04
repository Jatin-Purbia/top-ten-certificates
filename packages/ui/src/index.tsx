import * as React from 'react';

export function Button({ className = '', variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Card({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) { return <section className={`card ${className}`} {...props} />; }
export function Field({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = props.id ?? props.name;
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} aria-invalid={!!error} {...props} />{error && <small role="alert">{error}</small>}</label>;
}
