# CI Playwright Lab

A Playwright end-to-end suite that runs in GitHub Actions. It covers CI concepts, the Git and PR workflow,
environment variables and secrets, reports and failure artefacts, setup-versus-defect triage, and AI-assisted
log review. The app under test is a small bundled login app, so the lab runs with no external dependencies.

For the hands-on exercise, see [LAB.md](LAB.md).

## Layout


```
.github/
  workflows/ci.yml          Pipeline: install, test, classify, AI review, upload artefacts
  pull_request_template.md  PR checklist
playwright.config.ts        Reporters, artefact policy, web server
tests/
  global-setup.ts           Environment check (raises SETUP_ERROR)
  smoke.spec.ts             @smoke tests
  login.spec.ts             Login behaviour (fails in the lab's defect mode)
  pages/login-page.ts       Page object
sample-app/                 The app under test (static HTML/JS plus a tiny login API)
scripts/
  serve.mjs                 Zero-dependency server for the sample app
  classify-failures.mjs     Labels each failure SETUP, PRODUCT or UNKNOWN
  ai-review.mjs             Optional AI review of the CI log
.env.example                Template for local environment variables
```

## Quick start

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env          # optional: the defaults in the file are enough
npm test                      # full suite
npm run test:smoke            # @smoke subset
npm run report                # open the HTML report
npm run classify              # triage the last run (needs reports/junit.xml)
```

The config starts the sample app automatically. To test a deployed environment, set `BASE_URL` and the
bundled server is not started.

## CI concepts used here

- **Trigger:** `push` to `main`, `pull_request`, and `workflow_dispatch` (a manual run with inputs).
- **Job:** one clean Ubuntu runner per run. Nothing persists between runs unless you cache or upload it.
- **Steps:** install, run tests, then `if: always()` steps that still run after a failure, such as classification and uploads.
- **Concurrency:** `cancel-in-progress` stops an older run on the same branch when a new commit arrives, which saves minutes.
- **Least privilege:** `permissions: contents: read` gives the workflow only the access it needs.
- **Timeouts:** `timeout-minutes` stops a hung browser from consuming the runner for hours.

## Git workflow and pull requests

1. Protect `main`. In **Settings > Branches**, require a pull request and require the `E2E (chromium)` status check to pass before merging.
2. Branch from `main` for each change (`feat/login-error-message`, `fix/...`). Keep branches short-lived.
3. Open a PR. The template asks for the change, how it was tested, and anything reviewers should look at.
4. CI runs on the PR. A red run is a conversation starter: read the classification summary before you change code.
5. Merge after review and a green run. The `push` trigger then runs CI on `main` to confirm the merged state.

Pull requests from forks do not receive repository secrets, so E2E runs for fork PRs will fail at the setup check.
That is expected. Maintainers can re-run from a branch in the main repository.

## Environment variables and secrets

| Name | Where it is set | Used by | Notes |
|---|---|---|---|
| `TEST_USERNAME`, `TEST_PASSWORD` | `.env` locally, repository secrets in CI | Tests | Required. Missing values raise `SETUP_ERROR`. |
| `APP_USERNAME`, `APP_PASSWORD` | Same values as `TEST_*` | Sample app server | Required when the bundled app runs. |
| `APP_VARIANT` | Workflow input (lab only) | Sample app | `stable` (default) or `defect`. |
| `BASE_URL` | Optional | Playwright | Points tests at a deployed environment. |
| `PORT` | Optional | Sample app | Defaults to 4173. |
| `ANTHROPIC_API_KEY` | Optional repository secret | AI review | If absent, the AI step is skipped. |
| `CI` | Set automatically by GitHub | Playwright config | Enables retries off, `forbidOnly`, and the 2-worker limit. |

Rules to follow:

- Never commit `.env`. `.gitignore` already excludes it.
- Store credentials as encrypted repository secrets (**Settings > Secrets and variables > Actions**). Use separate test accounts, never real customer accounts.
- Secrets are masked in logs, but masking only matches the exact value. Do not print derived values, such as a password split into parts, from your own scripts.
- Pass secrets to the step that needs them through `env:`. Do not interpolate them into `run:` commands.

## Pipeline walkthrough

`.github/workflows/ci.yml` runs these steps in order:

1. **Checkout and Node setup.**
2. **Install** dependencies and the Chromium browser (`--with-deps` installs OS libraries).
3. **Run tests.** The output is piped through `tee` into `reports/ci-log.txt`, and `pipefail` makes the step fail when the tests fail.
4. **Classify failures** (`if: always()`). Writes `reports/failure-summary.md` and posts it to the run's Summary page.
5. **AI review** (`if: failure()`, `continue-on-error: true`). Only runs when a secret is configured, and never blocks the build.
6. **Upload artefacts** (`if: always()`). Uploads `reports/`: the HTML report, JUnit XML, the CI log, the classification summary, the AI review, and per-test traces, screenshots and videos.

## Reports and failure artefacts

| Artefact | Path | Use it for |
|---|---|---|
| HTML report | `reports/html/` | Browsing every test and its steps. Open `index.html`, or run `npm run report`. |
| JUnit XML | `reports/junit.xml` | Machine-readable results. CI systems and the classifier read it. |
| CI log | `reports/ci-log.txt` | Full console output, the input to AI review. |
| Failure summary | `reports/failure-summary.md` | First-pass triage table. |
| Traces | `reports/test-results/**/trace.zip` | Step-by-step replay. Open with `npx playwright show-trace <file>`. |
| Screenshots and videos | `reports/test-results/**` | Quick visual evidence, kept only for failed tests. |

Retention is 14 days. Download artefacts from the run page under **Artifacts**.

## Setup failures versus product defects

A red build does not automatically mean the product is broken. The first question is whether the test ever
reached the application.

| Signal in the output | Classification | What to do |
|---|---|---|
| `SETUP_ERROR: missing required environment variable(s)` | SETUP | Set the missing secret or variable. |
| `config.webServer` / "not able to start" / `EADDRINUSE` | SETUP | Check the server start command, port and env. |
| `ECONNREFUSED`, `ERR_CONNECTION_REFUSED` | SETUP | The app is not reachable. Check `BASE_URL`. |
| `Executable doesn't exist` | SETUP | Browser not installed. Run `npx playwright install`. |
| `Expected: ... Received: ...` on a `toHaveText` or `toBeVisible` | PRODUCT (candidate) | Reproduce locally. Compare with the requirement. |
| Anything else | UNKNOWN | Open the trace and screenshot. |

`scripts/classify-failures.mjs` applies these rules automatically. A missing JUnit report is treated as a setup failure,
because the tests never ran. The classifier is a triage aid, not an oracle. Check its label against the trace before
you file a defect.

## Reviewing CI logs with AI

`scripts/ai-review.mjs` sends the failure summary and the last 30,000 characters of the CI log to the Claude API, and asks for:
the classification, the likely root cause, a short quote of evidence, and a next step. It writes the answer to
`reports/ai-review.md` and the run summary.

To use it, add `ANTHROPIC_API_KEY` as a repository secret, or run locally:

```bash
ANTHROPIC_API_KEY=... npm test 2>&1 | tee reports/ci-log.txt; npm run classify; npm run ai-review
```

Guidance:

- Treat the review as a hypothesis. Confirm it against the trace.
- The review cannot see the app's source. It only sees what you send.
- Review logs for sensitive data before sending them outside your organisation.
- The script never fails the build, so a broken API key does not turn a green build red.
