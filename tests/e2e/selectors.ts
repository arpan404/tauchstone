import type { Page } from '@playwright/test';
export const ui = (page: Page) => ({
  start: page.getByRole('button', { name: 'Start the 3-minute tour', exact: true }),
  tour: page.getByRole('complementary', { name: 'Guided tour' }),
  next: page.getByRole('button', { name: 'Next', exact: true }),
  finish: page.getByRole('button', { name: 'Finish tour', exact: true }),
  evidence: page.getByRole('heading', { name: 'Evidence card', exact: true }),
  structure: page.getByRole('img', { name: '3D protein structure viewer' }).locator('canvas').first(),
  history: page.getByRole('list').filter({ has: page.getByText(/mode (attack|learn)/) }).getByRole('listitem'),
  attack: page.getByRole('button', { name: 'Start attack session', exact: true }),
  run: page.getByRole('button', { name: 'Run validation', exact: true }),
  learn: page.getByRole('switch', { name: 'Toggle attack or learn mode', exact: true }),
});
