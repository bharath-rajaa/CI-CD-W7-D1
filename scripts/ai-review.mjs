// Sends the failure summary and the tail of the CI log to Claude for a first-pass review.
// Never fails the build: it exits 0 whatever happens, so it can only add information.
// Logs are sent to an external API, so check your policy first. GitHub masks secret values in logs,
// but other sensitive data (customer names, URLs) can still appear.
import { appendFile, readFile, writeFile } from 'node:fs/promises';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5';
const LOG_PATH = process.argv[2] ?? 'reports/ci-log.txt';
const SUMMARY_PATH = 'reports/failure-summary.md';
const OUT_PATH = 'reports/ai-review.md';
const MAX_LOG_CHARS = 30_000;

async function readOptional(p) {
  try { return await readFile(p, 'utf8'); } catch { return ''; }
}

if (!API_KEY) {
  console.log('ANTHROPIC_API_KEY is not set, so the AI review was skipped. See reports/failure-summary.md.');
  process.exit(0);
}

const log = (await readOptional(LOG_PATH)).slice(-MAX_LOG_CHARS);
const summary = await readOptional(SUMMARY_PATH);
if (!log && !summary) {
  console.log('No CI log or failure summary found. Nothing to review.');
  process.exit(0);
}

const system = [
  'You review the output of a Playwright end-to-end test run in CI.',
  'For each failure, classify it as SETUP (environment variables, secrets, server start-up, browser install, network),',
  'PRODUCT (the application behaved differently from the expected behaviour), or FLAKY/UNKNOWN (timing or insufficient evidence).',
  'For each failure give: the classification, the most likely root cause, one short quote of evidence from the log,',
  'and one concrete next step. Keep it under 250 words. Do not invent details that are not in the log.',
].join(' ');

try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{
        role: 'user',
        content: `Failure summary:\n${summary || '(none)'}\n\nCI log (tail):\n${log || '(empty)'}`,
      }],
    }),
  });

  if (!res.ok) {
    console.error(`AI review failed: HTTP ${res.status} ${await res.text()}`);
    process.exit(0);
  }

  const data = await res.json();
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const out = `## AI review of CI log (${MODEL})\n\n${text}\n`;
  await writeFile(OUT_PATH, out);
  console.log(out);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, out);
} catch (err) {
  console.error('AI review failed:', err);
}
process.exit(0);
