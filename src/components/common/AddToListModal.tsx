import React, { useState, useEffect } from 'react';
import { NormalizedAnimeItem, MediaListStatus } from '../../types';
import { X, Eye, Clock, Check, PauseCircle, XCircle, Loader2, BookmarkPlus, BookOpen } from 'lucide-react';

interface AddToListModalProps {
  anime: NormalizedAnimeItem | null;
  isOpen: boolean;
  currentStatus?: MediaListStatus | null;
  onClose: () => void;
  onSelectStatus: (anime: NormalizedAnimeItem, status: MediaListStatus) => Promise<boolean>;
}

interface StatusOption {
  status: MediaListStatus;
  label: string;
  description: string;
  icon: React.ReactNode;
  activeColor: string;
  activeBg: string;
}

const getStatusOptions = (isManga: boolean): StatusOption[] => [
  {
    status: 'CURRENT',
    label: isManga ? 'Reading' : 'Watching',
    description: isManga ? 'Currently reading this manga' : 'Currently watching, tracks progress on Home tab',
    icon: isManga ? <BookOpen size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />,
    activeColor: 'var(--color-watching)',
    activeBg: 'var(--color-watching-bg)'
  },
  {
    status: 'PLANNING',
    label: isManga ? 'Plan to Read' : 'Planning',
    description: isManga ? 'Plan to read in the future' : 'Plan to watch in the future',
    icon: <Clock size={18} strokeWidth={2.5} />,
    activeColor: 'var(--color-planning)',
    activeBg: 'var(--color-planning-bg)'
  },
  {
    status: 'COMPLETED',
    label: 'Completed',
    description: isManga ? 'Finished reading all chapters' : 'Finished watching all episodes',
    icon: <Check size={18} strokeWidth={2.5} />,
    activeColor: 'var(--color-success)',
    activeBg: 'var(--color-success-bg)'
  },
  {
    status: 'PAUSED',
    label: 'Paused',
    description: 'Temporarily on hold',
    icon: <PauseCircle size={18} strokeWidth={2.5} />,
    activeColor: 'var(--color-paused)',
    activeBg: 'var(--color-paused-bg)'
  },
  {
    status: 'DROPPED',
    label: 'Dropped',
    description: isManga ? 'Stopped reading before finishing' : 'Stopped watching before finishing',
    icon: <XCircle size={18} strokeWidth={2.5} />,
    activeColor: 'var(--color-error)',
    activeBg: 'var(--color-error-bg)'
  }
];

const AddToListModalComponent: React.FC<AddToListModalProps> = ({
  anime,
  isOpen,
  currentStatus,
  onClose,
  onSelectStatus
}) => {
  const [savingStatus, setSavingStatus] = useState<MediaListStatus | null>(null);

  // Close on ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !savingStatus) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, savingStatus, onClose]);

  if (!isOpen || !anime) return null;

  const isManga =
    anime.type === 'MANGA' ||
    anime.format === 'MANGA' ||
    anime.format === 'NOVEL' ||
    anime.format === 'ONE_SHOT';
  const statusOptions = getStatusOptions(isManga);

  const effectiveCurrentStatus =
    currentStatus ??
    anime.userStatus ??
    (anime.status === 'CURRENT' ? 'CURRENT' : null);

  const handleSelect = async (status: MediaListStatus) => {
    if (savingStatus) return;
    setSavingStatus(status);
    try {
      const success = await onSelectStatus(anime, status);
      if (success) {
        onClose();
      }
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-modal-title"
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
        if (e.target === e.currentTarget && !savingStatus) {
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
            <BookmarkPlus size={16} color="var(--color-primary)" />
            <h2
              id="add-modal-title"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-primary)',
                margin: 0
              }}
            >
              {effectiveCurrentStatus ? 'Change List Status' : 'Add to AniList'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!!savingStatus}
            aria-label="Close"
            title="Close"
            className="card-icon-btn-subtle"
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: 'var(--color-input-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-secondary)',
              cursor: savingStatus ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '7px'
            }}
          >
            <X size={15} />
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
              width: '40px',
              height: '56px',
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
                fontSize: '13.5px',
                fontWeight: 600,
                color: 'var(--color-primary)',
                margin: '0 0 5px 0',
                lineHeight: 1.25
              }}
            >
              {anime.title}
            </h3>
            {(() => {
              const formatLabel = anime.format
                ? anime.format.replace(/_/g, ' ')
                : isManga
                  ? 'Manga'
                  : 'Anime';
              const countLabel =
                isManga && anime.chapters
                  ? `${anime.chapters} ch`
                  : anime.episodes
                    ? `${anime.episodes} eps`
                    : null;
              const yearLabel = anime.seasonYear ? String(anime.seasonYear) : null;
              const metaParts = [formatLabel, countLabel, yearLabel].filter(Boolean) as string[];

              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '5.5px',
                    fontSize: '11.5px',
                    color: 'var(--color-secondary)',
                    lineHeight: 1.1,
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {metaParts.map((part, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 ? (
                        <span style={{ color: 'var(--color-tertiary)', fontSize: '9px', userSelect: 'none' }}>
                          •
                        </span>
                      ) : null}
                      <span style={{ fontWeight: 500 }}>{part}</span>
                    </React.Fragment>
                  ))}
                  {anime.averageScore ? (
                    <>
                      {metaParts.length > 0 ? (
                        <span style={{ color: 'var(--color-tertiary)', fontSize: '9px', userSelect: 'none' }}>
                          •
                        </span>
                      ) : null}
                      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3.5px' }}>
                        <span style={{ color: 'var(--color-secondary)' }}>AniList</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                          {anime.averageScore}%
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Options List */}
        <div style={{ padding: '14px 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {statusOptions.map((opt) => {
            const isSelected = effectiveCurrentStatus === opt.status;
            const isCurrentSaving = savingStatus === opt.status;

            return (
              <button
                key={opt.status}
                type="button"
                onClick={() => handleSelect(opt.status)}
                disabled={!!savingStatus}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: isSelected
                    ? `1px solid ${opt.activeColor}`
                    : '1px solid var(--color-border)',
                  backgroundColor: isSelected
                    ? opt.activeBg
                    : 'var(--color-card)',
                  color: 'var(--color-primary)',
                  cursor: savingStatus ? 'default' : 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected && !savingStatus) {
                    e.currentTarget.style.borderColor = 'var(--color-border-hover)';
                    e.currentTarget.style.backgroundColor = 'var(--color-card-subtle)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !savingStatus) {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.backgroundColor = 'var(--color-card)';
                  }
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isSelected
                      ? `color-mix(in srgb, ${opt.activeColor} 15%, var(--color-input-bg))`
                      : 'var(--color-input-bg)',
                    border: isSelected
                      ? `1px solid color-mix(in srgb, ${opt.activeColor} 38%, var(--color-border))`
                      : '1px solid var(--color-border)',
                    color: isSelected ? opt.activeColor : 'var(--color-secondary)',
                    opacity: isSelected ? 1 : 0.72,
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {isCurrentSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    opt.icon
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: isSelected ? opt.activeColor : 'var(--color-primary)'
                      }}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-secondary)',
                      display: 'block',
                      marginTop: '2px',
                      lineHeight: 1.2
                    }}
                  >
                    {opt.description}
                  </span>
                </div>

                {isSelected ? (
                  <Check size={16} strokeWidth={2.5} color={opt.activeColor} style={{ flexShrink: 0 }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AddToListModal = React.memo(AddToListModalComponent);
