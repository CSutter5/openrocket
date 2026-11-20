export async function openSample(page, name) {
  const menu = page.locator('.file-menu');
  if (await menu.getAttribute('open') === null) await menu.locator('summary').click();
  await menu.getByRole('button', { name, exact: true }).click();
}
export async function openProperties(page, { advanced = true } = {}) {
  await page.getByRole('button', { name: 'Edit component', exact: true }).click();
  await page.getByRole('dialog', { name: 'Component editor', exact: true }).waitFor();
  // Existing numerical proofs exercise the retained Advanced controls.
  await page.getByRole('dialog', { name: 'Component editor', exact: true }).getByRole('tab', { name: advanced ? 'Advanced' : 'General', exact: true }).click();
}
export async function flights(page) {
  await page.getByRole('tab', { name: 'Flight simulations', exact: true }).click();
}

export async function closeProperties(page) {
  await page.getByRole('button', { name: 'Close Component editor', exact: true }).click();
}
