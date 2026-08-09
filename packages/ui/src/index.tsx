import * as React from 'react';
import { createContext, useCallback, useContext, useState } from 'react';

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

type ConfirmOptions = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type ConfirmRequest = ConfirmOptions & { message: string; resolve: (value: boolean) => void };
const ConfirmContext = createContext<((message: string, options?: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Renders a styled modal in place of `window.confirm()`, which looks like a
 * raw OS dialog rather than part of the app. `window.confirm` is
 * synchronous; a React modal isn't (it waits for a click across render
 * cycles), so this exposes the same "await a yes/no" shape via a Promise
 * instead — `useConfirm()` returns a function callers can `await` exactly
 * where they used to call `confirm(...)`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ message, resolve, ...options });
    });
  }, []);
  const respond = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) respond(false);
          }}
        >
          <div
            className="modal confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <h2 id="confirm-dialog-title">{request.title ?? 'Please confirm'}</h2>
            <p>{request.message}</p>
            <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
              <Button type="button" variant="secondary" onClick={() => respond(false)}>
                {request.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                type="button"
                variant={request.danger ? 'danger' : 'primary'}
                onClick={() => respond(true)}
              >
                {request.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
