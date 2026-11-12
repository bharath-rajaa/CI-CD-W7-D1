# Hands-on lab: green run and controlled failure

**Goal:** run the sample suite in GitHub Actions, capture one successful run and one controlled failure,
and show that you can tell a setup failure from a product defect.

## 0. Prepare the repository

1. Create a GitHub repository and push this project to it.
2. **Settings > Secrets and variables > Actions > New repository secret.** Add:
   - `TEST_USERNAME` with value `demo`
   - `TEST_PASSWORD` with value `demo-pass`
   - `ANTHROPIC_API_KEY` (optional, enables AI review)
3. **Settings > Branches.** Add a protection rule for `main` that requires a PR and the `E2E (chromium)` check.

## 1. Successful run (green)

1. Create a branch: `git checkout -b lab/green-run`. Make a small change, such as a comment in `README.md`.
2. Push it and open a PR. The PR template fills in automatically.
3. Open the **Checks** tab. Wait for **E2E (chromium)** to turn green.
4. Open the run and download the `playwright-reports-...` artefact. Open `reports/html/index.html` and confirm that
   3 tests passed.
5. Open the run **Summary** page. The Failure triage section should read "All tests passed. Nothing to triage."

**Capture:** a screenshot of the green check, the run URL, and the Summary page.

## 2. Controlled failure (red, product defect)

The lab uses a product defect that is built into the app. In `sample-app/app.js`, the `defect` variant shows
"Something went wrong" instead of "Invalid username or password." The workflow switches to this variant
through an input, so the same code is green in one run and red in another.

1. Go to **Actions > Playwright CI > Run workflow**. Choose branch `lab/green-run` (or `main`).
   Tick **inject_defect** and run it.
2. The run goes red. Only `login > invalid credentials show the specified error message` should fail.
3. Read **Failure triage** on the Summary page. The expected label is **PRODUCT**, with an `Expected`/`Received` message.
4. Download the artefacts. Open the trace for the failing test:
   `npx playwright show-trace reports/test-results/<test-folder>/trace.zip`.
   Check the screenshot. It should show the generic error message.
5. Optional: open the **AI review** step. Compare the model's classification with the triage table. Does it agree?

**Capture:** the failed run URL, the triage table, and one trace or screenshot that shows the defect.

## 3. Controlled setup failure (red, pipeline problem)

Show that a configuration problem looks different from a defect.

1. In repository settings, rename the `TEST_PASSWORD` secret to `TEST_PASS` (or delete it).
2. Re-run the workflow with **inject_defect unticked**.
3. The run goes red, but the triage table should now label the failure **SETUP** with the
   `SETUP_ERROR: missing required environment variable(s)` message, and no product test should show as a defect.
4. Restore the secret and re-run. The build should be green again.

**Capture:** the SETUP triage row and the restored green run.

Why it matters: if you had filed this as a product bug, you would have sent the team looking in the wrong place.

## 4. Reflection (answer in your PR description or a short doc)

1. Which signals told you the difference between step 2 and step 3 without opening the code?
2. Why is `retries: 0` set in `playwright.config.ts`? When would you turn retries on, and what risk does that carry?
3. Which of the secrets would you rotate first if the repository's logs were exposed? Why?
4. Where in the workflow would you add a required quality gate for a merge to `main`, and why not after the merge?
5. Compare the AI review with the deterministic classifier. Which one would you trust in a pipeline, and which one
   would you use as a starting point for a human?

## Deliverables checklist

- [ ] Successful run: link, screenshot, and the HTML report artefact
- [ ] Controlled failure: link, triage table, and one trace or screenshot
- [ ] Setup failure: link and the SETUP triage row
- [ ] Reflection answers
