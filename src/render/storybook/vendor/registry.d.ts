import type { StoryDefinition } from '../characters.ts';
export const definitions: StoryDefinition[];
export const gearPalettes: Record<string, Record<string, string>>;
export function isolateDrawing<T>(settings: { lw?: number; boil?: boolean; footGround?: boolean; linearStance?: boolean }, draw: () => T): T;
