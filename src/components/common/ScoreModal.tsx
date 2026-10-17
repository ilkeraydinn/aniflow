import React, { useState, useEffect } from 'react';
import { NormalizedAnimeItem } from '../../types';
import { Star, X, Trash2, Check, Loader2 } from 'lucide-react';
import { Button } from './Button';

interface ScoreModalProps {
  anime: NormalizedAnimeItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (mediaId: number, score: number | null) => Promise<boolean>;
  onScoreUpdated?: (mediaId: number, score: number | null) => void;
}

const getScoreLabel = (score: number): string => {
  if (score >= 10) return 'Masterpiece (10/10)';
  if (score >= 9) return 'Great (9/10)';
  if (score >= 8) return 'Very Good (8/10)';
  if (score >= 7) return 'Good (7/10)';
  if (score >= 6) return 'Fine (6/10)';
  if (score >= 5) return 'Average (5/10)';
  if (score >= 4) return 'Bad (4/10)';
  if (score >= 1) return 'Very Bad (1-3/10)';
  return 'No score set';
};

export const ScoreModal: React.FC<ScoreModalProps> = ({
  anime,
  isOpen,
  onClose,
  onSave,
  onScoreUpdated
}) => {
  const [selectedScore, setSelectedScore] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sync state when modal opens or anime changes
  useEffect(() => {
    if (anime) {
      setSelectedScore(anime.userScore !== null && anime.userScore !== undefined ? anime.userScore : 0);
    }
  }, [anime, isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, onClose]);

  const handleSave = async (scoreToSave: number | null) => {
    if (!anime || isSaving) return;
    setIsSaving(true);
    try {
      const finalScore = scoreToSave !== null && scoreToSave > 0 ? scoreToSave : null;
      const success = await onSave(anime.mediaId, finalScore);
      if (success) {
        if (onScoreUpdated) {
          onScoreUpdated(anime.mediaId, finalScore);
        }
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjust = (delta: number) => {
    setSelectedScore((prev) => {
      const next = Math.round((prev + delta) * 10) / 10;
      if (next < 0) return 0;
      if (next > 10) return 10;
      return next;
    });
  };

  if (!isOpen || !anime) return null;

  const currentScoreFormatted = selectedScore > 0 ? selectedScore.toFixed(1) : '--';
  const hasExistingScore = anime.userScore !== null && anime.userScore !== undefined && anime.userScore > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: 'var(--color-card)',
          borderRadius: '16px',
          border: '1px solid var(--color-border)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Star size={16} fill="var(--color-accent)" color="var(--color-accent)" />
            <h2
              id="score-modal-title"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-primary)',
                margin: 0
              }}
            >
              Rate Anime
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-secondary)',
              cursor: isSaving ? 'default' : 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-secondary)';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Anime Mini Preview */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--color-input-bg)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <div
            style={{
              width: '36px',
              height: '50px',
              borderRadius: '6px',
              overflow: 'hidden',
              flexShrink: 0,
              border: '1px solid var(--color-border)'
            }}
          >
            <img
              src={anime.coverImage}
              alt={anime.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              className="line-clamp-2"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-primary)',
                margin: '0 0 4px 0',
                lineHeight: 1.25
              }}
            >
              {anime.title}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--color-secondary)' }}>
              <span>{anime.format || 'Anime'}</span>
              {anime.episodes ? <span>• {anime.episodes} eps</span> : null}
              {anime.userStatus ? <span>• {anime.userStatus}</span> : null}
            </div>
          </div>
        </div>

        {/* Modal Body: Score Hero & Selectors */}
        <div style={{ padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Big Score Display */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
              <Star
                size={24}
                fill={selectedScore > 0 ? '#f59e0b' : 'none'}
                color={selectedScore > 0 ? '#f59e0b' : 'var(--color-tertiary)'}
                style={{ transform: 'translateY(1px)' }}
              />
              <span
                className="font-mono"
                style={{
                  fontSize: '34px',
                  fontWeight: 700,
                  color: selectedScore > 0 ? 'var(--color-primary)' : 'var(--color-tertiary)',
                  letterSpacing: '-0.5px'
                }}
              >
                {currentScoreFormatted}
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: '16px',
                  fontWeight: 500,
                  color: 'var(--color-tertiary)'
                }}
              >
                / 10
              </span>
            </div>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: selectedScore > 0 ? 'var(--color-secondary)' : 'var(--color-tertiary)'
              }}
            >
              {getScoreLabel(selectedScore)}
            </span>
          </div>

          {/* Quick Integer Selector Buttons (1 to 10) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-secondary)', fontWeight: 500 }}>
              Quick Select
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(10, 1fr)',
                gap: '4px'
              }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isSelected = selectedScore === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSelectedScore(num)}
                    disabled={isSaving}
                    style={{
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: isSaving ? 'default' : 'pointer',
                      border: isSelected
                        ? '1px solid var(--color-primary)'
                        : '1px solid var(--color-border)',
                      backgroundColor: isSelected
                        ? 'var(--color-primary)'
                        : 'var(--color-card)',
                      color: isSelected
                        ? 'var(--color-card)'
                        : 'var(--color-primary)',
                      transition: 'all 0.1s ease',
                      fontFamily: 'JetBrains Mono, monospace'
                    }}
                  >
                    {num}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Decimal Fine-Tuning Slider & +/- 0.5 Adjusters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-secondary)', fontWeight: 500 }}>
                Fine Tune (Decimal Score)
              </span>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--color-tertiary)' }}>
                Step 0.5
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => handleAdjust(-0.5)}
                disabled={selectedScore <= 0 || isSaving}
                title="Decrease score by 0.5"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-input-bg)',
                  color: selectedScore <= 0 ? 'var(--color-tertiary)' : 'var(--color-primary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: selectedScore <= 0 || isSaving ? 'not-allowed' : 'pointer',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              >
                -0.5
              </button>

              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={selectedScore}
                disabled={isSaving}
                onChange={(e) => setSelectedScore(parseFloat(e.target.value))}
                className="score-slider"
                style={{
                  flex: 1,
                  background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${(selectedScore / 10) * 100}%, var(--color-progress-bg) ${(selectedScore / 10) * 100}%, var(--color-progress-bg) 100%)`,
                  cursor: isSaving ? 'default' : 'pointer'
                }}
              />

              <button
                type="button"
                onClick={() => handleAdjust(0.5)}
                disabled={selectedScore >= 10 || isSaving}
                title="Increase score by 0.5"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-input-bg)',
                  color: selectedScore >= 10 ? 'var(--color-tertiary)' : 'var(--color-primary)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: selectedScore >= 10 || isSaving ? 'not-allowed' : 'pointer',
                  fontFamily: 'JetBrains Mono, monospace'
                }}
              >
                +0.5
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-input-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          {hasExistingScore || selectedScore > 0 ? (
            <button
              type="button"
              onClick={() => handleSave(0)}
              disabled={isSaving}
              title="Remove score from AniList"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 10px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: 'transparent',
                color: 'var(--color-tertiary)',
                fontSize: '11px',
                fontWeight: 500,
                cursor: isSaving ? 'default' : 'pointer',
                transition: 'color 0.15s, border-color 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ef4444';
                e.currentTarget.style.borderColor = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-tertiary)';
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
          ) : (
            <div />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="outlined"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleSave(selectedScore)}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={13} />
                  <span>Save Score</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
