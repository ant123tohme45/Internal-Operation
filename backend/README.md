# Operations Hub — Backend

A small, working NestJS backend for **one** piece of the Internal Operations
Service Hub: the `ServiceRequest` lifecycle. It is not the whole product —
see "Non-goals" below. For the full-stack picture (frontend, tests,
authorization rule), see [`../docs/full-stack-delivery.md`](../docs/full-stack-delivery.md)
and the repository root [`README.md`](../README.md).

## 1. What this proves

Week 1 (`../docs/data-model.md`, section 3 "Lifecycle + rules (invariants)")
fixed this rule for `ServiceRequest`:

```
Submitted -> In Progress -> Resolved | Rejected
```

> "and cannot move backward (e.g. Resolved cannot return to Submitted)"

Week 2 turned that into a running API: a `PATCH .../status` endpoint that
moves a request from one status to the next, accepting the transitions the
rule allows and rejecting everything else with a reason, while keeping the
`RequestStatusEvent` history append-only and in sync with `current_status`
(the decision recorded in `../docs/decisions/ADR-001.md`).

Week 3 adds real persistence (SQLite via TypeORM — data survives a restart)
and one more edge to the lifecycle: `PATCH .../cancel`, an employee
cancelling their own request while it's still `SUBMITTED`, gated by an
authorization check (only the owner) on top of the existing business-rule
check (only while cancellable). See `../docs/full-stack-delivery.md`
sections 4–6 for the full reasoning.

Week 4 adds an AI-assisted Request Intake capability (`src/ai/`) and closes
a Weeks 1-3 gap: browse/search over the service catalog was designed
(`../docs/architecture.md`) and specified (`../docs/product-spec.md`
section 3) but never implemented — it is now. See
`../docs/week4-production-ai.md` for the full writeup.

Where each rule lives in code:

| Rule | Source | Enforced in |
|---|---|---|
| Valid/backward/skip transitions | data-model.md §3 "Lifecycle" | [`src/service-requests/status-transitions.ts`](src/service-requests/status-transitions.ts) (`canTransition`) |
| Only a `SUBMITTED` request is cancellable | Week 3 business rule | [`status-transitions.ts`](src/service-requests/status-transitions.ts) (`canCancel`) |
| Only the request's owner may cancel it | data-model.md §3 "Access" | [`service-requests.service.ts`](src/service-requests/service-requests.service.ts) (`cancelRequest`) |
| History is append-only; `current_status` stays in sync | ADR-001 | [`service-requests.service.ts`](src/service-requests/service-requests.service.ts) (`changeStatus`, `cancelRequest`, `appendEvent`) |
| A request belongs to exactly one known Employee/Service | data-model.md §3 "Ownership" | [`service-requests.service.ts`](src/service-requests/service-requests.service.ts) (`createRequest`) |
| Acting identity comes from a header, not the body | Week 3 (stand-in for login) | [`current-employee.decorator.ts`](src/service-requests/current-employee.decorator.ts) |

## 2. Non-goals

- **No real login/session system.** The `X-Employee-Id` header stands in for "who's signed in" (see `../docs/full-stack-delivery.md` section 4). A real login would replace the header with a session/JWT; the authorization checks themselves wouldn't need to change. Still intentionally unimplemented as of Week 4 — see `../docs/week4-production-ai.md` section 8.
- **No CI/CD, deployment, or monitoring.**
- **No edit/delete for employees or services** — only registering new ones (section 6).
- **No auto-submission from the AI intake capability** — it only suggests; a human always clicks "Submit request" (`../docs/week4-production-ai.md` section 4).

(Real database persistence, a frontend, and an automated test suite — all
Week 2 non-goals — are now delivered; see section 4 and
`../docs/full-stack-delivery.md`. Search/filter over the service catalog —
a Week 2/3 non-goal — is now delivered too, see section 6 below and
`../docs/week4-production-ai.md` section 8.)

