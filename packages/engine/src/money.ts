/**
 * Money is stored as an integer number of rupees (INR). No floats in the ledger path:
 * integer arithmetic makes every bridge reconcile to the rupee (see ADR-003).
 */
export const LAKH = 100_000;
export const CRORE = 10_000_000;

export type Rupees = number;

export function assertRupees(value: number, label = 'amount'): asserts value is Rupees {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer number of rupees, got ${value}`);
  }
}

/** Convert crore to integer rupees (1 rupee resolution). */
export function fromCrore(crore: number): Rupees {
  const rupees = Math.round(crore * CRORE);
  assertRupees(rupees, 'fromCrore result');
  return rupees;
}

/** Display helper only. Never feed the result back into calculations. */
export function toCrore(rupees: Rupees, decimals = 2): number {
  assertRupees(rupees);
  return Number((rupees / CRORE).toFixed(decimals));
}
