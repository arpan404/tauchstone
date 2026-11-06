import { test, expect } from '@playwright/test';
import { ui } from './selectors';

test('live copilot cites collected evidence and a real training job produces a new model', async ({ page }, testInfo) => {
  test.skip(process.env.TS_E2E_LAB !== '1', 'Opt in to local LLM inference and real model retraining with TS_E2E_LAB=1');
  test.setTimeout(120000);
  const s = ui(page);
  const isResponse = (path: string, method: string) => (r: import('@playwright/test').Response) =>
    new URL(r.url()).pathname.endsWith(path) && r.request().method() === method;
  let chats = 0;
  let trainingJobs = 0;
  let experimentCommits = 0;
  page.on('request', r => {
    if (r.method() !== 'POST') return;
    const path = new URL(r.url()).pathname;
    if (path.endsWith('/lab/chat')) chats++;
    if (path.endsWith('/lab/model/train')) trainingJobs++;
    if (/\/attack\/[^/]+\/run$/.test(path)) experimentCommits++;
  });
  await page.goto('/');
  // Select from discovery order before reading evidence or model predictions.
  await expect(s.results.first()).toBeVisible();
  await s.results.first().click();
  const candidateId = (await s.inspector.innerText()).match(/BRD-[A-Z0-9]+/)?.[0];
  expect(candidateId).toBeTruthy();
  await page.getByRole('navigation', { name: 'Research workspace' }).getByRole('button', { name: 'AI lab', exact: true }).click();
  const question = 'What supports this discovery signal?';
  await page.getByRole('button', { name: question, exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Research question' })).toHaveValue(question);
  expect(chats).toBe(0); // Suggestions prefill only.
  const answerPending = page.waitForResponse(isResponse('/lab/chat', 'POST'), { timeout: 60000 });
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const answerResponse = await answerPending;
  expect(answerResponse.ok()).toBeTruthy();
  expect(answerResponse.request().postDataJSON()).toMatchObject({ candidate_id: candidateId, question });
  const answer = await answerResponse.json();
  expect(answer.mode).toBe('generated');
  expect(answer.answer.length).toBeGreaterThan(0);
  expect(answer.citations.length).toBeGreaterThan(0);
  const conversation = page.getByRole('region', { name: 'Research conversation' });
  await expect(conversation.getByText('AI-selected evidence', { exact: true })).toBeVisible();
  await expect(conversation.getByText(answer.answer, { exact: true })).toBeVisible();
  const citation = answer.citations[0];
  await conversation.getByRole('button', { name: `${citation.id}: ${citation.title}`, exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Source notebook' }).getByText(citation.excerpt, { exact: true })).toBeVisible();
  const initialPending = page.waitForResponse(isResponse('/lab/model', 'GET'));
  await page.getByRole('tab', { name: 'Model studio', exact: true }).click();
  const initialResponse = await initialPending;
  expect(initialResponse.ok()).toBeTruthy();
  const initial = await initialResponse.json();
  expect(initial.status).toBe('ready');
  expect(initial.report.n_train).toBeGreaterThan(0);
  expect(initial.report.n_test).toBeGreaterThan(0);
  const predictionPending = page.waitForResponse(isResponse('/lab/model/predict', 'POST'));
  await page.getByRole('button', { name: 'Predict selected candidate', exact: true }).click();
  const predictionResponse = await predictionPending;
  expect(predictionResponse.ok()).toBeTruthy();
  const prediction = await predictionResponse.json();
  expect(prediction.candidate_id).toBe(candidateId);
  expect(prediction.run_id).toBe(initial.report.run_id);
  expect(Number.isFinite(prediction.prediction)).toBeTruthy();
  await expect(page.getByText(`Predicted discovery consensus: ${prediction.prediction.toFixed(3)}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Dataset membership: ${prediction.training_membership.replaceAll('_', ' ')}. A negative score indicates discovery expression reversal.`, { exact: true })).toBeVisible();
  const trainingPending = page.waitForResponse(isResponse('/lab/model/train', 'POST'));
  // Observe actual polling responses. Do not create a second training request or fake progress.
  const readyPending = page.waitForResponse(async r => {
    if (!isResponse('/lab/model', 'GET')(r) || !r.ok()) return false;
    const body = await r.json();
    return body.status === 'ready';
  }, { timeout: 90000 });
  const train = page.getByRole('button', { name: 'Train random forest', exact: true });
  await train.click();
  const trainingResponse = await trainingPending;
  expect(trainingResponse.ok()).toBeTruthy();
  expect((await trainingResponse.json()).status).toBe('training');
  expect(trainingResponse.request().postDataJSON()).toEqual({ algorithm: 'random_forest', seed: 20261105 });
  await expect(train).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Training job running.' })).toBeVisible();
  const completed = await (await readyPending).json();
  const report = completed.report;
  expect(report.run_id).not.toBe(initial.report.run_id);
  expect(report.provenance.git_commit).toMatch(/^[a-f0-9]{40}$/);
  expect(report.provenance.random_seed).toBe(20261105);
  expect(report.n_train).toBeGreaterThan(0);
  expect(report.n_test).toBeGreaterThan(0);
  for (const metric of ['mae', 'baseline_mae']) expect(Number.isFinite(report.metrics[metric])).toBeTruthy();
  await expect(train).toBeEnabled();
  await expect(page.getByText('Trained model ready', { exact: true })).toBeVisible();
  for (const [label, value] of [['Model MAE', report.metrics.mae], ['Training mean baseline MAE', report.metrics.baseline_mae]] as const) {
    await expect(page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd')).toHaveText(value.toFixed(3));
  }
  await page.getByText('Limitations, data sources and run provenance', { exact: true }).click();
  await expect(page.locator('pre')).toContainText(report.run_id);
  await testInfo.attach('live-model-report', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(`Live model retrained: ${initial.report.run_id} -> ${report.run_id}; n_train=${report.n_train}; n_test=${report.n_test}; metrics=${JSON.stringify(report.metrics)}`);
  expect(chats).toBe(1);
  expect(trainingJobs).toBe(1);
  expect(experimentCommits).toBe(0);
});
