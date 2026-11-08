import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RecommendedBadge } from './RecommendationRationale';
import { rationaleCopy } from './rationale';

afterEach(cleanup);
it('attributes an Attack response when Learn has just been selected', () => {
  const copy = rationaleCopy('attack', 'learn', 'Most likely to break the claim.');
  expect(copy.stale).toBe(true);
  expect(copy.title).toBe('Last server recommendation (Attack)');
  expect(copy.body).toBe('Most likely to break the claim.');
  expect(copy.note).toBe('Learn applies after the next reveal');
});
it('shows the returned Learn rationale once the response matches', () => {
  const copy = rationaleCopy('learn', 'learn', 'Largest expected belief change.');
  expect(copy).toEqual({ stale: false, title: 'Learn recommendation', body: 'Largest expected belief change.', note: null });
});
it('also identifies a stale Learn response after switching back to Attack', () => {
  const copy = rationaleCopy('learn', 'attack', 'Largest expected belief change.');
  expect(copy.title).toBe('Last server recommendation (Learn)');
  expect(copy.note).toBe('Attack applies after the next reveal');
});
it('renders a short badge and keeps the rationale out of the row text', () => {
  render(<TooltipProvider><RecommendedBadge responseMode="attack" selectedMode="attack" rationale="Lowest predicted survival." /></TooltipProvider>);
  expect(screen.getByText('Recommended')).toBeTruthy();
  expect(screen.queryByText(/Lowest predicted survival/)).toBeNull();
});
