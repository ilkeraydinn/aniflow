import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outlined' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontWeight: 500,
    fontSize: size === 'sm' ? '12px' : size === 'lg' ? '14px' : '13px',
    lineHeight: 1,
    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease',
    width: fullWidth ? '100%' : 'auto',
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.5 : 1,
    outline: 'none',
    boxSizing: 'border-box'
  };

  let variantStyles: React.CSSProperties = {};

  if (variant === 'primary') {
    variantStyles = {
      backgroundColor: 'var(--color-primary)',
      color: 'var(--color-primary-inverse)',
      border: '1px solid var(--color-primary)',
      padding: size === 'sm' ? '8px 12px' : '11px 16px',
      fontWeight: 600
    };
  } else if (variant === 'secondary') {
    variantStyles = {
      backgroundColor: 'var(--color-badge-bg)',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-border)',
      padding: size === 'sm' ? '8px 12px' : '11px 16px'
    };
  } else if (variant === 'outlined') {
    variantStyles = {
      backgroundColor: 'transparent',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-border)',
      padding: size === 'sm' ? '8px 12px' : '11px 16px'
    };
  } else if (variant === 'ghost') {
    variantStyles = {
      backgroundColor: 'transparent',
      color: 'var(--color-secondary)',
      border: '1px solid transparent',
      padding: size === 'sm' ? '6px 10px' : '8px 12px'
    };
  } else if (variant === 'icon') {
    variantStyles = {
      width: '40px',
      height: '40px',
      minWidth: '40px',
      minHeight: '40px',
      padding: 0,
      backgroundColor: 'var(--color-badge-bg)',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-border)'
    };
  }

  const variantClass = `btn-${variant}`;
  const combinedClassName = `${variantClass} ${className}`.trim();

  return (
    <button
      style={{
        ...baseStyles,
        ...variantStyles,
        ...style
      }}
      className={combinedClassName}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span
          style={{
            display: 'inline-block',
            width: '14px',
            height: '14px',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite'
          }}
        />
      ) : null}
      {children}
    </button>
  );
};

