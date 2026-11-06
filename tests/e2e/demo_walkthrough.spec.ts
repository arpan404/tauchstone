import { test, expect } from '@playwright/test';
import { ui } from './selectors';
test('three-minute research tour', async ({ page }) => {
  const s = ui(page);
  const pause = () => page.waitForTimeout(Number(process.env.TS_E2E_PAUSE_MS || 20000));
  await page.goto('/');
  await s.start.click();
  await expect(s.tour).toBeVisible();
  await pause(); // Signature
  await s.next.click();
  await pause(); // Ranking
  await s.next.click();
  await expect(s.evidence).toBeVisible();
  await expect(s.structure).toBeVisible({ timeout: 60000 });
  await pause();
  await s.next.click();
  await s.attack.click();
  await expect(s.run).toBeEnabled();
  await s.run.click();
  await expect(s.run).toBeEnabled();
  await pause();
  await expect(s.history).toHaveCount(1);
  await s.learn.click();
  await s.run.click();
  await expect(s.run).toBeEnabled();
  await expect(s.history).toHaveCount(2);
  await pause();
  await s.next.click();
  await pause(); // Benchmark
  await s.next.click();
  await pause(); // Boundary
  await s.finish.click();
  await expect(s.tour).toHaveCount(0);
});
