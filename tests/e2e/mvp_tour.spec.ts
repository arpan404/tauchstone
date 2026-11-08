import { test, expect, type Page } from '@playwright/test';

// Expo tour on real data: also the fallback recording (`make record`).
// Projects -> live screen -> candidates -> compare -> drug -> my compounds -> attack -> report -> validation.
const BOUNDARY = 'Research hypothesis only. Not a treatment recommendation. Gene expression reversal does not establish efficacy, safety, dosing, brain exposure or clinical benefit.';
// Slow enough to narrate over the recording.
const pause = (page: Page, ms = 1200) => page.waitForTimeout(ms * Number(process.env.TS_E2E_PACE ?? 2.5));
const nav = (page: Page, label: string) =>
  page.getByRole('button', { name: label, exact: true }).first().click();

test('expo tour: screen, rank, inspect, attack, report', async ({ page }) => {
  let runs = 0;
  page.on('request', r => {
    if (r.method() === 'POST' && /\/attack\/[^/]+\/run$/.test(new URL(r.url()).pathname)) runs++;
  });
  const boundary = () => expect(page.getByRole('note', { name: 'Boundary' })).toHaveText(BOUNDARY);

  await page.goto('/');
  await boundary();
  await expect(page.getByRole('button', { name: /middle temporal gyrus/ }).first()).toBeVisible();
  await pause(page);
  await page.getByRole('button', { name: /middle temporal gyrus/ }).first().click();

  // Live screen over every LINCS gold signature.
  await nav(page, 'Screen');
  await page.getByRole('button', { name: /^GSE132903/ }).click();
  const submitted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/screens'));
  await page.getByRole('button', { name: 'Run screen' }).click();
  expect((await submitted).ok()).toBeTruthy();
  await expect(page.getByText('113,310', { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.locator('.mvp-hit').first()).toBeVisible();
  await pause(page, 2500);

  // Candidates, filters, compare.
  await nav(page, 'Candidates');
  const table = page.getByRole('table', { name: 'Candidates' });
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await page.getByRole('button', { name: 'Brain-cell data' }).click();
  await pause(page);
  await page.getByRole('button', { name: 'Brain-cell data' }).click();
  const boxes = table.getByRole('checkbox');
  for (const i of [0, 1, 2]) await boxes.nth(i).check();
  await pause(page);
  await nav(page, 'Compare');
  await expect(page.locator('.shell-content table, .shell-content [role="table"]').first()).toBeVisible();
  await pause(page, 2000);

  // Drug page: gaps, 3D molecule, context map, resource agreement.
  await nav(page, 'Candidates');
  const first = table.getByRole('row').nth(1).getByRole('button').first();
  const drugName = (await first.innerText()).trim();
  await first.click();
  await expect(page.getByRole('heading', { name: drugName })).toBeVisible();
  await expect(page.getByTestId('molecule-formula')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('region', { name: 'Ranking context map' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Agreement across resources' })).toBeVisible();
  await boundary();
  await pause(page, 2500);

  // A lab's own compounds.
  await nav(page, 'My compounds');
  await page.getByPlaceholder('Compound names · comma or newline').fill('donepezil, memantine, galantamine, Aricept');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('table', { name: 'Compound results' })).toContainText(/donepezil/i);
  await pause(page, 2000);

  // Attack the selected candidate on hidden tests: one committed experiment.
  await nav(page, 'Candidates');
  await table.getByRole('row').nth(1).getByRole('button').first().click();
  await nav(page, 'Attack');
  await page.getByRole('button', { name: 'Create experiment session' }).click();
  const commit = page.getByRole('button', { name: 'Commit & run test' });
  await expect(commit).toBeEnabled();
  await pause(page);
  const ran = page.waitForResponse(r => /\/attack\/[^/]+\/run$/.test(new URL(r.url()).pathname));
  await commit.click();
  expect((await ran).ok()).toBeTruthy();
  await expect(page.getByRole('list', { name: 'Session event log' }).getByRole('listitem')).not.toHaveCount(0);
  await pause(page, 2500);

  // Report and validation.
  await nav(page, 'Report');
  await expect(page.getByRole('button', { name: 'Download PDF' }).or(page.getByRole('link', { name: 'Download PDF' }))).toBeVisible();
  await pause(page, 2000);
  await nav(page, 'Validation');
  await pause(page, 2500);
  await boundary();
  expect(runs).toBe(1);
});
