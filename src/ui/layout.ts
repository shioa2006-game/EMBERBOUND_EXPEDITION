/** Keep camp controls usable on short screens without integer pixel-art scaling. */
export function campSceneHeight(viewportHeight: number): number {
  return Math.round(Math.max(64, Math.min(180, viewportHeight * 0.3 - 84)));
}
