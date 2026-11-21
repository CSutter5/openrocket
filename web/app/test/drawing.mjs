import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { importArchive } from '../../packages/ork-format/src/index.js';
import { drawingInput } from '../src/drawing.ts';
import { prepare, java, output, repo } from './fixtures.mjs';
await prepare();
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
const report={outcome:'running',browser:browser.version(),cases:[],ruler:[]};
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
    const scale=Math.min(900/(expected.maxX-expected.minX),(viewportHeight-36)/2/Math.max(expected.radius,.001));
    const left=(1000-(expected.maxX-expected.minX)*scale)/2;
    for(let i=0;i<expected.polygons.length;i++) {
      const points=(await polygons.nth(i).getAttribute('points')).split(' ').map(p=>p.split(',').map(Number));
      assert.equal(points.length,expected.polygons[i].points.length);
      for(let j=0;j<points.length;j++) {
        const [x,y]=expected.polygons[i].points[j];
        assert.ok(Math.abs(points[j][0]-(left+(x-expected.minX)*scale))<1e-8,`actual desktop x ${key}/${i}/${j}`);
        assert.ok(Math.abs(points[j][1]-(150-y*scale))<1e-8,`actual desktop y ${key}/${i}/${j}`);
      }
    }
    if(key==='sample') {
      assert.equal(expected.polygons.length,5);
      assert.ok(Math.abs(expected.maxX-.52)<1e-12);
      assert.ok(Math.abs(expected.radius-.0884734)<1e-12);
      for (const [width, height] of [[1440, 1000], [2548, 700], [1024, 600], [390, 844]]) {
        await page.setViewportSize({ width, height });
        for (const [unit, factor] of [['m', 1], ['in', .0254]]) {
          await page.getByLabel('Length units', { exact: true }).selectOption(unit);
          for (const zoom of [1, 1.25]) {
            if (zoom > 1) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
            if (zoom > 1) await page.locator('.drawing-canvas').evaluate(element => { element.scrollLeft = 40; element.scrollTop = 30; });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const nose = await polygons.first().evaluate(node => node.getBoundingClientRect().toJSON());
            const tail = Math.max(...await polygons.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().right)));
            const ruler = page.getByTestId('rocket-ruler');
            const top = await ruler.locator('..').evaluate(element => element.getBoundingClientRect().top);
            const containerTop = await page.locator('.rocket-drawing').evaluate(element => element.getBoundingClientRect().top + element.clientTop);
            assert.ok(Math.abs(top - containerTop) < .1, 'ruler remains at the top edge of rocket-drawing during resize, zoom and scroll');
            const baseline = await ruler.locator(':scope > line').evaluate(node => node.getBoundingClientRect().toJSON());
            assert.ok(Math.abs(baseline.x - nose.x) < .1, `ruler begins at the nose ${JSON.stringify({ width, height, unit, zoom, baseline, nose })}`);
            assert.ok(Math.abs(baseline.x + baseline.width - tail) < .1, 'ruler ends at the rocket extent');
            const labels = await ruler.locator('text').evaluateAll(nodes => nodes.map(node => ({ value: Number(node.textContent),
              anchor: new DOMPoint(node.x.baseVal[0].value, node.y.baseVal[0].value).matrixTransform(node.getScreenCTM()).x,
              centered: getComputedStyle(node).textAnchor === 'middle', tick: node.parentElement.querySelector('line').getBoundingClientRect().x })));
            assert.equal(labels[0].value, 0, 'zero is explicitly labeled at the rocket origin');
            assert.ok(Math.abs(labels[0].tick - nose.x) < .1, 'zero tick is directly above the nose');
            for (const label of labels) {
              assert.ok(label.centered && Math.abs(label.anchor - label.tick) < .1, 'each label is centered on its major tick');
              assert.ok(Math.abs(label.tick - (nose.x + label.value * factor / .52 * (tail - nose.x))) < .1, 'tick distance matches the known 0.52 m rocket and independent unit factor');
              assert.ok(label.value >= 0 && label.value * factor <= .52 + 1e-10);
            }
            report.ruler.push({ width, height, unit, zoom, labels: labels.map(label => label.value) });
            if (width === 2548 && unit === 'in' && zoom === 1) await page.screenshot({ path: resolve(output, 'ruler-centered-inches.png') });
          }
          await page.locator('.zoom-controls button').nth(1).click();
        }
      }
      await page.setViewportSize({ width: 1440, height: 1100 });
      await page.getByLabel('Length units', { exact: true }).selectOption('m');
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
  console.log('Rocket drawing passed: native vertices and selection; ruler origin, extent, tick/label alignment and independent metre/inch distances across four viewports and two zoom levels.');
} catch(error) {report.outcome='failed';report.error=String(error);throw error;}
finally {await writeFile(resolve(output,'drawing-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
