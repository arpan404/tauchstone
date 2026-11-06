import fixture from '../../../../../contracts/fixtures/getSingleCellExploratory.json';
import type { Schema } from '@/api/types';

export function getSingleCellMock(): Schema<'SingleCellExploratory'> {
  return structuredClone(fixture) as unknown as Schema<'SingleCellExploratory'>;
}
