import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import type { TestCase } from 'vitest/node';

const output = resolve(process.env.ORK_EFFECTS_OUTPUT || 'build/imported-effects');
const fixtures = await Promise.all(['G1-A', 'G1-B'].map(key => readFile(resolve(output, `${key}.ork`))));

// Node is used only by this test reporter to retain files produced inside workerd.
// Application modules never import fs or receive the local source file's path.
const artifacts = {
  async onTestCaseResult(test: TestCase) {
    await mkdir(output, { recursive: true });
    for (const annotation of test.annotations()) {
      if (annotation.type !== 'effects-proof-artifacts') continue;
      const { exports, ...report } = JSON.parse(annotation.message);
      await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
      for (const file of exports) {
        if (!/^[a-z0-9-]+\.ork$/.test(file.name)) throw new Error('Unexpected proof artifact');
        await writeFile(resolve(output, file.name), Buffer.from(file.base64, 'base64'));
      }
    }
  },
};
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.radius.jsonc' }, miniflare: { bindings: {
    TEST_MIGRATIONS: await readD1Migrations('migrations'), AUTH_SECRET: 'local-radius-test-only-secret-longer-than-thirty-two-bytes',
    EFFECTS_AUTOMATIC_RING: !!process.env.ORK_EFFECTS_SIBLING_RING || process.env.ORK_EFFECTS_AUTOMATIC_RING === '1',
    EFFECTS_SIBLING_CASE: process.env.ORK_EFFECTS_SIBLING_RING || '',
    EFFECTS_FIXTURES: fixtures.map(f => f.toString('base64')), EFFECTS_DIGESTS: JSON.parse(process.env.ORK_EFFECTS_DIGESTS || '[]'),
  } } })],
  test: { include: ['effects-proof/integration.ts'], testTimeout: 120000, hookTimeout: 60000, reporters: ['default', artifacts] },
});
