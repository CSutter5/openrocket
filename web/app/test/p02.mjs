import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { output, repo } from './fixtures.mjs';
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
try {
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  const worker=page.waitForEvent('worker');
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:5173');
  const javaWorker = await worker;
  assert.ok(javaWorker.url().includes('document.worker'));
  await mkdir(output, {recursive:true});
  async function downloadBytes() {
    const event=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download .ork',exact:true}).click();
    const download=await event; assert.equal(await download.failure(),null);
    return readFile(await download.path());
  }
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
  await page.getByText('Selected tube measurements and local schematic',{exact:true}).click();
  await page.getByRole('img',{name:/outer radius 0.03 m/}).waitFor();
  await page.getByRole('button',{name:'Apply radius',exact:true}).click();
  await page.getByRole('status').filter({hasText:'No change'}).waitFor();
  const beforeInvalid=await downloadBytes();
  for(const invalid of ['','NaN','0','-1','1.1']) {
    await page.getByLabel('BodyTube outer radius (m)',{exact:true}).fill(invalid);
    await page.getByRole('button',{name:'Apply radius',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'finite outer radius'}).waitFor();
    assert.equal(await value('radius'),'0.03');
  }
  assert.deepEqual(await downloadBytes(),beforeInvalid);
  // A no-op name entered with the keyboard leaves export feedback and bytes unchanged.
  await page.getByLabel('Component name',{exact:true}).focus(); await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText:'No change'}).waitFor();
  assert.deepEqual(await downloadBytes(),beforeInvalid);
  await page.getByLabel('BodyTube outer radius (m)',{exact:true}).fill('0.0005');
  await page.getByRole('button',{name:'Apply radius',exact:true}).click();
  await page.getByTestId('thickness').filter({hasText:'0.0005'}).waitFor();
  await page.getByRole('button',{name:'Stage stage',exact:true}).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('BodyTube outer radius (m)',{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Edited & <tube> bodytube',exact:true}).click();
  const beforeImportFailure=await downloadBytes();
  await page.getByLabel('Open local .ork').setInputFiles({name:'bad.ork',mimeType:'application/octet-stream',buffer:Buffer.from('<broken>')});
  await page.getByRole('alert').filter({hasText:'Import rejected; previous document retained'}).waitFor();
  assert.equal(await value('radius'),'0.0005');
  assert.deepEqual(await downloadBytes(),beforeImportFailure);
  const sample=await readFile(resolve(repo,'web/app/public/explicit-tube.ork'),'utf8');
  for(const [name, text, reason] of [
    ['automatic.ork',sample.replace('<radius>0.0284734</radius>','<radius>auto 0.0284734</radius>'),'Expected finite numeric explicit radius'],
    ['future.ork',sample.replace('version="1.11"','version="99.0"'),'Preservation only'],
  ]) {
    await page.getByLabel('Open local .ork').setInputFiles({name,mimeType:'application/octet-stream',buffer:Buffer.from(text)});
    await page.getByRole('button',{name:'Tube bodytube',exact:true}).click();
    assert.equal(await page.getByLabel('BodyTube outer radius (m)',{exact:true}).isDisabled(),true);
    await page.getByText(reason,{exact:false}).first().waitFor();
    assert.deepEqual(await downloadBytes(),Buffer.from(text));
    if(name==='future.ork') assert.equal(await page.getByLabel('Component name',{exact:true}).isDisabled(),true);
  }
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'interactions.json'),JSON.stringify({outcome:'passed',browser:browser.version(),dedicatedWorker:true,
    checks:['selection and keyboard activation','escaped rename','radius growth','thickness clamp','intrinsic mass/local CG and SVG update',
      'no-op name/radius','empty/NaN/zero/negative/oversized number rejection','unsupported stage and automatic-radius graph',
      'preservation-only version','malformed replacement retention','byte-identical downloads after invalid edits and failed replacement'],pageErrors:errors},null,2)+'\n');
  await page.screenshot({path:resolve(output,'read-only.png'),fullPage:true});
  console.log('P02 Chromium: Java Worker, rename, radius/mass/CG/SVG, no-op, invalid numbers, keyboard selection, read-only component, rejected import and recovery passed');
} finally { await browser.close(); }
