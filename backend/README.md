# Operations Hub — Backend (Week 2 Milestone)

A small, working NestJS backend for **one** piece of the Internal Operations
Service Hub: the `ServiceRequest` lifecycle designed in Week 1. It is not the
whole product — see "Non-goals" below.

## 1. What this proves

Week 1 (`../docs/data-model.md`, section 3 "Lifecycle + rules (invariants)")
fixed this rule for `ServiceRequest`:

```
Submitted -> In Progress -> Resolved | Rejected
```

> "and cannot move backward (e.g. Resolved cannot return to Submitted)"

This backend is that rule turned into a running API: a `PATCH` endpoint that
moves a request from one status to the next, accepts the transitions the
rule allows, and rejects everything else with a reason. It also keeps the
`RequestStatusEvent` history append-only and in sync with `current_status`,
which is the decision recorded in `../docs/decisions/ADR-001.md`.

Where each rule lives in code:

| Rule | Source | Enforced in |
|---|---|---|
| Valid/backward/skip transitions | data-model.md §3 "Lifecycle" | [`src/service-requests/status-transitions.ts`](src/service-requests/status-transitions.ts) |
| History is append-only; `current_status` stays in sync | ADR-001 | [`src/service-requests/service-requests.service.ts`](src/service-requests/service-requests.service.ts) (`changeStatus`, `appendEvent`) |
| A request belongs to exactly one known Employee/Service | data-model.md §3 "Ownership" | [`service-requests.service.ts`](src/service-requests/service-requests.service.ts) (`createRequest`) |

## 2. Non-goals (this week)

Matches the milestone handout and `../docs/product-spec.md`'s own
non-goals section:

- **No frontend.** This is an API only; verify it with curl/Postman/browser.
- **No real database.** Data lives in memory and resets every restart.
- **No authentication.** `employeeId` is passed in the request body, not read from a session.
- **No full test suite.** Verification below is a manual, reproducible curl walkthrough.
- **No Service/Employee management endpoints.** They're fixed seed data (section 5) — only `ServiceRequest` has a lifecycle this week.

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
Operations Hub backend is running on http://localhost:3000
```

Stop it with `Ctrl+C`. Re-run `npm run build` after any source change, then
`npm start` again.

> **`npm run dev` (`nest start --watch`) is unreliable on some Windows
> setups**: it can report "Found 0 errors. Watching for file changes." and
> then immediately crash with `Cannot find module '...\dist\main'`, because
> the watcher spawns Node before the compiled `dist/main.js` is actually
> visible on disk. `npm run build && npm start` is the path actually
> verified end to end for this milestone — use that if `npm run dev` fails.

## 5. Seed reference data (in-memory, fixed)

Requests may only be created against these known ids (data-model.md §3
"Ownership" — a request must belong to a *known* Employee, and a *known*
Service):

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

## 6. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/service-requests` | Submit a new request (starts at `SUBMITTED`) |
| `GET` | `/api/service-requests` | List all requests (`?employeeId=EMP-1` to filter — the "my requests" access pattern, data-model.md §5) |
| `GET` | `/api/service-requests/:id` | One request, with its current status |
| `GET` | `/api/service-requests/:id/history` | Full status history, oldest first |
| `PATCH` | `/api/service-requests/:id/status` | Move to a new status — the state-transition behaviour |

## 7. Verify it: a real walkthrough

Everything below was actually run against this code (not hand-written) —
each response is the real output. Start the server first (`npm run dev`),
then run these in order; later steps depend on earlier ones.

### 7.1 Create two requests

```bash
curl -X POST http://localhost:3000/api/service-requests \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"EMP-1","serviceId":"SVC-1","comment":"Need a laptop"}'
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"SUBMITTED","createdAt":"2026-09-04T11:38:03.011Z"}
```

```bash
curl -X POST http://localhost:3000/api/service-requests \
  -H "Content-Type: application/json" \
  -d '{"employeeId":"EMP-3","serviceId":"SVC-3","comment":"Badge stopped working"}'
```
```json
{"id":"REQ-1002","employeeId":"EMP-3","serviceId":"SVC-3","currentStatus":"SUBMITTED","createdAt":"2026-09-04T11:38:03.054Z"}
```

### 7.2 Valid transitions (succeed)

`SUBMITTED -> IN_PROGRESS` on REQ-1001:
```bash
curl -X PATCH http://localhost:3000/api/service-requests/REQ-1001/status \
  -H "Content-Type: application/json" -d '{"status":"IN_PROGRESS","changedBy":"EMP-1"}'
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"IN_PROGRESS","createdAt":"2026-09-04T11:38:03.011Z"}
```

