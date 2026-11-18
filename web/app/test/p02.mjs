import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  const worker=page.waitForEvent('worker');
  await page.goto('http://127.0.0.1:5173');
  await worker;
  await page.getByRole('button',{name:'Open explicit tube sample'}).click();
  await page.getByRole('button',{name:'Tube bodytube',exact:true}).click();
  const value = name=>page.getByTestId(name).textContent();
  assert.equal(await value('radius'),'0.0284734');
  const mass=Number(await value('mass'));
  await page.getByLabel('Component name',{exact:true}).fill('Edited & <tube>');
  await page.getByRole('button',{name:'Apply name',exact:true}).click();
  await page.getByRole('heading',{name:'Edited & <tube>',exact:true}).waitFor();
  await page.getByTestId('dirty').filter({hasText:'Changed since'}).waitFor();
  await page.getByLabel('BodyTube outer radius (m)',{exact:true}).fill('0.03');
  await page.getByRole('button',{name:'Apply radius',exact:true}).click();
  await page.getByTestId('radius').filter({hasText:'0.03'}).waitFor();
  assert.ok(Number(await value('mass'))>mass);
  assert.equal(Number(await value('cg')),0.3809999999999999);
  await page.getByRole('img',{name:/outer radius 0.03 m/}).waitFor();
  await page.getByRole('button',{name:'Apply radius',exact:true}).click();
  await page.getByRole('status').filter({hasText:'No change'}).waitFor();
  for(const invalid of ['','NaN','0','-1','1.1']) {
    await page.getByLabel('BodyTube outer radius (m)',{exact:true}).fill(invalid);
    await page.getByRole('button',{name:'Apply radius',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'finite outer radius'}).waitFor();
    assert.equal(await value('radius'),'0.03');
  }
  await page.getByLabel('BodyTube outer radius (m)',{exact:true}).fill('0.0005');
  await page.getByRole('button',{name:'Apply radius',exact:true}).click();
  await page.getByTestId('thickness').filter({hasText:'0.0005'}).waitFor();
  await page.getByRole('button',{name:'Stage stage',exact:true}).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('BodyTube outer radius (m)',{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Edited & <tube> bodytube',exact:true}).click();
  await page.getByLabel('Open local .ork').setInputFiles({name:'bad.ork',mimeType:'application/octet-stream',buffer:Buffer.from('<broken>')});
  await page.getByRole('alert').filter({hasText:'Import rejected; previous document retained'}).waitFor();
  assert.equal(await value('radius'),'0.0005');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/openrocket-poc-p02.png',fullPage:true});
  console.log('P02 Chromium: Java Worker, rename, radius/mass/CG/SVG, no-op, invalid numbers, keyboard selection, read-only component, rejected import and recovery passed');
} finally { await browser.close(); }
