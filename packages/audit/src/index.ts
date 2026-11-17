export type ApprovalLevel = 'AI_INSIGHT' | 'BUSINESS_VALIDATED' | 'FINANCE_AUTHORISED';
export const APPROVAL_LEVELS: readonly ApprovalLevel[] = [
  'AI_INSIGHT',
  'BUSINESS_VALIDATED',
  'FINANCE_AUTHORISED',
];
// Sprint 5: approval state machine, segregation of duties, append-only decision log.
