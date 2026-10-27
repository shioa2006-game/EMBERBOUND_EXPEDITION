/**
 * Inkstone — 表示の DPR (SideRenderer と CharacterView が共有する)
 */
/** ブラウザの devicePixelRatio (実験C〜Eと同じく最大 2) */
export const defaultDpr = () => Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
