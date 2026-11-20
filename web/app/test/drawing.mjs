import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { drawingInput } from '../src/drawing.ts';
import { prepare, java, output, repo } from './fixtures.mjs';
await prepare();
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
const report={outcome:'running',browser:browser.version(),cases:[]};
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.ORK_POC_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button',{name:'Body tube bodytube',exact:true}).waitFor();
  for(const [key,path] of [['sample',resolve(repo,'web/app/public/rocket-sample.ork')],['rich',resolve(output,'explicit/G1-A.ork')]]) {
    if(key!=='sample') await page.getByLabel('Open local .ork').setInputFiles(path);
    const archive=await importArchive(new Uint8Array(await readFile(path))), projection=drawingInput(archive);
    const ids=projection.componentIndices.map(i=>archive.parsed.components[i].id);
    await writeFile(resolve(output,`${key}-drawing-ids.txt`),ids.join('\n'));
    const expectedPath=resolve(output,`${key}-drawing.json`);
    await java('EditorDesktopProof',['drawing',path,resolve(output,`${key}-drawing-ids.txt`),expectedPath],`${key}-drawing`);
    const expected=JSON.parse(await readFile(expectedPath,'utf8'));
    const polygons=page.getByRole('region',{name:'Rocket drawing'}).locator('polygon');
    await polygons.first().waitFor();
    assert.equal(await polygons.count(),expected.polygons.length);
    const canvas=await page.locator('.drawing-canvas').boundingBox();
    const viewportHeight=Math.max(80,1000*canvas.height/canvas.width);
    const scale=Math.min(900/(expected.maxX-expected.minX),(viewportHeight-60)/2/Math.max(expected.radius,.001));
    for(let i=0;i<expected.polygons.length;i++) {
      const points=(await polygons.nth(i).getAttribute('points')).split(' ').map(p=>p.split(',').map(Number));
      assert.equal(points.length,expected.polygons[i].points.length);
      for(let j=0;j<points.length;j++) {
        const [x,y]=expected.polygons[i].points[j];
        assert.ok(Math.abs(points[j][0]-(50+(x-expected.minX)*scale))<1e-8,`actual desktop x ${key}/${i}/${j}`);
        assert.ok(Math.abs(points[j][1]-(150-y*scale))<1e-8,`actual desktop y ${key}/${i}/${j}`);
      }
    }
    if(key==='sample') {
      assert.equal(expected.polygons.length,5);
      assert.ok(Math.abs(expected.maxX-.52)<1e-12);
      assert.ok(Math.abs(expected.radius-.0884734)<1e-12);
      await page.getByRole('button',{name:'Select Nose cone in drawing',exact:true}).click();
      assert.equal(await page.getByRole('button',{name:'Nose cone nosecone',exact:true}).getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:'Select Fins in drawing',exact:true}).first().focus(); await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('button',{name:'Fins trapezoidfinset',exact:true}).getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:'Select Body tube in drawing',exact:true}).click();
      await page.screenshot({path:resolve(output,'rocket-drawing.png'),fullPage:true});
    }
    report.cases.push({name:key,polygons:expected.polygons.length,vertices:expected.polygons.reduce((n,p)=>n+p.points.length,0),desktopCoordinatesMatch:true});
  }
  assert.deepEqual(errors,[]);report.outcome='passed';
  console.log('Rocket drawing passed: all SVG vertices match loaded desktop geometry; mouse/keyboard selection and analytic sample extents passed.');
} catch(error) {report.outcome='failed';report.error=String(error);throw error;}
finally {await writeFile(resolve(output,'drawing-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
