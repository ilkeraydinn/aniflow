import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'accent' | 'success' | 'outline';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  className = ''
}) => {
  let bg = 'var(--color-badge-bg)';
  let color = 'var(--color-badge-text)';
  let border = '1px solid transparent';

  if (variant === 'accent') {
    bg = 'var(--color-primary)';
    color = 'var(--color-primary-inverse)';
  } else if (variant === 'success') {
    bg = 'var(--color-success-bg)';
    color = 'var(--color-success)';
    border = '1px solid var(--color-success)';
  } else if (variant === 'outline') {
    bg = 'transparent';
    color = 'var(--color-secondary)';
    border = '1px solid var(--color-border)';
  }

  return (
    <span
      className={`font-mono ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 500,
        lineHeight: 1.2,
        backgroundColor: bg,
        color: color,
        border: border,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap'
      }}
    >
      {children}
    </span>
  );
};