`IN_PROGRESS -> RESOLVED` on REQ-1001, handled by a different employee than the submitter:
```bash
curl -X PATCH http://localhost:3000/api/service-requests/REQ-1001/status \
  -H "Content-Type: application/json" -d '{"status":"RESOLVED","changedBy":"EMP-2","comment":"Laptop handed over"}'
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"RESOLVED","createdAt":"2026-09-04T11:38:03.011Z"}
```

### 7.3 Invalid transitions (rejected, with a reason)

Terminal state — REQ-1001 is now `RESOLVED`, try to move it anyway:
```bash
curl -X PATCH http://localhost:3000/api/service-requests/REQ-1001/status \
  -H "Content-Type: application/json" -d '{"status":"IN_PROGRESS","changedBy":"EMP-1"}'
```
```
HTTP 400
{"message":"\"RESOLVED\" is a terminal status (data-model.md section 3) — a request cannot leave it once reached.","error":"Bad Request","statusCode":400}
```

Skipping `IN_PROGRESS` — REQ-1002 is still `SUBMITTED`, try to jump straight to `RESOLVED`:
```bash
curl -X PATCH http://localhost:3000/api/service-requests/REQ-1002/status \
  -H "Content-Type: application/json" -d '{"status":"RESOLVED","changedBy":"EMP-3"}'
```
```
HTTP 400
{"message":"Cannot skip \"IN_PROGRESS\" — a request must reach \"IN_PROGRESS\" before it can reach \"RESOLVED\".","error":"Bad Request","statusCode":400}
```

Moving backward — put REQ-1002 into `IN_PROGRESS` properly first, then try to send it back to `SUBMITTED`:
```bash
curl -X PATCH http://localhost:3000/api/service-requests/REQ-1002/status \
  -H "Content-Type: application/json" -d '{"status":"IN_PROGRESS","changedBy":"EMP-3"}'
# -> 200, currentStatus "IN_PROGRESS"

curl -X PATCH http://localhost:3000/api/service-requests/REQ-1002/status \
  -H "Content-Type: application/json" -d '{"status":"SUBMITTED","changedBy":"EMP-3"}'
```
```
HTTP 400
{"message":"Cannot move back to \"SUBMITTED\" — data-model.md section 3 forbids moving backward.","error":"Bad Request","statusCode":400}
```

Unknown employee (the "known Employee" ownership invariant, data-model.md §3):
```bash
curl -X POST http://localhost:3000/api/service-requests \
  -H "Content-Type: application/json" -d '{"employeeId":"EMP-999","serviceId":"SVC-1"}'
```
```
HTTP 400
{"message":"\"EMP-999\" is not a known employee id. Known ids: EMP-1, EMP-2, EMP-3.","error":"Bad Request","statusCode":400}
```

### 7.4 The invariant: history is append-only and `current_status` stays in sync (ADR-001)

```bash
curl http://localhost:3000/api/service-requests/REQ-1001/history
```
```json
[
  {"id":"EVT-1","requestId":"REQ-1001","status":"SUBMITTED","changedBy":"EMP-1","occurredAt":"2026-09-04T11:38:03.011Z","comment":"Need a laptop"},
  {"id":"EVT-3","requestId":"REQ-1001","status":"IN_PROGRESS","changedBy":"EMP-1","occurredAt":"2026-09-04T11:38:03.105Z"},
  {"id":"EVT-4","requestId":"REQ-1001","status":"RESOLVED","changedBy":"EMP-2","occurredAt":"2026-09-04T11:38:03.151Z","comment":"Laptop handed over"}
]
```

Three events, none overwritten — the rejected attempt in 7.3 left no trace,
because a rejected transition never reaches `appendEvent`. `EVT-2` (REQ-1002's
own `SUBMITTED` event) correctly does **not** appear here — each event belongs
to exactly one request.

```bash
curl http://localhost:3000/api/service-requests/REQ-1001
```
```json
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"RESOLVED","createdAt":"2026-09-04T11:38:03.011Z"}
```

`currentStatus` is `RESOLVED` — matching the last event above, exactly as
ADR-001 requires: the denormalized field and the event history never drift
apart because `changeStatus()` updates both in the same operation.

### 7.5 "My requests" filter and a 404

```bash
curl "http://localhost:3000/api/service-requests?employeeId=EMP-3"
```
```json
[{"id":"REQ-1002","employeeId":"EMP-3","serviceId":"SVC-3","currentStatus":"IN_PROGRESS","createdAt":"2026-09-04T11:38:03.054Z"}]
```

```bash
curl http://localhost:3000/api/service-requests/REQ-9999
```
```
HTTP 404
{"message":"No service request found with id \"REQ-9999\".","error":"Not Found","statusCode":404}
```

## 8. Regression check

After making any change here, re-run section 7.2 (the two valid transitions)
to confirm they still succeed before checking anything else — that is the
"known good" case this backend must never break.
