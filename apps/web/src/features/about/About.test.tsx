/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { About, IntegrityLog } from './About';
import { integrityMarkdown, frozenPreregistrationSha256 } from './integrity';
import { useBenchmark, useMockStatus } from '@/api/hooks';
import { getMockBenchmark } from '@/api/mock/benchmark';

vi.mock('@/api/hooks', () => ({ useBenchmark: vi.fn(), useMockStatus: vi.fn() }));
afterEach(cleanup);
function mount() {
  render(<QueryClientProvider client={new QueryClient()}><About /></QueryClientProvider>);
}
describe('About integrity and API boundary', () => {
  it('copies the complete integrity log and verifies the frozen file hash', () => {
    expect(integrityMarkdown).toBe(readFileSync('../../docs/integrity_log.md', 'utf8'));
    expect(frozenPreregistrationSha256).toBe(createHash('sha256').update(readFileSync('../../data/manifests/preregistration.yaml')).digest('hex'));
    render(<IntegrityLog />);
    expect(screen.getAllByRole('listitem')).toHaveLength(13);
    expect(screen.getByText(/plaque binding read as brain\/plasma Kp/)).toBeTruthy();
  });
  it('uses supplied API values and visibly labels synthetic data', () => {
    const data = structuredClone(getMockBenchmark());
    data.budget = 3;
    data.policies.find((p) => p.policy === 'tauchstone_hybrid')!.decision_accuracy.estimate = 0.731;
    vi.mocked(useBenchmark).mockReturnValue({ data, isLoading: false, isError: false } as ReturnType<typeof useBenchmark>);
    vi.mocked(useMockStatus).mockReturnValue(true);
    mount();
    expect(screen.getByText('73.1%')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Verdict match rate after 3 tests' })).toBeTruthy();
    expect(screen.getByText(/Synthetic API\/fixture hash/)).toBeTruthy();
    expect(screen.getByText(/Mock data: not real results/)).toBeTruthy();
    const record = screen.getByText('Full record').closest('details')!;
    expect(record.open).toBe(false);
    expect(record.textContent).toContain('Integrity log');
    expect(record.textContent).toContain('Decided by');
    const limits = screen.getByRole('heading', { name: 'What did not hold up' });
    expect(record.contains(limits)).toBe(false);
  });
  it('flags a serving hash that differs from the frozen record', () => {
    const data = structuredClone(getMockBenchmark());
    data.preregistration_sha256 = 'different-serving-hash';
    vi.mocked(useBenchmark).mockReturnValue({ data, isError: false, isLoading: false } as ReturnType<typeof useBenchmark>);
    vi.mocked(useMockStatus).mockReturnValue(false);
    mount();
    expect(screen.getByRole('alert').textContent).toContain('API hash differs');
  });
  it('does not substitute a headline when the API is unavailable', () => {
    vi.mocked(useBenchmark).mockReturnValue({ isError: true, isLoading: false } as ReturnType<typeof useBenchmark>);
    vi.mocked(useMockStatus).mockReturnValue(false);
    mount();
    expect(screen.getByRole('alert').textContent).toContain('Validation results unavailable');
    expect(screen.queryByText('100.0%')).toBeNull();
  });
});
