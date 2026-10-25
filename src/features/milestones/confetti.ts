/** The marigold and a few branch colours (DESIGN §21.3). */
const COLORS = [
  'var(--highlight)',
  'var(--branch-1)',
  'var(--branch-2)',
  'var(--branch-3)',
  'var(--branch-5)',
  'var(--branch-7)',
];
const PIECES = 36;
const LIFETIME_MS = 1800;

/**
 * A short burst of confetti from the middle of the screen (UX-04). Drawn outside React
 * and removed when it ends; nothing at all with reduced motion.
 */
export function burstConfetti(): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < PIECES; index++) {
    const piece = document.createElement('span');
    const angle = (index / PIECES) * 2 * Math.PI + Math.random() * 0.3;
    const distance = 120 + Math.random() * 160;
    piece.style.setProperty('--x', `${Math.round(Math.cos(angle) * distance)}px`);
    piece.style.setProperty('--y', `${Math.round(Math.sin(angle) * distance - 60)}px`);
    piece.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.background = COLORS[index % COLORS.length]!;
    piece.style.animationDelay = `${Math.round(Math.random() * 120)}ms`;
    layer.append(piece);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), LIFETIME_MS);
}
