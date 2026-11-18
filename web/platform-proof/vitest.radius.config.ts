import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import type { TestCase } from 'vitest/node';

const input = process.env.ORK_RADIUS_INPUT;
const fixture = input ? await readFile(input) : zipSync({ 'rocket.ork': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<openrocket version="1.11" creator="G1 radius fixture"><rocket><name>Radius fixture</name><id>10000000-0000-4000-8000-000000000000</id>
<subcomponents><stage><name>Stage</name><id>10000001-0000-4000-8000-000000000000</id><subcomponents>
<bodytube><name>Tube</name><id>10000002-0000-4000-8000-000000000000</id><length>0.7619999999999998</length><radius>0.0284734</radius><thickness>0.0011429999999999982</thickness><material type="bulk" density="1850.0">Fiberglass</material></bodytube>
</subcomponents></stage></subcomponents></rocket></openrocket>`), 'opaque.bin': new Uint8Array([1, 3, 5, 7]) }, { level: 6, mtime: new Date(1980, 0, 1) });
const output = resolve(process.env.ORK_RADIUS_OUTPUT || 'build/radius-proof');

// Node is used only by this test reporter to retain files produced inside workerd.
// Application modules never import fs or receive the local source file's path.
const artifacts = {
  async onTestCaseResult(test: TestCase) {
    await mkdir(output, { recursive: true });
    for (const annotation of test.annotations()) {
      if (annotation.type !== 'radius-proof-artifacts') continue;
      const { exports, ...report } = JSON.parse(annotation.message);
      await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      await writeFile(resolve(output, 'original.ork'), fixture);
      for (const file of exports) {
        if (!['normal.ork', 'shrink.ork'].includes(file.name)) throw new Error('Unexpected proof artifact');
        await writeFile(resolve(output, file.name), Buffer.from(file.base64, 'base64'));
      }
    }
  },
};
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.radius.jsonc' }, miniflare: { bindings: {
    TEST_MIGRATIONS: await readD1Migrations('migrations'), AUTH_SECRET: 'local-radius-test-only-secret-longer-than-thirty-two-bytes',
    RADIUS_FIXTURE_BASE64: Buffer.from(fixture).toString('base64'), RADIUS_FIXTURE_SOURCE: input ? 'external-input' : 'generated-test-archive',
  } } })],
  test: { include: ['radius-proof/integration.ts'], testTimeout: 120000, hookTimeout: 60000, reporters: ['default', artifacts] },
});
