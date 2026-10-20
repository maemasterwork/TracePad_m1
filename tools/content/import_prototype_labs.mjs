// One-time importer: evaluates the prototype's LABS object (from its index.html) and writes JSON with RegExps as
// {pattern, flags}. After import, labs.yml is the hand-owned source of truth; this script is kept for provenance.
// Usage: node tools/content/import_prototype_labs.mjs <labs-block.js> <out.json>
import fs from 'node:fs';
import vm from 'node:vm';
const [, , src, out] = process.argv;
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(src, 'utf8') + ';this.LABS=LABS;', ctx);
const json = JSON.stringify(ctx.LABS, (k, v) => (Object.prototype.toString.call(v) === '[object RegExp]' ? { pattern: v.source, flags: v.flags } : v), 1);
fs.writeFileSync(out, json);
