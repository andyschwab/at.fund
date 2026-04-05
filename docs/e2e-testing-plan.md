# E2E Testing Plan

_Status: future work_

Notes for setting up Playwright end-to-end tests when the time is right.

---

## Why E2E

Unit tests (148 as of April 2026) cover business logic, pipeline phases, and
data validation. What they don't cover:

- **Full user flows**: login via OAuth, scan results rendering, setup form
- **Client/server integration**: NDJSON streaming, session cookie lifecycle
- **Visual regressions**: card layout, dark mode, responsive breakpoints

## Minimum viable setup

### Install

```bash
pnpm add -D @playwright/test
npx playwright install --with-deps chromium
```

### Config

Create `playwright.config.ts` at the project root:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
})
```

### Directory structure

```
tests/
  e2e/
    landing.spec.ts       # Public pages load, navigation works
    auth-flow.spec.ts     # OAuth login → session → protected page
    scan-results.spec.ts  # Scan stream renders cards correctly
```

### Package.json script

```json
"test:e2e": "playwright test"
```

## Priority test flows

### 1. Landing page (no auth)

- Home page loads without errors
- Navigation links work (Give, Lexicon, Dev)
- Protected pages redirect to home when not authenticated

### 2. Auth gate

- `/give` without session → shows login form (or redirects via proxy)
- `/setup` without session → shows login form (or redirects via proxy)
- `/admin` without session → redirects to home

### 3. Scan and results (requires auth mock)

- Login → navigate to `/give` → scan stream starts
- NDJSON events render cards progressively
- Cards show correct funding sources (fund.at, manual, unknown)
- Error boundary catches bad card data without crashing page

## Auth mocking strategy

ATProto OAuth is complex to mock in E2E. Options:

1. **Seed a test session**: Set the `did` cookie directly and mock
   `/api/auth/check` to return `{ valid: true }`. This bypasses OAuth but
   exercises the full client-side session flow.

2. **Mock the OAuth provider**: Use Playwright's `route()` API to intercept
   OAuth requests and return a canned session. More realistic but more fragile.

3. **Local dev mode**: The app already has a loopback OAuth flow for local dev.
   Playwright could drive the real login form against a local PDS.

Recommendation: start with option 1 for coverage, add option 3 later for
confidence.

## CI integration

Add to `.github/workflows/ci.yml` as an optional job (don't block PRs initially):

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: check
    if: github.event_name == 'push'  # skip on PRs until stable
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps chromium
      - run: pnpm test:e2e
```

## What not to test in E2E

- Business logic already covered by unit tests (funding resolution, identity
  building, entry priority, catalog validation)
- Server-side pipeline phases (mocked in lexicon-scan.test.ts)
- Data validation (validate.test.ts)

E2E tests should focus on **integration seams** and **user-visible behavior**,
not reimplementing unit test coverage.
