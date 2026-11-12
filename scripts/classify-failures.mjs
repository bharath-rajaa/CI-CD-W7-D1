// Reads reports/junit.xml (and reports/ci-log.txt) and labels each failure:
//   SETUP   - environment, secrets, server start-up, browser install (fix the pipeline)
//   PRODUCT - the app behaved differently from the expected behaviour (file a defect)
//   UNKNOWN - triage by hand using the trace and screenshot
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const JUNIT_PATH = 'reports/junit.xml';
const LOG_PATH = 'reports/ci-log.txt';
const OUT_PATH = 'reports/failure-summary.md';

const SETUP_PATTERNS = [
  /SETUP_ERROR/,
  /missing required environment/i,
  /is not set/i,
  /ECONNREFUSED/,
  /ERR_CONNECTION_REFUSED/,
  /EADDRINUSE/,
  /config\.webServer/,
  /not able to start/i,
  /exited early/i,
  /Executable doesn't exist/i,
  /playwright install/i,
];

const PRODUCT_PATTERNS = [
  /Expected(?: string| pattern)?:/,
  /Received(?: string)?:/,
  /AssertionError/,
  /to(?:Have|Contain|Be|Equal|Match)[A-Za-z]*\(/,
];

const HINTS = {
  SETUP: 'Fix configuration: secrets, environment variables, server start-up or browser install. Do not file a product defect.',
  PRODUCT: 'Reproduce locally, compare with the expected behaviour, then file a defect with the trace attached.',
  UNKNOWN: 'Open the trace and screenshot from the artefacts and triage by hand.',
};

const decode = (s = '') =>
  s.replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&#13;/g, '')
    .replace(/&amp;/g, '&');

const attr = (s, key) => {
  const m = new RegExp(`\\b${key}="([^"]*)"`).exec(s);
  return m ? decode(m[1]) : '';
};

const classify = (text) => {
  if (SETUP_PATTERNS.some((p) => p.test(text))) return 'SETUP';
  if (PRODUCT_PATTERNS.some((p) => p.test(text))) return 'PRODUCT';
  return 'UNKNOWN';
};

const firstLine = (t) => (t.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 200);
const escapeCell = (t) => t.replace(/\|/g, '\\|');

async function readOptional(p) {
  try { return await readFile(p, 'utf8'); } catch { return null; }
}

const xml = await readOptional(JUNIT_PATH);
const log = (await readOptional(LOG_PATH)) ?? '';
const rows = [];

if (xml === null) {
  rows.push({ kind: 'SETUP', test: '(run level)', message: 'No JUnit report was produced, so no tests ran.' });
} else {
  const caseRe = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let c;
  while ((c = caseRe.exec(xml)) !== null) {
    const body = c[2] ?? '';
    const f = /<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
    if (!f) continue;
    const message = attr(f[2], 'message');
    const detail = decode(f[3] ?? '');
    rows.push({
      kind: classify(`${message}\n${detail}`),
      test: `${attr(c[1], 'classname')} > ${attr(c[1], 'name')}`,
      message: firstLine(message || detail),
    });
  }

  // A failing global setup can produce no testcase rows, so check the log too.
  const runLevel = log.split('\n').find((l) => /SETUP_ERROR|config\.webServer|not able to start/.test(l));
  if (rows.length === 0 && runLevel) {
    rows.push({ kind: 'SETUP', test: '(run level)', message: firstLine(decode(runLevel)) });
  }
}

const counts = { SETUP: 0, PRODUCT: 0, UNKNOWN: 0 };
rows.forEach((r) => { counts[r.kind]++; });

const lines = ['# Failure triage', ''];
if (rows.length === 0) {
  lines.push('All tests passed. Nothing to triage.');
} else {
  lines.push(
    `Setup: **${counts.SETUP}** | Product: **${counts.PRODUCT}** | Unknown: **${counts.UNKNOWN}**`,
    '',
    '| Classification | Test | Message | Next step |',
    '|---|---|---|---|',
  );
  for (const r of rows) {
    lines.push(`| ${r.kind} | ${escapeCell(r.test)} | ${escapeCell(r.message)} | ${HINTS[r.kind]} |`);
  }
}

const md = lines.join('\n') + '\n';
await mkdir('reports', { recursive: true });
await writeFile(OUT_PATH, md);
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
