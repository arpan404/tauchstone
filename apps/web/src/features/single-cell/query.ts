import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { isMockMode } from '@/api/mock';
import type { Schema } from '@/api/types';

export function useSingleCell() {
  return useQuery({
    queryKey: ['exploratory', 'single-cell'],
    queryFn: async (): Promise<Schema<'SingleCellExploratory'>> => isMockMode()
      ? (await import('./mock')).getSingleCellMock()
      : api('/exploratory/single-cell'),
    retry: false,
  });
}
