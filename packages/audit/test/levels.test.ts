import { expect, it } from 'vitest';
import { APPROVAL_LEVELS } from '../src';
it('defines the three-level approval model in order', () => {
  expect(APPROVAL_LEVELS).toEqual(['PROPOSED', 'BUSINESS_VALIDATED', 'AUTHORISED']);
});
