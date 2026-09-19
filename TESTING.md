# Frontend automated tests

## What these tests do

The frontend has its own test suite. Vitest runs tests, React Testing Library
renders React behavior, and jsdom supplies a simulated browser. Tests provide
fictional API responses, so Python, PostgreSQL, Gemini, and cloud credentials
are not needed.

Tests follow three steps: prepare a visitor and API response, perform an action,
and check the result. Consent tests, for example, verify that the frontend sends
the displayed terms before granting consent and handles failed withdrawal
without falsely reporting that consent was withdrawn.

## Files

| File | Purpose |
| --- | --- |
| `vitest.config.ts` | Selects the test folder and simulated browser environment. |
| `src/test/setup.ts` | Clears browser storage and mocks between tests; replaces network requests with controlled responses. |
| `src/test/fixtures.ts` | Supplies fictional consent data and reusable response helpers. |
| `src/test/consent.test.tsx` | Agreement, policy changes, unavailable terms, and withdrawal confirmation. |
| `src/test/session.test.tsx` | Session initialization and invite-code verification. |
| `src/test/chat-dispatch.test.tsx` | Rapid message grouping, queued requests, conversation IDs, and failure handling. |
| `src/test/chat-storage.test.tsx` | Restoring chat state and handling corrupt or unavailable browser storage. |
| `src/test/site-content.test.tsx` | Content loading, empty/error states, and retries. |
| `.github/workflows/deploy.yml` | Runs checks on GitHub and publishes candidate images only after checks pass. |

## Run locally

Use Node.js 22.12+ (the Docker build and CI also use Node 22) and open a terminal in `persona_stand_front`:

```powershell
npm ci
npm test
```

`npm ci` installs exactly the dependency versions recorded in the lockfile.
`npm test` runs the tests once and reports which checks passed or failed.

```powershell
npm run test:watch
```

Watch mode reruns affected tests as you edit files. Press `q` to exit.

For the checks used on GitHub:

```powershell
npm run lint
npm run test:ci
$env:VITE_CDN_BASE = 'https://cdn.example.test'
npm run build
Remove-Item Env:VITE_CDN_BASE
```

The build command checks TypeScript and generates the website. The fictional
CDN address makes this validation independent of production configuration;
do not publish this validation build. Your usual local `.env` can provide the
real CDN address for development and Docker builds. If your shell already has
`VITE_CDN_BASE`, restore that value after validation instead of removing it.

`test:ci` also writes `test-results/frontend.xml`, a machine-readable JUnit
report. On a failure, read the test name and the expected/received values in
the terminal or GitHub Actions log, then rerun that test while investigating.

## What happens after a push

Every push and pull request runs:

```text
Install dependencies → lint → behavior tests → TypeScript and build checks
```

After passing checks, **every branch push**, including dev, builds and publishes a commit-specific GHCR image using the real `VITE_CDN_BASE`. Pull-request events do not publish. `scripts/publish_image.py` reuses existing commit images on reruns, verifies source/revision labels and emits `image.json` with the immutable digest and full source SHA.

Publication uses the automatic `GITHUB_TOKEN` with `packages: write`; no AWS settings are needed. Keep VITE_CDN_BASE. Grant ec2yml Actions read access in the GHCR package settings. Keep commit tags and tested images; changed image contents require a new source commit.

The ec2yml repository selects frontend/backend GHCR digests and runs the same combined Playwright workflow for minor and major updates. Minor updates stay in GHCR. An explicitly approved major release copies the successful tested images to ECR without rebuilding, then EC2 deploys only promoted ECR digests. Application pushes can happen in either order. One-time infrastructure setup is in ec2yml Part A.6. Repeat the minor/major update steps in Part C.0; minor updates stop after C.0.2.

## Scope and known limits

These tests check frontend behavior with controlled API responses. They cannot
prove that a real backend returns the expected response, that Gemini produces
good answers, or that production media and infrastructure are available.
Combined browser tests belong in `persona_stand_ec2yml`; backend rules and
database behavior belong in `persona_stand_back`.

The existing issue where navigating away before the message hold timer fires
can drop unsent held text remains unresolved. The testing work does not define
that behavior as correct or change the product decision about preserving it.
