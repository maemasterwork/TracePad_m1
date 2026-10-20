// Differential test: run every item from <lesson>.items.json in Pyodide (the browser engine, via the exact
// runner.py the app ships) and compare with what real CPython printed. Non-deterministic items must only agree on
// success or failure. Exits 1 on any difference.
// Usage: node tools/content/engine_check.mjs <items.json> [more items.json ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPyodide } from 'pyodide';

const here = path.dirname(fileURLToPath(import.meta.url));
const runnerSrc = fs.readFileSync(path.join(here, '../../apps/web/src/runner/runner.py'), 'utf8');
const py = await loadPyodide();
py.runPython(runnerSrc);
const run = py.globals.get('run');
console.log('engine Python', py.runPython('import sys; sys.version.split()[0]'));

const norm = (s) => s.replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\s+$/, '');
let total = 0, bad = 0, nondet = 0;
const problems = [];
for (const file of process.argv.slice(2)) {
  const { items, python } = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`${file}: ${items.length} items (reference CPython ${python})`);
  let n = 0;
  for (const it of items) {
    total++;
    const cwd = `/tmp/run${n++}`;
    const r = run(it.code, it.stdin || '', false, cwd, undefined, 1000000, 1500, it.prelude || '');
    const got = r.toJs({ dict_converter: Object.fromEntries });
    r.destroy();
    if (it.nondeterministic) {
      nondet++;
      if (got.ok !== it.cpython.ok) { bad++; problems.push(`${it.id}: ok=${got.ok} but CPython ok=${it.cpython.ok}`); }
      continue;
    }
    if (got.ok !== it.cpython.ok) { bad++; problems.push(`${it.id}: engine ok=${got.ok} (${got.error?.type}: ${got.error?.message}) but CPython ok=${it.cpython.ok}`); continue; }
    if (norm(got.stdout) !== norm(it.cpython.stdout)) {
      bad++;
      problems.push(`${it.id}: output differs\n    engine : ${JSON.stringify(got.stdout).slice(0, 200)}\n    cpython: ${JSON.stringify(it.cpython.stdout).slice(0, 200)}`);
    }
  }
}
if (bad) {
  console.log(`ENGINE CHECK FAILED: ${bad} of ${total} differ`);
  problems.slice(0, 40).forEach((p) => console.log('  -', p));
  process.exit(1);
}
console.log(`engine check ok: ${total} items match CPython (${nondet} non-deterministic items only had to succeed)`);
