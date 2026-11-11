// Runs every web test suite against a static server of this repo (the same files GitHub Pages serves).
//   npm test                 all suites (parallel, a failed suite is retried once)
//   npm test -- e2e18 e2e21  only these
// A suite fails on any "FAIL" line, a crash, or (shots-all) any horizontal overflow at 412 / 360 px.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const here = path.dirname(new URL(import.meta.url).pathname);
const REPO_ROOT = path.resolve(here, '..');
const TEST_OUT = path.join(here, '.out');
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}/${path.basename(REPO_ROOT)}/`;
const JOBS = Number(process.env.TEST_JOBS) || Math.max(2, Math.min(5, os.cpus().length));

fs.mkdirSync(TEST_OUT, { recursive: true });
fs.cpSync(path.join(here, 'fixtures'), TEST_OUT, { recursive: true });

const env = { ...process.env, TEST_OUT, REPO_ROOT, BASE };
const ALL = ['test-insights', ...['', 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((n) => `e2e${n}`)
  .filter((f) => fs.existsSync(path.join(here, `${f}.mjs`))), 'shots-412', 'shots-360'];
const want = process.argv.slice(2);
const suites = want.length ? ALL.filter((s) => want.includes(s)) : ALL;

async function up() {
  try { return (await fetch(BASE)).ok; } catch { return false; }
}
let server = null;
if (!(await up())) {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.dirname(REPO_ROOT)], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

function runOnce(name) {
  const [file, args] = name.startsWith('shots-')
    ? ['shots-all.mjs', [path.join(TEST_OUT, name), name.slice(6)]]
    : [`${name}.mjs`, []];
  if (name.startsWith('shots-')) fs.mkdirSync(path.join(TEST_OUT, name), { recursive: true });
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(here, file), ...args], { cwd: TEST_OUT, env });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => p.kill('SIGKILL'), 15 * 60 * 1000);
    p.on('close', (code) => {
      clearTimeout(timer);
      const fails = out.split('\n').filter((l) => /^FAIL\b|failed\b.*[1-9]/.test(l) && !/0 failed/.test(l));
      const crash = code !== 0 && !fails.length;
      const overflow = name.startsWith('shots-') && !/overflow: none/.test(out);
      const ok = !fails.length && !crash && !overflow;
      const passed = (out.match(/^OK\b/gm) || []).length + (Number((out.match(/(\d+) passed/) || [])[1]) || 0);
      resolve({ name, ok, out, fails, crash, overflow, passed, secs: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

const results = [];
const queue = [...suites];
async function worker() {
  while (queue.length) {
    const name = queue.shift();
    let r = await runOnce(name);
    if (!r.ok) {
      console.log(`… ${name}: retrying once (${r.fails[0] || (r.crash ? 'crash' : 'overflow')})`);
      r = { ...(await runOnce(name)), retried: true };
    }
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${name} (${r.passed} checks, ${r.secs}s${r.retried ? ', retried' : ''})`);
    if (!r.ok) console.log(r.fails.length ? r.fails.join('\n') : r.out.slice(-2000));
    results.push(r);
  }
}
await Promise.all(Array.from({ length: JOBS }, worker));
server?.kill();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} suites passed${bad.length ? ` — failed: ${bad.map((r) => r.name).join(', ')}` : ''}`);
process.exit(bad.length ? 1 : 0);
