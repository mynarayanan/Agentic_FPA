export const LAKH = 100_000;
export const CRORE = 10_000_000;
export const cr = (x: number): number => Math.round(x * CRORE);
export const lakh = (x: number): number => Math.round(x * LAKH);
export const roundToLakh = (x: number): number => Math.round(x / LAKH) * LAKH;
