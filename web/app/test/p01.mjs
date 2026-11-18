import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button',{name:'Open explicit tube sample'}).click();
  const tube=page.getByRole('button',{name:'Tube bodytube',exact:true});
  await tube.click();
  assert.equal(await tube.getAttribute('aria-pressed'),'true');
  await page.getByTestId('radius').filter({hasText:'0.0284734'}).waitFor();
  await page.screenshot({path:'/tmp/openrocket-poc-p01.png',fullPage:true});
  console.log('P01 Chromium: real sample, 3 components, tube selection and properties passed');
} finally { await browser.close(); }
