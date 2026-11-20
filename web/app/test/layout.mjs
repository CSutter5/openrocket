import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { output } from './fixtures.mjs';
import { openSample, openProperties } from './workspace.mjs';

// The acceptance runner's saved-flights module supplies this independent native fixture.
const fixture = resolve(output, 'saved-conditions.ork');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const viewports = [[1440, 1000], [1366, 768], [1280, 720], [1024, 600], [390, 844], [390, 600], [844, 390]];
const checks = [], errors = [];
try {
  const page = await browser.newPage();page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:4174');await page.locator('.rocket-drawing polygon').first().waitFor();
  async function settle() { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  async function inWindow(locator, label) {
    const box = await locator.boundingBox(), { width, height } = page.viewportSize();
    assert.ok(box && box.width > 0 && box.height > 0 && box.x >= -.5 && box.y >= -.5 && box.x + box.width <= width + .5 && box.y + box.height <= height + .5, `${label} fits ${width}×${height}: ${JSON.stringify(box)}`);
  }
  async function fits() {
    assert.deepEqual(await page.evaluate(() => ({ width: document.documentElement.scrollWidth <= innerWidth, height: document.documentElement.scrollHeight <= innerHeight, scrollY })), { width: true, height: true, scrollY: 0 });
    for (const selector of ['.app-header', '.upper-workspace', '.view-toolbar', '.rocket-drawing', '.document-info', '.status-bar']) await inWindow(page.locator(selector), selector);
  }
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();await settle();await fits();
    const canvas = await page.locator('.drawing-canvas').boundingBox();assert.ok(canvas.height >= 24, 'drawing retains usable space');
    assert.ok(await page.locator('.rocket-drawing polygon').evaluateAll(nodes => nodes.every(node => {
      const b = node.getBoundingClientRect(), c = node.closest('.drawing-canvas').getBoundingClientRect();
      return b.top >= c.top - 1 && b.bottom <= c.bottom + 1 && b.left >= c.left - 1 && b.right <= c.right + 1;
    })), 'fit drawing remains within its canvas');
    for (const name of ['Motors & Configuration', 'Flight simulations']) { await page.getByRole('tab', { name, exact: true }).click();await settle();await fits(); }
    await inWindow(page.getByRole('button', { name: 'Run flight', exact: true }), 'Run flight');
    await page.screenshot({ path: resolve(output, `fitted-workspace-${width}x${height}.png`) });
    checks.push(`all workspaces, drawing, controls and status fit ${width}×${height}`);
  }

  await page.setViewportSize({ width: 1024, height: 600 });
  await openSample(page, 'Open flight-ready sample');await page.getByRole('status').filter({ hasText: 'Archive opened.' }).waitFor();
  await page.getByRole('tab', { name: 'Rocket design', exact: true }).click();await settle();
  const tree = page.getByRole('navigation', { name: 'Component tree' });
  await tree.getByRole('button').last().focus();
  assert.ok(await tree.evaluate(node => node.scrollTop > 0), 'keyboard scrolls the component tree internally');
  await inWindow(tree.getByRole('button').last(), 'last component');await fits();
  await page.locator('.component-palette').evaluate(node => node.scrollTop = node.scrollHeight);
  await inWindow(page.locator('.palette-note'), 'last palette item');await fits();
  await page.locator('.document-info summary').click();await fits();
  await page.locator('.rocket-drawing > details summary').click();await settle();await fits();
  assert.ok((await page.locator('.drawing-canvas').boundingBox()).height >= 24);
  checks.push('component keyboard navigation, long palette and expanded disclosures scroll locally');

  await page.getByLabel('Open local .ork').setInputFiles(fixture);await page.getByText('saved-conditions.ork', { exact: true }).waitFor();
  for (const [width, height] of [[1366, 768], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('tab', { name: 'Motors & Configuration', exact: true }).click();
    await page.getByRole('button', { name: 'Select motor', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Select motor', exact: true });
    await inWindow(picker, 'motor selector');await inWindow(picker.getByRole('button', { name: 'Cancel', exact: true }), 'motor Cancel');await inWindow(picker.getByRole('button', { name: 'OK', exact: true }), 'motor OK');
    await picker.getByLabel('Maximum length (mm)', { exact: true }).scrollIntoViewIfNeeded();
    await inWindow(picker.getByLabel('Maximum length (mm)', { exact: true }), 'last motor filter');
    await inWindow(picker.getByRole('button', { name: 'OK', exact: true }), 'motor OK after filter scrolling');await fits();
    await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openProperties(page);
    const editor = page.getByRole('dialog', { name: 'Component editor', exact: true });
    await editor.getByLabel('Component name', { exact: true }).fill('Unapplied layout draft');
    await inWindow(editor, 'component editor');await inWindow(editor.getByRole('button', { name: 'Close Component editor', exact: true }), 'editor close');await editor.press('Escape');
    await page.getByRole('tab', { name: 'Flight simulations', exact: true }).click();
    await page.locator('.simulation-table').getByRole('button', { name: 'Saved low wind', exact: true }).dblclick();
    const graph = page.locator('.flight-graph');await inWindow(graph, 'flight graph');
    await graph.locator('.window-title > span').evaluate(node => node.textContent = 'Long title ' + 'a'.repeat(256));
    await inWindow(graph.locator('.window-title button'), 'close button with a long title');await graph.press('Escape');await fits();
    checks.push(`motor filters/actions, component editor and flight graph remain reachable at ${width}×${height}`);
  }
  const event = page.waitForEvent('download');await page.getByRole('button', { name: 'Download .ork', exact: true }).click();
  assert.deepEqual(await readFile(await (await event).path()), await readFile(fixture));await fits();
  await page.getByLabel('Open local .ork').setInputFiles({ name: 'bad-layout-input.ork', mimeType: 'application/octet-stream', buffer: Buffer.from('not an archive') });
  await page.getByRole('alert').waitFor();await fits();
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'viewport-layout-report.json'), JSON.stringify({ outcome: 'passed', browser: browser.version(), checks, pageErrors: errors }, null, 2) + '\n');
  console.log('Viewport layout passed: all tabs, internal scrolling, fit drawing, dialogs, actions, errors and exact archive preservation.');
} finally { await browser.close(); }
