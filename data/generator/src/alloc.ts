/** Exact integer allocation helpers (BigInt) so every split sums to the rupee. */

export { allocate } from '@fpa/engine';
import { allocate } from '@fpa/engine';

/** Allocate a non-negative integer total across weights with per-item caps. Throws if caps are too tight. */
export function allocateCapped(
  total: number,
  weights: readonly number[],
  caps: readonly number[],
): number[] {
  if (total < 0) throw new RangeError('allocateCapped needs a non-negative total');
  const out = weights.map(() => 0);
  let remaining = total;
  let active = weights
    .map((w, i) => (w > 0 && (caps[i] as number) > 0 ? i : -1))
    .filter((i) => i >= 0);
  while (remaining > 0) {
    if (active.length === 0) throw new RangeError(`caps too tight: ${remaining} unallocated`);
    const part = allocate(
      remaining,
      active.map((i) => weights[i] as number),
    );
    let progressed = false;
    active.forEach((idx, k) => {
      const take = Math.min(part[k] as number, (caps[idx] as number) - (out[idx] as number));
      if (take > 0) progressed = true;
      out[idx] = (out[idx] as number) + take;
      remaining -= take;
    });
    active = active.filter((i) => (out[i] as number) < (caps[i] as number));
    if (!progressed && remaining > 0 && active.length === 0) throw new RangeError('caps too tight');
  }
  return out;
}