## 3. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Node.js | 20.19+ or 22+ (LTS) | `node -v` |
| npm | comes with Node.js | `npm -v` |

## 4. Install and run

From this `backend/` folder:

```bash
npm install
npm run build
npm start
```

You should see:

```
Operations Hub backend is running on http://localhost:3001
```

This also creates `backend/data/operations-hub.sqlite` on first run (real,
on-disk SQLite via `better-sqlite3`/TypeORM) and seeds it with the reference
data in section 5. Stop the server, start it again, and everything you did
is still there — that's the real-persistence guarantee this backend now has.
Override the port with `PORT=<port> npm start`, and the database file with
`DB_PATH=<path> npm start` (used by the test suite to point at a throwaway
database instead — see `../docs/full-stack-delivery.md` section 2).

The Week 4 AI intake capability needs no configuration by default (a free,
deterministic provider). To use a real model instead, set `AI_PROVIDER=openai`
and `AI_API_KEY=<key>` (optionally `AI_MODEL`, `AI_BASE_URL`) before `npm start`
— see `../docs/week4-production-ai.md` section 5.

Stop it with `Ctrl+C`. Re-run `npm run build` after any source change, then
`npm start` again.

> **`npm run dev` (`nest start --watch`) is unreliable on some Windows
> setups**: it can report "Found 0 errors. Watching for file changes." and
> then immediately crash with `Cannot find module '...\dist\main'`, because
> the watcher spawns Node before the compiled `dist/main.js` is actually
> visible on disk. `npm run build && npm start` is the path actually
> verified end to end — use that if `npm run dev` fails.

## 5. Seed reference data (real rows, seeded once on first boot)

Requests may only be created against these known ids (data-model.md §3
"Ownership" — a request must belong to a *known* Employee, and a *known*
Service). They're inserted into the database the first time the backend
starts (`ServiceRequestsModule.onModuleInit`, idempotent — restarting
doesn't duplicate or reset them):

| Employee id | Name | Department |
|---|---|---|
| `EMP-1` | Rana Fares | Marketing |
| `EMP-2` | Omar Saade | Engineering |
| `EMP-3` | Dana Khalil | Finance |

| Service id | Name | Owning department |
|---|---|---|
| `SVC-1` | Laptop replacement | IT |
| `SVC-2` | Payroll correction | Finance |
| `SVC-3` | Access badge reset | HR |

Also reachable over HTTP for the frontend: `GET /api/service-requests/reference/employees` and `GET /api/service-requests/reference/services`.

## 6. Endpoints

Every mutating endpoint that acts *as* someone requires an `X-Employee-Id`
header — the acting identity. See `../docs/full-stack-delivery.md` section 3
for the full request/response contract, including error shapes. The two
exceptions are registering a new employee or service, below — there's no
identity to act as yet at that point, so they take their fields from the
body instead.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/service-requests/reference/employees` | Known employees (for a frontend identity picker) |
| `GET` | `/api/service-requests/reference/services` | Known services (for a frontend service picker) |
| `GET` | `/api/service-requests/reference/services/search?q=&category=` | Browse/search the catalog (Week 4 — see `../docs/week4-production-ai.md` section 8) |
| `POST` | `/api/service-requests/intake/suggest` | Week 4 AI-assisted Request Intake: `{ text }` in, an advisory candidate service (or none) out — no header, nothing is created (`../docs/week4-production-ai.md`) |
| `POST` | `/api/service-requests/reference/employees` | Register a new employee (`{ id, fullName, department }`, no header) — 400 if `id` is already taken or a field is missing |
| `POST` | `/api/service-requests/reference/services` | Register a new service (`{ id, name, departmentOwner }`, no header) — same validation as employees |
| `POST` | `/api/service-requests` | Submit a new request (starts at `SUBMITTED`), owned by `X-Employee-Id` |
| `GET` | `/api/service-requests` | List all requests (`?employeeId=EMP-1` to filter — the "my requests" access pattern, data-model.md §5) |
| `GET` | `/api/service-requests/:id` | One request, with its current status |
| `GET` | `/api/service-requests/:id/history` | Full status history, oldest first |
| `PATCH` | `/api/service-requests/:id/status` | Move to a new status (ops-team action) — the Week 2 state-transition behaviour |
| `PATCH` | `/api/service-requests/:id/cancel` | Cancel — owner-only, `SUBMITTED`-only (Week 3) |

## 7. Verify it: a real walkthrough

Everything below was actually run against this code (not hand-written) —
each response is the real output. Start the server first (`npm run build && npm start`),
then run these in order; later steps depend on earlier ones. (This is the
same walkthrough the automated regression test in
`test/service-requests.e2e-spec.ts` replays — see
`../docs/full-stack-delivery.md` section 7.3.)

### 7.1 Create two requests

```bash
curl -X POST http://localhost:3001/api/service-requests \
  -H "Content-Type: application/json" -H "X-Employee-Id: EMP-1" \
  -d '{"serviceId":"SVC-1","comment":"Need a laptop"}'
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"SUBMITTED","createdAt":"2026-09-16T00:00:00.000Z"}
```

```bash
curl -X POST http://localhost:3001/api/service-requests \
  -H "Content-Type: application/json" -H "X-Employee-Id: EMP-3" \
  -d '{"serviceId":"SVC-3","comment":"Badge stopped working"}'
