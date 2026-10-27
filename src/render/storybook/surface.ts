// A baked drawing may contain several device pixels per game-world pixel.
// Keep that density with derived silhouettes so effects and hit geometry share one coordinate system.
const densities = new WeakMap<HTMLCanvasElement, number>();

export function registerDensity(canvas: HTMLCanvasElement, density: number): HTMLCanvasElement {
  densities.set(canvas, density);
  return canvas;
}
export const canvasDensity = (canvas: HTMLCanvasElement): number => densities.get(canvas) ?? 1;
export const canvasWidth = (canvas: HTMLCanvasElement): number => canvas.width / canvasDensity(canvas);
export const canvasHeight = (canvas: HTMLCanvasElement): number => canvas.height / canvasDensity(canvas);

/** drawImage with logical source rectangles, preserving the full-resolution baked image. */
export function paintCanvas(g: CanvasRenderingContext2D, source: HTMLCanvasElement, ...rect: number[]): void {
  const d = canvasDensity(source);
  if (rect.length === 2) g.drawImage(source, rect[0], rect[1], source.width / d, source.height / d);
  else if (rect.length === 4) g.drawImage(source, rect[0], rect[1], rect[2], rect[3]);
  else if (rect.length === 8) g.drawImage(source, rect[0] * d, rect[1] * d, rect[2] * d, rect[3] * d, rect[4], rect[5], rect[6], rect[7]);
  else throw new Error('A drawing requires a destination point or rectangle.');
}
