// Bündelt das offizielle Anthropic-SDK in eine einzelne ES-Modul-Datei für den Browser.
// Die App selbst hat keinen Build-Schritt; nur diese Fremdbibliothek wird vorab gebündelt
// und eingecheckt. Nach einem SDK-Update: npm run vendor
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../node_modules/@anthropic-ai/sdk/package.json', import.meta.url), 'utf8'));
await build({
  stdin: { contents: "export { default, Anthropic } from '@anthropic-ai/sdk';", resolveDir: process.cwd() },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'inline',
  banner: { js: `/* @anthropic-ai/sdk ${pkg.version} (MIT), gebündelt mit scripts/vendor-sdk.mjs */` },
  outfile: 'app/vendor/anthropic-sdk.js',
});
console.log(`app/vendor/anthropic-sdk.js (SDK ${pkg.version})`);
