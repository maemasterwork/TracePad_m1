// Self-host Pyodide: copy the runtime files from node_modules into public/pyodide (gitignored). Runs before dev/build.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const src = path.dirname(require.resolve('pyodide/package.json'));
const dst = path.resolve(import.meta.dirname, '../public/pyodide');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
fs.copyFileSync(path.resolve(import.meta.dirname, '../src/runner/runner.py'), path.join(dst, 'runner.py'));
const v = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(dst, 'VERSION'), v + '\n');
console.log(`pyodide ${v} copied to public/pyodide`);
