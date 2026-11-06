import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RecommendationRationale } from './RecommendationRationale';

afterEach(cleanup);
it('attributes an Attack response when Learn has just been selected', () => {
  render(<RecommendationRationale responseMode="attack" selectedMode="learn" rationale="Most likely to break the claim." />);
  expect(screen.getByText(/Last server recommendation \(Attack\)/).textContent).toContain('Most likely to break the claim.');
  expect(screen.getByText(/Learn is selected for the next validation/).textContent).toContain('refreshes after a reveal');
});
it('shows the returned Learn rationale once the response matches', () => {
  render(<RecommendationRationale responseMode="learn" selectedMode="learn" rationale="Largest expected belief change." />);
  expect(screen.getByText('Learn recommendation: Largest expected belief change.')).toBeTruthy();
  expect(screen.queryByText(/Last server recommendation/)).toBeNull();
});
it('also identifies a stale Learn response after switching back to Attack', () => {
  render(<RecommendationRationale responseMode="learn" selectedMode="attack" rationale="Largest expected belief change." />);
  expect(screen.getByText(/Last server recommendation \(Learn\)/)).toBeTruthy();
  expect(screen.getByText(/Attack is selected for the next validation/)).toBeTruthy();
});
