import React from 'react';
import { ToastMessage } from '../../types';
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        left: '16px',
        right: '16px',
        zIndex: 10050,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none'
      }}
    >
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';

        return (
          <div
            key={toast.id}
            role="alert"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: isError
                ? 'color-mix(in srgb, var(--color-error) 14%, var(--color-card))'
                : isSuccess
                ? 'color-mix(in srgb, var(--color-success) 14%, var(--color-card))'
                : 'var(--color-card)',
              color: isError
                ? 'var(--color-error)'
                : isSuccess
                ? 'var(--color-success)'
                : 'var(--color-primary)',
              border: `1px solid ${
                isError
                  ? 'color-mix(in srgb, var(--color-error) 55%, var(--color-border))'
                  : isSuccess
                  ? 'color-mix(in srgb, var(--color-success) 55%, var(--color-border))'
                  : 'var(--color-border)'
              }`,
              boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.2)',
              fontSize: '12px',
              fontWeight: 500,
              lineHeight: 1.35
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isError ? (
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
              ) : isSuccess ? (
                <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              ) : (
                <Info size={15} style={{ flexShrink: 0 }} />
              )}
              <span>{toast.text}</span>
            </div>

            <button
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{
                color: 'currentColor',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.7,
                padding: '2px'
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
