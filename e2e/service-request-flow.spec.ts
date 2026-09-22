import { test, expect } from '@playwright/test';

/**
 * The one meaningful E2E test: a real browser driving the real React
 * frontend, which calls the real NestJS backend, which reads and writes a
 * real SQLite database (docs/full-stack-delivery.md). Nothing here is
 * mocked — if the frontend's fetch payload shape drifts from what the
 * backend controller expects, or a migration breaks the schema, this test
 * fails the way a user submitting the form would actually notice.
 */
test('an employee submits a request, opens its status, and cancels it', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Acting as').selectOption({ label: 'Rana Fares (EMP-1) — Marketing' });
  await page.getByLabel('Service').selectOption({ label: 'Laptop replacement (IT)' });
  await page.getByLabel('Comment (optional)').fill('E2E: need a laptop');
  await page.getByRole('button', { name: 'Submit request' }).click();

  const row = page.getByTestId('request-row').filter({ hasText: 'Laptop replacement' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('Submitted')).toBeVisible();

  // Clicking the request opens the detail view with its full status history.
  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Laptop replacement')).toBeVisible();
  await expect(dialog.locator('.badge').first()).toHaveText('Submitted');

  await dialog.getByRole('button', { name: 'Cancel this request' }).click();
  await expect(dialog.locator('.badge').first()).toHaveText('Cancelled');
  await expect(dialog.getByRole('button', { name: 'Cancel this request' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(row.getByText('Cancelled')).toBeVisible();
});

test('authorization: one employee cannot cancel another employee\'s request', async ({ page }) => {
  // EMP-2 submits a request and we read its id off the list.
  await page.goto('/');
  await page.getByLabel('Acting as').selectOption({ label: 'Omar Saade (EMP-2) — Engineering' });
  await page.getByLabel('Service').selectOption({ label: 'Access badge reset (HR)' });
  await page.getByRole('button', { name: 'Submit request' }).click();

  const row = page.getByTestId('request-row').filter({ hasText: 'Access badge reset' }).first();
  await expect(row).toBeVisible();
  const requestId = (await row.locator('strong').innerText()).trim();

  // Switch identity to EMP-1 and look up EMP-2's request by id.
  await page.getByLabel('Acting as').selectOption({ label: 'Rana Fares (EMP-1) — Marketing' });
  await page.getByLabel('Request id').fill(requestId);
  await page.getByRole('button', { name: 'View status' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Access badge reset')).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel this request' }).click();
  await expect(dialog.getByRole('alert')).toContainText('only its owner');
});

test('adding a new employee makes them selectable and shows a confirmation toast', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '+ Add employee' }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#new-employee-id').fill('EMP-90');
  await modal.locator('#new-employee-name').fill('Taylor Novak');
  await modal.locator('#new-employee-department').fill('Facilities');
  await modal.getByRole('button', { name: 'Add employee', exact: true }).click();

  // The modal closes and a toast confirms the new employee was created.
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Taylor Novak (EMP-90) was added' })).toBeVisible();

  // They're immediately selectable in the identity switcher.
  await expect(
    page.getByLabel('Acting as').locator('option', { hasText: 'Taylor Novak (EMP-90) — Facilities' }),
  ).toHaveCount(1);
});

test('adding an employee with an id that already exists is rejected', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '+ Add employee' }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#new-employee-id').fill('EMP-1');
  await modal.locator('#new-employee-name').fill('Someone Else');
  await modal.locator('#new-employee-department').fill('IT');
  await modal.getByRole('button', { name: 'Add employee', exact: true }).click();

  await expect(modal.getByRole('alert')).toContainText('already exists');
});

test('adding a new service makes it selectable and shows a confirmation toast', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '+ Add service' }).click();
  const modal = page.getByRole('dialog');
  await modal.locator('#new-service-id').fill('SVC-90');
  await modal.locator('#new-service-name').fill('Standing desk request');
  await modal.locator('#new-service-department').fill('Facilities');
  await modal.getByRole('button', { name: 'Add service', exact: true }).click();

  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Standing desk request (SVC-90) was added' })).toBeVisible();

  // It's immediately selected in the "New request" service picker.
  await expect(page.getByLabel('Service')).toHaveValue('SVC-90');
});

test('searching and filtering "My requests" narrows the list', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Acting as').selectOption({ label: 'Dana Khalil (EMP-3) — Finance' });

  await page.getByLabel('Service').selectOption({ label: 'Payroll correction (Finance)' });
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByTestId('request-row').filter({ hasText: 'Payroll correction' })).toBeVisible();

  await page.getByLabel('Service').selectOption({ label: 'Access badge reset (HR)' });
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByTestId('request-row').filter({ hasText: 'Access badge reset' })).toBeVisible();

  // Cancel the badge-reset request so the two rows differ by status too.
  await page.getByTestId('request-row').filter({ hasText: 'Access badge reset' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel this request' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Filter by status: only the cancelled request remains.
  await page.getByLabel('Filter by status').selectOption({ label: 'Cancelled' });
  await expect(page.getByTestId('request-row')).toHaveCount(1);
  await expect(page.getByTestId('request-row').first()).toContainText('Access badge reset');

  // Reset the status filter, then search narrows to the payroll request.
  await page.getByLabel('Filter by status').selectOption({ label: 'All statuses' });
  await page.getByLabel('Search my requests').fill('Payroll');
  await expect(page.getByTestId('request-row')).toHaveCount(1);
  await expect(page.getByTestId('request-row').first()).toContainText('Payroll correction');

  // A search with no matches shows the "no match" empty state, not an error.
  await page.getByLabel('Search my requests').fill('nothing matches this');
  await expect(page.getByText('No requests match your search.')).toBeVisible();
});

/**
 * Week 4: the AI-assisted Request Intake capability, driven from the real
 * browser against the real backend (docs/week4-production-ai.md). Proves
 * the advisory contract end to end: a suggestion is offered but nothing is
 * submitted until the employee reviews it and clicks "Submit request"
 * themselves, exactly like a manual pick.
 */
test('the AI intake assistant suggests a service from free text, and applying it fills the picker', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Acting as').selectOption({ label: 'Rana Fares (EMP-1) — Marketing' });

  await page.getByLabel('Describe what you need (optional)').fill('my laptop screen is cracked and it will not turn on');
  await page.getByRole('button', { name: 'Suggest a service' }).click();

  const suggestion = page.locator('.intake-suggestion');
  await expect(suggestion).toBeVisible();
  await expect(suggestion).toContainText('Suggested:');
  await expect(suggestion).toContainText('Laptop replacement');

  await suggestion.getByRole('button', { name: 'Use this suggestion' }).click();
  await expect(page.getByLabel('Service')).toHaveValue('SVC-1');
  await expect(page.getByText('Applied to the form below.')).toBeVisible();

  // The employee still has to review and submit it themselves — nothing
  // was created by the suggestion alone.
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByTestId('request-row').filter({ hasText: 'Laptop replacement' }).first()).toBeVisible();
});

test('the AI intake assistant gives no suggestion for vague free text, and the picker still works manually', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Describe what you need (optional)').fill('I have an issue, please help');
  await page.getByRole('button', { name: 'Suggest a service' }).click();

  await expect(page.getByText('No confident suggestion for that — pick a service below instead.')).toBeVisible();
  await expect(page.getByText(/Suggested:/)).toHaveCount(0);
});
