// Bündelt die offiziellen SDKs von Anthropic und OpenAI je in eine ES-Modul-Datei für den
// Browser. Die App selbst hat keinen Build-Schritt; nur diese Fremdbibliotheken werden vorab
// gebündelt und eingecheckt. Nach einem SDK-Update: npm run vendor
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const bundles = [
  { pkg: '@anthropic-ai/sdk', out: 'app/vendor/anthropic-sdk.js' },
  { pkg: 'openai', out: 'app/vendor/openai-sdk.js' },
];

for (const { pkg, out } of bundles) {
  const meta = JSON.parse(await readFile(new URL(`../node_modules/${pkg}/package.json`, import.meta.url), 'utf8'));
  await build({
    stdin: { contents: `export { default } from '${pkg}';`, resolveDir: process.cwd() },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'inline',
    banner: { js: `/* ${pkg} ${meta.version} (${meta.license}), gebündelt mit scripts/vendor-sdk.mjs */` },
    outfile: out,
  });
  console.log(`${out} (${pkg} ${meta.version})`);
}
