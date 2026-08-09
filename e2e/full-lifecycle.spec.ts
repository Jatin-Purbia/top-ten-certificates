import { expect, test } from '@playwright/test';

const api = 'http://localhost:4000/api/v1';
const adminHeaders = { 'x-demo-admin': 'demo-super-admin' };

test('complete certificate lifecycle is private, time-bound, and purgeable', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(testInfo.project.name === 'mobile', 'Lifecycle mutation runs once; mobile layout is covered separately.');
  const suffix = `${Date.now()}`.slice(-8);
  const title = `Lifecycle Quiz ${suffix}`;
  const resultNumber = `E2E-${suffix}`;

  await page.goto('/admin/login');
  const demo = page.getByRole('button', { name: 'Super Admin' });
  if (await demo.isVisible()) await demo.click();
  else {
    await page.evaluate(() => localStorage.setItem('demo_admin', 'demo-super-admin'));
    await page.goto('/admin');
  }
  await page.getByRole('link', { name: 'Result cycles' }).first().click();
  await page.getByRole('button', { name: 'Create cycle' }).click();
  await page.getByLabel('Quiz / competition title').fill(title);
  await page.getByLabel('Result number').fill(resultNumber);
  await page.getByLabel('Magazine issue').fill(`ISS-${suffix}`);
  await page.getByLabel('Publication date and time').fill(new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 16));
  const template = page.getByLabel('Approved certificate template');
  await template.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByText(title)).toBeVisible();

  const cycleList = await request.get(`${api}/admin/cycles?search=${encodeURIComponent(resultNumber)}`, { headers: adminHeaders });
  expect(cycleList.ok()).toBeTruthy();
  const cycle = (await cycleList.json()).data[0];
  const rows = Array.from({ length: 10 }, (_, index) => ({
    participantId: `E2E-${suffix}-${index + 1}`,
    certificateNumber: `CERT-${suffix}-${index + 1}`,
    phone: `9${suffix}${index}`,
    nameHindi: `परीक्षण विद्यार्थी ${index + 1}`,
    nameEnglish: `Test Student ${index + 1}`,
    guardianName: 'Demo Guardian',
    className: '6', age: 11, city: 'जयपुर', score: 100 - index, rank: index + 1,
    resultDate: new Date().toISOString().slice(0, 10), photoPath: null,
  }));
  const validate = await request.post(`${api}/admin/cycles/${cycle.id}/candidates/import/validate`, { headers: adminHeaders, data: { rows } });
  expect((await validate.json()).data.valid).toBe(true);
  const imported = await request.post(`${api}/admin/cycles/${cycle.id}/candidates/import/commit`, { headers: adminHeaders, data: { rows } });
  expect(imported.ok()).toBeTruthy();
  expect((await imported.json()).data.count).toBe(10);

  const forbidden = await request.post(`${api}/admin/cycles`, { headers: { 'x-demo-admin': 'demo-viewer' }, data: { title: 'Forbidden', resultNumber: 'X', issueNumber: 'X', publicationAt: new Date().toISOString() } });
  expect(forbidden.status()).toBe(403);

  await page.goto(`/admin/cycles/${cycle.id}`);
  await expect(page.getByText('Test Student 10')).toBeVisible();
  const previewDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Preview' }).first().click();
  expect((await previewDownload).suggestedFilename()).toMatch(/\.pdf$/);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Publish cycle' }).click();
  await expect(page.getByText('published', { exact: true })).toBeVisible();
  const qrDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'QR SVG' }).click();
  expect((await qrDownload).suggestedFilename()).toMatch(/\.svg$/);

  await page.goto(`/certificate/${cycle.publicSlug}`);
  await page.getByLabel('Mobile number').fill('9999999999');
  await page.getByRole('button', { name: 'Generate my certificate' }).click();
  await expect(page.getByText('No certificate was found for this mobile number.')).toBeVisible();
  await page.getByLabel('Mobile number').fill(rows[0].phone);
  await page.getByRole('button', { name: 'Generate my certificate' }).click();
  await expect(page.getByRole('heading', { name: 'Your personalised certificate is ready' })).toBeVisible();
  const certificateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download certificate PDF' }).click();
  expect((await certificateDownload).suggestedFilename()).toMatch(/\.pdf$/);

  await request.patch(`${api}/admin/settings/certificate-availability`, { headers: adminHeaders, data: { days: 1 } });
  await request.post(`${api}/admin/settings/apply-to-active-cycles`, { headers: adminHeaders, data: { days: 1, confirm: true } });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Download period ended' })).toBeVisible();

  const purge = await request.post(`${api}/internal/jobs/purge-expired-certificates`, {
    headers: { 'x-internal-job-secret': process.env.INTERNAL_JOB_SECRET ?? 'development-internal-job-secret' },
  });
  expect(purge.ok()).toBeTruthy();
  const remaining = await request.get(`${api}/admin/cycles/${cycle.id}/candidates`, { headers: adminHeaders });
  expect((await remaining.json()).data).toHaveLength(0);
  const purgedCycle = await request.get(`${api}/admin/cycles/${cycle.id}`, { headers: adminHeaders });
  expect((await purgedCycle.json()).data.status).toBe('purged');
});
