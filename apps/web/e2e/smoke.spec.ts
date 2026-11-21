import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * These run against a local build (no database) or a deployed preview (BASE_URL).
 * Every screen must render either its content or the setup notice, never an error page.
 */
const SCREENS: Array<[string, RegExp]> = [
  ['/', /Finance cockpit/],
  ['/variance', /Variance investigation/],
  ['/forecast', /Forecast intelligence/],
  ['/actions', /Corrective actions/],
  ['/assistant', /Finance assistant/],
];

async function dbConnected(request: APIRequestContext) {
  return (await request.get('/api/variance?period=2026-11')).status() === 200;
}

for (const [path, heading] of SCREENS) {
  test(`${path} renders content or the setup notice`, async ({ page, request }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    if (await dbConnected(request))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    else await expect(page.getByText('The database is not connected')).toBeVisible();
    await expect(page.getByText('Proof of concept on synthetic data')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
}

test('navigation moves between screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Forecast', exact: true }).click();
  await expect(page).toHaveURL(/\/forecast$/);
  await expect(page.getByRole('link', { name: 'Forecast', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('with data: the cockpit shows the CFO scenario and the variance screen shows the bridge', async ({
  page,
  request,
}) => {
  test.skip(!(await dbConnected(request)), 'needs a connected database');
  await page.goto('/');
  await expect(page.getByText('₹92.00 Cr').first()).toBeVisible();
  await expect(page.getByText('Operating profit is ₹7.00 Cr below budget.')).toBeVisible();
  await page.goto('/variance');
  await expect(page.getByRole('img', { name: /Revenue bridge for Nov 2026/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: '-₹8.00 Cr' }).first()).toBeVisible();
});

test('with data: moving a what-if slider recalculates through the engine', async ({
  page,
  request,
}) => {
  test.skip(!(await dbConnected(request)), 'needs a connected database');
  await page.goto('/forecast');
  const before = await page
    .getByRole('row', { name: /Operating profit \(EBITDA proxy\)/ })
    .textContent();
  await page.getByLabel('Sales volume').fill('-15');
  await expect
    .poll(async () =>
      page.getByRole('row', { name: /Operating profit \(EBITDA proxy\)/ }).textContent(),
    )
    .not.toBe(before);
});

test('with data: the assistant answers a question and shows its evidence', async ({
  page,
  request,
}) => {
  test.skip(!(await dbConnected(request)), 'needs a connected database');
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Why is operating profit below budget?' }).click();
  await expect(page.getByText('Operating profit for the group was ₹8.00 Cr')).toBeVisible();
  await expect(page.getByText(/Evidence \(\d+ figures\)/)).toBeVisible();
});

test('the API is reachable and refuses unauthenticated writes', async ({ request }) => {
  expect((await request.get('/api/health')).ok()).toBe(true);
  for (const path of [
    '/api/recommendations',
    '/api/audit/verify',
    '/api/forecast',
    '/api/scenario?volume=-5',
  ])
    expect([200, 503]).toContain((await request.get(path)).status());
  const write = await request.post('/api/recommendations/generate', {
    data: { requested_by: 'e2e-user' },
  });
  expect([401, 503]).toContain(write.status());
  const event = await request.post('/api/recommendations/AI-INS-00001/events', {
    data: { type: 'VALIDATE', actor_id: 'e2e', actor_role: 'CFO' },
  });
  expect([401, 503]).toContain(event.status());
});
