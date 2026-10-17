/**
 * Computes a vibrant, visible aura color for anime cards.
 * If AniList returns null/undefined or an invisible dark/washed-out color,
 * it returns a reliable, energetic color so hover auras always shine.
 */
export function getAnimeAuraColor(color?: string | null, mediaId?: number | string): string {
  const FALLBACK_PALETTE = [
    '#02a9ff', // AniFlow Neon Blue
    '#f59e0b', // Amber / Gold
    '#ec4899', // Pink
    '#8b5cf6', // Violet
    '#10b981', // Emerald
    '#06b6d4', // Cyan
    '#f97316'  // Orange
  ];

  const getFallback = () => {
    if (mediaId !== undefined && mediaId !== null) {
      const num = typeof mediaId === 'number' ? mediaId : parseInt(String(mediaId), 10);
      if (!isNaN(num)) {
        return FALLBACK_PALETTE[Math.abs(num) % FALLBACK_PALETTE.length];
      }
    }
    return '#02a9ff';
  };

  if (!color || typeof color !== 'string' || !color.trim()) {
    return getFallback();
  }

  const clean = color.trim().toLowerCase();

  // If hex code
  if (clean.startsWith('#')) {
    const raw = clean.slice(1);
    if (raw.length === 3 || raw.length === 6) {
      const r = parseInt(raw.length === 3 ? raw[0] + raw[0] : raw.slice(0, 2), 16);
      const g = parseInt(raw.length === 3 ? raw[1] + raw[1] : raw.slice(2, 4), 16);
      const b = parseInt(raw.length === 3 ? raw[2] + raw[2] : raw.slice(4, 6), 16);

      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        // Luminance calculation
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;

        // If too dark (pitch black or dark gray < 0.14) -> invisible on dark cards
        if (lum < 0.14) {
          return getFallback();
        }

        // If pure desaturated white/gray (lum > 0.88 with no saturation) -> give it an icy blue sheen
        if (lum > 0.88 && sat < 0.15) {
          return '#70c5ff'; // Icy electric blue glow
        }
      }
    }
  }

  return clean;
}
