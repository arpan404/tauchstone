import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RecommendedBadge } from './RecommendationRationale';
import { rationaleCopy } from './rationale';

afterEach(cleanup);
it('attributes an Attack response when Learn has just been selected', () => {
  const copy = rationaleCopy('attack', 'learn', 'Most likely to break the claim.');
  expect(copy.stale).toBe(true);
  expect(copy.title).toBe('Earlier suggestion (Likely to fail)');
  expect(copy.body).toBe('Most likely to break the claim.');
  expect(copy.note).toBe('Informative applies after the next result');
});
it('shows the returned Learn rationale once the response matches', () => {
  const copy = rationaleCopy('learn', 'learn', 'Largest expected belief change.');
  expect(copy).toEqual({ stale: false, title: 'Suggested (Informative)', body: 'Largest expected belief change.', note: null, badge: 'Earlier pick' });
});
it('also identifies a stale Learn response after switching back to Attack', () => {
  const copy = rationaleCopy('learn', 'attack', 'Largest expected belief change.');
  expect(copy.title).toBe('Earlier suggestion (Informative)');
  expect(copy.note).toBe('Likely to fail applies after the next result');
});
it('renders a short badge and keeps the rationale out of the row text', () => {
  render(<TooltipProvider><RecommendedBadge responseMode="attack" selectedMode="attack" rationale="Lowest predicted survival." /></TooltipProvider>);
  expect(screen.getByText('Suggested')).toBeTruthy();
  expect(screen.queryByText(/Lowest predicted survival/)).toBeNull();
});
it('marks a stale pick with the mode that made it', () => {
  render(<TooltipProvider><RecommendedBadge responseMode="attack" selectedMode="learn" rationale="Most likely to break the claim." /></TooltipProvider>);
  expect(screen.getByText('Earlier pick')).toBeTruthy();
  expect(screen.queryByText('Suggested')).toBeNull();
});
