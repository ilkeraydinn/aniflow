import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

interface Particle {
  id: number;
  tx: string;
  ty: string;
  tr: string;
  color: string;
  size: number;
  left: string;
  top: string;
  delay: string;
}

interface CelebrationOverlayProps {
  isActive: boolean;
  animeTitle?: string | null;
  onComplete: () => void;
}

const PARTICLE_COLORS = ['#10b981', '#34d399', '#f59e0b', '#fbbf24', '#fbf9f5', '#6ee7b7'];

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  isActive,
  animeTitle,
  onComplete
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!isActive) return;

    // Generate randomized particles bursting from corners and edges
    const newParticles: Particle[] = Array.from({ length: 24 }).map((_, i) => {
      const angle = (i / 24) * 360;
      const dist = 60 + Math.random() * 80;
      const rad = (angle * Math.PI) / 180;
      const tx = `${Math.cos(rad) * dist}px`;
      const ty = `${Math.sin(rad) * dist - 30}px`;
      const tr = `${(Math.random() - 0.5) * 480}deg`;
      const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
      const size = 4 + Math.random() * 5;
      const left = `${30 + Math.random() * 40}%`;
      const top = `${35 + Math.random() * 30}%`;
      const delay = `${Math.random() * 0.15}s`;

      return { id: i, tx, ty, tr, color, size, left, top, delay };
    });

    setParticles(newParticles);

    const timer = setTimeout(() => {
      onComplete();
    }, 3600);

    return () => clearTimeout(timer);
  }, [isActive, onComplete]);

  if (!isActive) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      {/* Edge Aurora Glow Wave */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          animation: 'celebrationAuraPulse 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      />

      {/* Floating Sparkle Particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          style={
            {
              position: 'absolute',
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: p.id % 3 === 0 ? '2px' : '50%',
              backgroundColor: p.color,
              boxShadow: `0 0 8px ${p.color}`,
              '--tx': p.tx,
              '--ty': p.ty,
              '--tr': p.tr,
              animation: `celebrationParticleBurst 1.2s cubic-bezier(0.16, 1, 0.3, 1) ${p.delay} forwards`
            } as React.CSSProperties
          }
        />
      ))}

      {/* Completion Pill Display */}
      {animeTitle ? (
        <div
          style={{
            position: 'absolute',
            bottom: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-primary)',
            padding: '9px 18px',
            borderRadius: '24px',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.01em',
            boxShadow: '0 8px 28px rgba(16, 185, 129, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3)',
            border: '1px solid #10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            whiteSpace: 'nowrap',
            animation: 'celebrationPillFade 3.6s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
        >
          <Check size={14} strokeWidth={2.5} style={{ color: '#10b981', flexShrink: 0 }} />
          <span>Completed: {animeTitle}</span>
        </div>
      ) : null}
    </div>
  );
};
