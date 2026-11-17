/** ALC-INT-001 - exact integer allocation (largest remainder) using BigInt. */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (!Number.isSafeInteger(total)) throw new RangeError(`total must be a safe integer: ${total}`);
  if (weights.length === 0) throw new RangeError('no weights');
  const sign = total < 0 ? -1n : 1n;
  const abs = total < 0 ? -BigInt(total) : BigInt(total);
  const w = weights.map((x) => BigInt(Math.max(0, Math.round(x * 1000))));
  const sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    if (total === 0) return weights.map(() => 0);
    throw new RangeError('all weights are zero');
  }
  const base = w.map((x) => (abs * x) / sum);
  const rem = w.map((x) => (abs * x) % sum);
  let left = abs - base.reduce((a, b) => a + b, 0n);
  const order = rem
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (left === 0n) break;
    base[i] = (base[i] as bigint) + 1n;
    left -= 1n;
  }
  return base.map((x) => Number(sign * x) + 0);
}

/** Integer division rounded half up (towards +infinity on ties), exact for any safe-integer inputs. */
export function roundDiv(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) throw new RangeError('denominator must be positive');
  const x = 2n * numerator + denominator;
  const y = 2n * denominator;
  let q = x / y;
  if (x % y !== 0n && x < 0n) q -= 1n;
  return Number(q);
}