```
```json
{"id":"REQ-1002","employeeId":"EMP-3","serviceId":"SVC-3","currentStatus":"SUBMITTED","createdAt":"2026-09-16T00:00:00.100Z"}
```

### 7.2 Valid transitions (succeed)

`SUBMITTED -> IN_PROGRESS` on REQ-1001:
```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1001/status \
  -H "Content-Type: application/json" -H "X-Employee-Id: EMP-1" -d '{"status":"IN_PROGRESS"}'
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"IN_PROGRESS","createdAt":"2026-09-16T00:00:00.000Z"}
```

`IN_PROGRESS -> RESOLVED` on REQ-1001, handled by a different employee than the submitter:
```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1001/status \
  -H "Content-Type: application/json" -H "X-Employee-Id: EMP-2" -d '{"status":"RESOLVED","comment":"Laptop handed over"}'
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"RESOLVED","createdAt":"2026-09-16T00:00:00.000Z"}
```

### 7.3 Invalid transitions (rejected, with a reason)

Terminal state — REQ-1001 is now `RESOLVED`, try to move it anyway:
```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1001/status \
  -H "Content-Type: application/json" -H "X-Employee-Id: EMP-1" -d '{"status":"IN_PROGRESS"}'
```
```
HTTP 400
{"message":"\"RESOLVED\" is a terminal status (data-model.md section 3) — a request cannot leave it once reached.","error":"Bad Request","statusCode":400}
```

Skipping `IN_PROGRESS` — REQ-1002 is still `SUBMITTED`, try to jump straight to `RESOLVED`:
```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1002/status \
  -H "Content-Type: application/json" -H "X-Employee-Id: EMP-3" -d '{"status":"RESOLVED"}'
```
```
HTTP 400
{"message":"Cannot skip \"IN_PROGRESS\" — a request must reach \"IN_PROGRESS\" before it can reach \"RESOLVED\".","error":"Bad Request","statusCode":400}
```

Unknown employee (the "known Employee" ownership invariant, data-model.md §3):
```bash
curl -X POST http://localhost:3001/api/service-requests \
  -H "Content-Type: application/json" -H "X-Employee-Id: EMP-999" -d '{"serviceId":"SVC-1"}'
