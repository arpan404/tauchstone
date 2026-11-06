// Copy of contracts/fixtures/getSingleCellExploratory.json (the Docker web build only sees apps/web).
// fixture.test.ts fails if the two drift apart.
import fixture from './fixture.json';
import type { Schema } from '@/api/types';

export function getSingleCellMock(): Schema<'SingleCellExploratory'> {
  return structuredClone(fixture) as unknown as Schema<'SingleCellExploratory'>;
}
