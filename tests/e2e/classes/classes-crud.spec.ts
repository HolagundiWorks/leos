import { test, expect, navigateTo } from '../../fixtures/leos';

// Nested create: a class, then a section under that specific class, then delete
// the class (cascade). Verified in the UI and against the backend tree.
test.describe('classes & sections CRUD (UI)', () => {
  test('create class, add a section, then delete the class', async ({ authedPage, serverApi }) => {
    const page = authedPage;
    const stamp = Date.now();
    const className = `UIClass-${stamp}`;
    const sectionName = `Sec${stamp}`;

    await navigateTo(page, 'academics', 'classes');
    await expect(page.getByTestId('class-new-button')).toBeVisible();

    // Create the class
    await page.getByTestId('class-new-button').click();
    await page.getByTestId('class-name-input').fill(className);
    await page.getByTestId('class-form-save-button').click();
    await expect(page.getByTestId('class-name-input')).toBeHidden();

    const card = page.getByTestId('class-card').filter({ hasText: className });
    await expect(card).toBeVisible();

    // Add a section under THIS class
    await card.getByTestId('class-add-section-button').click();
    await page.getByTestId('section-name-input').fill(sectionName);
    await page.getByTestId('section-form-save-button').click();
    await expect(page.getByTestId('section-name-input')).toBeHidden();

    await expect(card.getByTestId('section-row').filter({ hasText: sectionName })).toBeVisible();

    // Backend confirms the nested tree
    const res = await serverApi.get<{ classes: { name: string; sections: { name: string }[] }[] }>(
      '/classes',
    );
    const created = res.body.classes.find((c) => c.name === className);
    expect(created?.sections.some((s) => s.name === sectionName)).toBe(true);

    // Delete the class (cascades sections) — immediate, no confirm
    await card.getByTestId('class-delete-button').click();
    await expect(page.getByTestId('class-card').filter({ hasText: className })).toHaveCount(0);
  });
});
