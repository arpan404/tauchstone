import type { Page } from '@playwright/test';
export const ui = (page: Page) => ({
  selected: page.getByRole('region', { name: 'Selected candidate', exact: true }),
  inspector: page.getByRole('region', { name: 'Candidate inspector', exact: true }),
  comparison: page.getByRole('region', { name: 'Candidate comparison', exact: true }),
  results: page.getByRole('region', { name: 'Candidate results' }).getByRole('button', { name: /^Select / }),
  search: page.getByRole('textbox', { name: 'Search name or ID' }),
  evidence: page.getByRole('heading', { name: 'Candidate evidence', exact: true }),
  history: page.getByRole('list').filter({ has: page.getByText(/mode (attack|learn).*cost 1/) }).getByRole('listitem'),
  budget: page.getByLabel(/^Budget \d+ of \d+;/),
});
