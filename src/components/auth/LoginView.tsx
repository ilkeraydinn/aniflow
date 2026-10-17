import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { KeyRound, ExternalLink, ArrowRight, ShieldCheck } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { loginWithOAuth, loginWithToken, isLoading, error, clearError } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const handleOAuth = async () => {
    setCustomError(null);
    clearError();
    try {
      await loginWithOAuth();
    } catch {
      // Error handled in AuthContext or fallback to token
      setShowTokenInput(true);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setCustomError('Please enter an AniList Personal Access Token.');
      return;
    }
    setCustomError(null);
    clearError();
    try {
      await loginWithToken(tokenInput.trim());
    } catch (err: unknown) {
      setCustomError(err instanceof Error ? err.message : 'Invalid AniList token.');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '32px 24px 24px 24px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        overflowX: 'hidden',
        justifyContent: 'space-between'
      }}
    >
      {/* Brand Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(2, 169, 255, 0.25), 0 2px 6px rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0c0d0e'
          }}
        >
          <img
            src="/icons/icon128.png"
            alt="AniFlow"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h1
              style={{
                fontSize: '22px',
                fontWeight: 600,
                letterSpacing: '-0.02em',
                color: 'var(--color-primary)',
                margin: 0
              }}
            >
              AniFlow
            </h1>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: '6px',
                backgroundColor: 'var(--color-badge-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-primary)'
              }}
            >
              v2.0
            </span>
          </div>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-secondary)',
              lineHeight: 1.45,
              margin: 0
            }}
          >
            Fluid & ambient anime companion for AniList. Manage watch progress, explore seasons, and track statistics.
          </p>
        </div>
      </div>

      {/* Main Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '24px 0' }}>
        {error || customError ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-error-bg)',
              color: 'var(--color-error)',
              fontSize: '12px',
              lineHeight: 1.4,
              border: '1px solid var(--color-error)'
            }}
          >
            {customError || error}
          </div>
        ) : null}

        {/* Primary OAuth Button */}
        <Button
          variant="primary"
          fullWidth={true}
          onClick={handleOAuth}
          isLoading={isLoading}
          aria-label="Connect with AniList"
          style={{ padding: '12px 18px', fontSize: '13px' }}
        >
          <span>{isLoading ? 'Authorizing...' : 'Connect with AniList'}</span>
          {!isLoading && <ArrowRight size={15} />}
        </Button>

        {isLoading ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-badge-bg)',
              color: 'var(--color-primary)',
              fontSize: '11.5px',
              textAlign: 'center',
              lineHeight: 1.4,
              border: '1px solid var(--color-border)'
            }}
          >
            Opening AniList tab... Click <strong>Authorize</strong> on the AniList page to log in.
          </div>
        ) : null}


        {/* Token Input Toggle */}
        {!showTokenInput ? (
          <button
            type="button"
            onClick={() => setShowTokenInput(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              color: 'var(--color-secondary)',
              fontSize: '12px',
              padding: '6px'
            }}
          >
            <KeyRound size={13} />
            <span>Or enter a Personal Access Token</span>
          </button>
        ) : (
          <form
            onSubmit={handleTokenSubmit}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '14px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-card)',
              border: '1px solid var(--color-border)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label
                htmlFor="anilist-token-input"
                style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-secondary)' }}
              >
                Personal Access Token
              </label>
              <a
                href="https://anilist.co/api/v2/oauth/authorize?client_id=52186&response_type=token"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '11px',
                  color: 'var(--color-primary)',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  textDecoration: 'none'
                }}
              >
                <span>Get Token</span>
                <ExternalLink size={10} />
              </a>
            </div>

            <input
              id="anilist-token-input"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste token or redirected URL..."
              autoComplete="off"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-input-bg)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-primary)',
                fontSize: '12px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            <span
              style={{
                fontSize: '10.5px',
                color: 'var(--color-secondary)',
                lineHeight: 1.3
              }}
            >
              Tip: Click <strong>Get Token</strong>, click Authorize, then paste the token or the redirected URL here.
            </span>

            <Button
              type="submit"
              variant="secondary"
              size="sm"
              fullWidth={true}
              isLoading={isLoading}
              style={{ marginTop: '2px' }}
            >
              Sign In with Token
            </Button>
          </form>

        )}
      </div>

      {/* Security Note Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--color-secondary)',
          fontSize: '11px',
          lineHeight: 1.3
        }}
      >
        <ShieldCheck size={14} style={{ flexShrink: 0 }} />
        <span>Your AniList password is never requested or stored. OAuth tokens are encrypted locally.</span>
      </div>
    </div>
  );
};
