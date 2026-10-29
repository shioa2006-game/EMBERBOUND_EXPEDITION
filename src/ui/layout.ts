/** Keep camp controls usable on short screens without integer pixel-art scaling. */
export function campSceneHeight(viewportHeight: number): number {
  return Math.round(Math.max(64, Math.min(180, viewportHeight * 0.3 - 84)));
}

/** Phones held upright: the layouts in phone.css (keep the width in sync). */
export const PHONE_QUERY = '(max-width: 600px)';

export function isPhoneLayout(): boolean {
  return typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;
}
