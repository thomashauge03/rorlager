import { interpolate } from "remotion";

/** Verdien mellom to bilder, låst i endene. */
export const mellom = (
  frame: number,
  inn: readonly number[],
  ut: readonly number[],
  easing?: (t: number) => number,
) => interpolate(frame, inn, ut, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });

/** 0 → 1 mellom to bilder, låst i endene. */
export const fram = (frame: number, fra: number, til: number, easing?: (t: number) => number) =>
  mellom(frame, [fra, til], [0, 1], easing);

/** Lineær blanding. */
export const miks = (a: number, b: number, t: number) => a + (b - a) * t;