```
```
HTTP 400
{"message":"\"EMP-999\" is not a known employee id. Known ids: EMP-1, EMP-2, EMP-3.","error":"Bad Request","statusCode":400}
```

Missing identity header entirely:
```bash
curl -X POST http://localhost:3001/api/service-requests \
  -H "Content-Type: application/json" -d '{"serviceId":"SVC-1"}'
```
```
HTTP 400
{"message":"Missing \"X-Employee-Id\" header — every request must say which employee it is acting as.","error":"Bad Request","statusCode":400}
```

### 7.4 The Week 3 cancel flow — authorization and the expected-failure case

```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1002/cancel -H "X-Employee-Id: EMP-1"
```
```
HTTP 403
{"message":"\"EMP-1\" cannot cancel request \"REQ-1002\" — only its owner (\"EMP-3\") can.","error":"Forbidden","statusCode":403}
```

```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1002/cancel -H "X-Employee-Id: EMP-3"
```
```json
{"id":"REQ-1002","employeeId":"EMP-3","serviceId":"SVC-3","currentStatus":"CANCELLED","createdAt":"2026-09-16T00:00:00.100Z"}
```

```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1002/cancel -H "X-Employee-Id: EMP-3"
```
```
HTTP 400
{"message":"Request \"REQ-1002\" is \"CANCELLED\" and can no longer be cancelled — only a \"SUBMITTED\" request can be.","error":"Bad Request","statusCode":400}
```

### 7.5 The invariant: history is append-only and `current_status` stays in sync (ADR-001)

```bash
curl http://localhost:3001/api/service-requests/REQ-1001/history
```
```json
[
  {"id":"EVT-1","requestId":"REQ-1001","status":"SUBMITTED","changedBy":"EMP-1","occurredAt":"2026-09-16T00:00:00.000Z","comment":"Need a laptop"},
  {"id":"EVT-3","requestId":"REQ-1001","status":"IN_PROGRESS","changedBy":"EMP-1","occurredAt":"2026-09-16T00:00:00.050Z"},
  {"id":"EVT-4","requestId":"REQ-1001","status":"RESOLVED","changedBy":"EMP-2","occurredAt":"2026-09-16T00:00:00.090Z","comment":"Laptop handed over"}
]
```

Three events, none overwritten — every rejected attempt above left no trace,
because a rejected transition never reaches `appendEvent`. `EVT-2` (REQ-1002's
own `SUBMITTED` event) correctly does **not** appear here — each event belongs
to exactly one request.

```bash
curl http://localhost:3001/api/service-requests/REQ-1001
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"RESOLVED","createdAt":"2026-09-16T00:00:00.000Z"}
```

`currentStatus` is `RESOLVED` — matching the last event above, exactly as
ADR-001 requires: the denormalized field and the event history never drift
apart because `changeStatus()`/`cancelRequest()` update both in the same
operation.

### 7.6 "My requests" filter and a 404

```bash
curl "http://localhost:3001/api/service-requests?employeeId=EMP-3"
```
```json
[{"id":"REQ-1002","employeeId":"EMP-3","serviceId":"SVC-3","currentStatus":"CANCELLED","createdAt":"2026-09-16T00:00:00.100Z"}]
```

```bash
curl http://localhost:3001/api/service-requests/REQ-9999
```
```
HTTP 404
{"message":"No service request found with id \"REQ-9999\".","error":"Not Found","statusCode":404}
```

## 8. Automated tests (replace the manual walkthrough above)

```bash
npm test         # unit: business rules — cancel eligibility (status-transitions.spec.ts) and AI intake orchestration (src/ai/intake-ai.core.spec.ts)
npm run test:e2e # integration (real SQLite) + the section 7 walkthrough as a regression suite + Week 4 HTTP tests
npm run eval:ai  # the Week 4 AI eval suite — 5-8 representative cases, no API key needed
```

See `../docs/full-stack-delivery.md` section 7 and `../docs/week4-production-ai.md` section 7 for what each suite covers, and the repository root `README.md` for the E2E (browser) test.
