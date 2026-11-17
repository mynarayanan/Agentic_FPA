import { expect, test } from '@playwright/test';

test('home page renders the narrative returned by the API', async ({ page }) => {
  await page.route('/api/narrative?**', (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        period: url.searchParams.get('period'),
        entity_id: url.searchParams.get('entity'),
        narrative: {
          status: 'TEMPLATE',
          fallback_reason: 'NO_LLM',
          model: null,
          prompt_version: 'test',
          fact_sheet_hash: 'test',
          prompt_hash: null,
          attempts: 0,
          violations: [],
          headline: {
            kind: 'CALCULATED',
            text: 'Operating profit was below budget.',
            fact_ids: ['F1'],
            calc_refs: ['VAR-PNL-001'],
          },
          statements: [
            {
              kind: 'CALCULATED',
              text: 'Revenue was below budget.',
              fact_ids: ['F2'],
              calc_refs: ['VAR-PNL-001'],
            },
          ],
        },
        facts: [
          {
            id: 'F1',
            key: 'revenue.variance',
            label: 'Revenue variance',
            value: -80_000_000,
            unit: 'inr',
            basis: 'CALCULATED',
            calc_ref: 'VAR-PNL-001',
          },
        ],
        calc_refs: [{ id: 'VAR-PNL-001', version: '1.0.0' }],
      }),
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('narrative')).toContainText('Operating profit was below budget.');
  await expect(page.getByTestId('narrative')).toContainText('Revenue variance');
  await expect(page.getByTestId('narrative')).toContainText('VAR-PNL-001');
  await page.getByLabel('Period').selectOption('2026-10');
  await page.getByLabel('Entity').selectOption('E-EU');
  await expect(page.getByTestId('narrative')).toContainText('October 2026 · Europe Manufacturing');
});

test('health endpoint is up', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});

test('variance endpoint is reachable (200 with data, or 503 when no database is configured)', async ({
  request,
}) => {
  const res = await request.get('/api/variance?period=2026-11');
  expect([200, 503]).toContain(res.status());
  if (res.status() === 200) {
    const body = await res.json();
    expect(body.pnl.revenue.variance).toBe(-80_000_000);
  }
});

test('variance endpoint rejects malformed input', async ({ request }) => {
  const res = await request.get('/api/variance?period=nope');
  expect([400, 503]).toContain(res.status());
});

test('narrative endpoint returns a guarded narrative (or 503 without a database)', async ({
  request,
}) => {
  const res = await request.get('/api/narrative?period=2026-11');
  expect([200, 503]).toContain(res.status());
  if (res.status() === 200) {
    const body = await res.json();
    expect(['OK', 'RETRIED', 'FALLBACK', 'TEMPLATE']).toContain(body.narrative.status);
    for (const s of [body.narrative.headline, ...body.narrative.statements])
      expect(s.text).not.toContain('{{');
    expect(body.facts.some((f: { value: number }) => f.value === -80_000_000)).toBe(true);
  }
});
