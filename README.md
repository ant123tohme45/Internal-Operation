# Internal Operations Service Hub

A company-internal system for requesting and tracking help from departments such as IT, HR, and Finance — instead of scattering requests across email, chat, and phone calls with no visibility into status.

This repository now contains a working, narrow slice of the product end to end: a React frontend, a NestJS backend, and real database persistence, covering one flow — **submit a service request, see it in "My requests", cancel it while it's still waiting.** See [docs/full-stack-delivery.md](docs/full-stack-delivery.md) for exactly what that flow proves (authorization, validation, error handling, and tests) and why it's the flow that was chosen.

## Repository structure

```
Internal_Operation/
  README.md                    - this file: install, run, exercise the flow, run the tests
  backend/                     - NestJS API + SQLite persistence (source of truth)
    src/service-requests/      - the ServiceRequest flow: controller, service, entities, rules
    src/app.module.ts          - wires the database connection
    test/                      - integration test (service <-> real DB) and HTTP/regression e2e test
    README.md                  - backend-specific detail (Week 2 walkthrough, endpoint table)
  frontend/                    - React (Vite) UI for the same flow
    src/App.tsx                - the whole UI: identity switcher, submit form, "My requests", status/history modal, cancel
    src/api.ts                 - the typed client for the backend's HTTP contract
  e2e/                         - Playwright test driving the real frontend + real backend + real DB
  playwright.config.ts         - starts both servers against a throwaway database for the E2E run
  docs/
    full-stack-delivery.md - this milestone: contract, authorization rule, tests (read this first)
    product-spec.md            - problem, actors, requirements, acceptance criteria
    architecture.md            - browse/search component design (background context)
    data-model.md              - entities, relationships, invariants, storage and access reasoning
    decisions/
      ADR-001.md                - why request status is an event history + a current-status field
```

## Reading order

1. **[docs/full-stack-delivery.md](docs/full-stack-delivery.md)** — what this milestone delivers: the API contract, the authorization rule, the invalid-request and expected-failure cases, and where every test lives.
2. **[docs/product-spec.md](docs/product-spec.md)** → **[docs/architecture.md](docs/architecture.md)** → **[docs/data-model.md](docs/data-model.md)** → **[docs/decisions/ADR-001.md](docs/decisions/ADR-001.md)** — the product foundation this flow was built on (Weeks 1–2).
3. **[backend/README.md](backend/README.md)** — backend-only detail, including the original Week 2 walkthrough.

## 1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | 20.19+ or 22+ (LTS) | `node -v` |
| npm | comes with Node.js | `npm -v` |

No database server to install — persistence is SQLite, a file on disk, created automatically the first time the backend runs.

## 2. Install

From the repository root:

```bash
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm install                      # installs Playwright, used only for the E2E test (section 5)
npx playwright install chromium  # downloads the browser the E2E test drives
```

## 3. Run it

Two terminals, both from the repository root.

**Terminal 1 — backend** (builds once, then runs the compiled output; `backend/README.md` explains why `npm run dev` is unreliable on Windows and this is the path actually verified):

```bash
cd backend
npm run build
npm start
```

You should see `Operations Hub backend is running on http://localhost:3001`. On first run this also creates `backend/data/operations-hub.sqlite` and seeds it with the fixed employees/services listed below — this file is what makes the data real: stop the backend, start it again, and everything you did is still there.

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev

```

Open the URL Vite prints (typically `http://localhost:5173`).

> Both default ports (`3001` for the backend, `5173` for the frontend) can be overridden — backend via `PORT=<port> npm start`, frontend via `npm run dev -- --port <port>` plus `VITE_API_URL=http://localhost:<backend-port>` (see `frontend/.env.example`) if you also moved the backend.

## 4. Exercise the flow

Seed data (fixed, same as Week 2 — see `backend/README.md` section 5 for the full table):

| Employee id | Name |
|---|---|
| `EMP-1` | Rana Fares |
| `EMP-2` | Omar Saade |
| `EMP-3` | Dana Khalil |

In the browser:

1. **Acting as** — pick an employee from the switcher in the top bar (e.g. Rana Fares / `EMP-1`). There's no login yet; this stands in for "who's signed in" (see `docs/full-stack-delivery.md` section 4) and is sent as the `X-Employee-Id` header on every request.
2. **Submit a request** — pick a service, optionally add a comment, click "Submit request". It appears under "My requests" as **Submitted**.
3. **Click the request to see its status** — clicking any row in "My requests" opens its detail view: current status, when it was submitted, and a full timeline of every status change (who changed it and when — the same `RequestStatusEvent` history from `docs/data-model.md`/ADR-001, not just the current badge).
4. **Cancel it** — from that same detail view, click "Cancel this request". It becomes **Cancelled** and the button disappears (only a `Submitted` request is cancellable — see section 6 of the delivery doc).
5. **See the authorization rule** — switch "Acting as" to a different employee, then submit a request as *them*, and note its id (`REQ-xxxx`). Switch "Acting as" back to the first employee and use "Find a request" to look that id up — its detail view opens (so you can still see its status), but clicking "Cancel this request" is refused with a 403 message, because only the request's own owner can cancel it.
6. **Add an employee** — click "+ Add employee" in the top bar, fill in an id, name, and department, and submit. Once the backend verifies the id isn't already taken, a confirmation banner drops down from the top of the screen and the new employee is immediately selectable in "Acting as".
7. **Add a service** — click "+ Add service" next to the service picker in "New request", fill in an id, name, and owning department. Same verification and toast as adding an employee, and the new service is immediately selected.
8. **Search and filter "My requests"** — once you have a few requests, use the search box (matches id or service name) and the status dropdown above the list to narrow it down.

The same walkthrough, against the raw API with curl, is in `docs/full-stack-delivery.md` sections 4–6 (and the original Week 2 status-transition walkthrough is in `backend/README.md` section 7).

## 5. Run the automated tests

**Backend unit tests** (business rule — `status-transitions.spec.ts`, no HTTP, no database):
```bash
cd backend
npm test
```

**Backend integration + regression/HTTP tests** (real SQLite database, in-memory for speed; see `docs/full-stack-delivery.md` sections 7.2–7.3):
```bash
cd backend
npm run test:e2e
```

**End-to-end test** (real browser, real built frontend, real backend, real throwaway SQLite file — starts both servers itself, so don't have Terminal 1/2 from section 3 running on the same ports first):
```bash
npm run test:e2e     # from the repository root
```

All three are independent — run any of them without the others. `npm run test:e2e` (root) rebuilds the backend automatically before starting it, so there's no separate build step to remember.

## 6. Status

- Specification, architecture (browse/search), and data model: done (Weeks 1–2, unchanged this milestone).
- Backend `ServiceRequest` lifecycle (submit, ops-team status transitions): done (Week 2).
- **This milestone (Week 3): submit + cancel, full stack, real persistence, authorization, and the test suite in section 5 — done.** See `docs/full-stack-delivery.md` for the complete writeup, including what's deliberately still out of scope (real login, CI/CD, deployment — section 8).
