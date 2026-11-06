import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ExpoReadout } from './readout';
import { remainingTests } from './remainingTests';
import type { Schema } from '@/api/types';
const context = (status: 'hidden' | 'revealed'): Schema<'ContextState'> => ({ context_id: status, label: status, type: 'lincs_context', status, p_survive: .5 });
describe('expo readout', () => {
  it('caps the remaining count by sealed tests when budget exceeds available evidence', () => {
    expect(remainingTests({ budget_remaining: 4, contexts: [context('hidden'), context('revealed')] })).toBe(1);
    expect(remainingTests({ budget_remaining: 5, contexts: [context('hidden'), context('hidden')] })).toBe(2);
    expect(remainingTests({ budget_remaining: 4, contexts: [context('revealed')] })).toBe(0);
  });
  it('caps by the remaining budget when there are more sealed tests', () => {
    expect(remainingTests({ budget_remaining: 1, contexts: [context('hidden'), context('hidden')] })).toBe(1);
    expect(remainingTests({ budget_remaining: 0, contexts: [context('hidden')] })).toBe(0);
  });
  it('updates the ring and numeric readout together after a reveal', () => {
    const { container, rerender } = render(<ExpoReadout name="Candidate" probability={.62} />);
    expect(screen.getByText('0.62')).toBeTruthy();
    expect(container.querySelector('.expo-ring-value')?.getAttribute('stroke-dasharray')).toBe('62 100');
    rerender(<ExpoReadout name="Candidate" probability={.2} />);
    expect(screen.getByText('0.20')).toBeTruthy();
    expect(container.querySelector('.expo-ring-value')?.getAttribute('stroke-dasharray')).toBe('20 100');
    cleanup();
  });
});
