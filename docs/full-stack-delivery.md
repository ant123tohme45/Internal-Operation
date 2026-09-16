# Week 3: Full-Stack Delivery
*Internal Operations Service Hub*

## 1. What this milestone proves

Week 1 designed the `ServiceRequest` lifecycle and its data model. Week 2 turned it into a working NestJS API, but with an in-memory store and no frontend. This milestone closes the loop on **one narrow, user-facing flow** — submit a request, click it to see its status and full history, cancel it — end to end:

- A **React frontend** (`frontend/`) that a person actually uses.
- A **NestJS backend** (`backend/`) behind an explicit request/response contract (section 3).
- **Real database persistence** — SQLite via TypeORM, not an array that resets on restart (section 2).
- One meaningful **authorization rule** (section 4).
- One **invalid request** rejected on purpose (section 5).
- One **expected failure** handled on purpose (section 6).
- Automated tests for a business rule, a backend↔database integration, a full E2E journey, and a regression suite protecting Week 2's behaviour (section 7).

The flow chosen is deliberately narrow: **submit a request, then cancel it while it's still waiting to be picked up.** It reuses the Week 1/2 `ServiceRequest` model and status machine rather than introducing a new entity, and it's the smallest slice that needs a real authorization decision (whose request is this?) and a real business rule (is it still cancellable?) at the same time.

## 2. Real database persistence

Week 2's `service-requests.data.ts` held `Employee`, `Service`, `ServiceRequest`, and `RequestStatusEvent` as in-memory arrays. That file is gone. In its place:

| Week 2 (in-memory) | Week 3 (real database) |
|---|---|
| `service-requests.data.ts` arrays | `backend/src/service-requests/entities/*.entity.ts` — TypeORM entities |
| Lost on every restart | `backend/data/operations-hub.sqlite`, a real file on disk (SQLite via `better-sqlite3`) |
| `EMPLOYEES`/`SERVICES` hardcoded in the array | `backend/src/service-requests/seed-data.ts`, inserted into the database once on first boot (`ServiceRequestsModule.onModuleInit`), idempotent — restarting doesn't duplicate or wipe them |

`AppModule` wires `TypeOrmModule.forRoot({ type: 'better-sqlite3', database: process.env.DB_PATH ?? 'data/operations-hub.sqlite', synchronize: true })`. `synchronize: true` (auto-create tables from entities) is a deliberate shortcut appropriate for a teaching project with no other consumers of the schema; a real product would use migrations instead. `DB_PATH` exists purely so tests (section 7) and the E2E run (section 7.3) can point at their own throwaway database instead of the real one.

Proof this is real persistence, not a relabeled array: stop the backend, restart it, and a previously submitted request is still there (README.md's install/run walkthrough demonstrates this). The integration test in section 7.2 asserts the same thing under Jest.

## 3. The API contract

All endpoints are under `backend/src/service-requests/service-requests.controller.ts`. Every mutating request (and `POST /api/service-requests`) requires an `X-Employee-Id` header — see section 4 for why.

| Method | Path | Headers | Request body | Success | Failure |
|---|---|---|---|---|---|
| `GET` | `/api/service-requests/reference/employees` | — | — | `200` `Employee[]` | — |
| `GET` | `/api/service-requests/reference/services` | — | — | `200` `Service[]` | — |
| `POST` | `/api/service-requests` | `X-Employee-Id` (required) | `{ serviceId: string, comment?: string }` | `201` `ServiceRequest` | `400` missing header, unknown `employeeId`/`serviceId` |
| `GET` | `/api/service-requests?employeeId=EMP-1` | — | — | `200` `ServiceRequest[]` | — |
| `GET` | `/api/service-requests/:id` | — | — | `200` `ServiceRequest` | `404` unknown id |
| `GET` | `/api/service-requests/:id/history` | — | — | `200` `RequestStatusEvent[]` | `404` unknown id |
| `PATCH` | `/api/service-requests/:id/status` | `X-Employee-Id` (required) | `{ status: RequestStatus, comment?: string }` | `200` `ServiceRequest` | `400` invalid/skipped/backward transition, unknown status, `status: "CANCELLED"` (see section 6), `404` unknown id |
| `PATCH` | `/api/service-requests/:id/cancel` | `X-Employee-Id` (required) | — | `200` `ServiceRequest` (now `CANCELLED`) | `400` missing header / not `SUBMITTED`, `403` not the owner, `404` unknown id |

```ts
// ServiceRequest
{ id: string; employeeId: string; serviceId: string;
  currentStatus: "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" | "REJECTED" | "CANCELLED";
  createdAt: string /* ISO */ }

// RequestStatusEvent
{ id: string; requestId: string; status: RequestStatus;
  changedBy: string; occurredAt: string /* ISO */; comment?: string }
```

Every error response is NestJS's standard shape: `{ "statusCode": number, "message": string, "error": string }`, with `message` written to say exactly what was wrong (see the curl examples in sections 4–6).

## 4. Authorization rule: only a request's owner may cancel it

There is no login system yet (that's still an open item from Week 1's product-spec.md unknowns). Instead, every request says who it's acting as via the `X-Employee-Id` header, read by `current-employee.decorator.ts`. That header is the acting identity the authorization check below is applied to — it plays the role a session/JWT would play once real auth exists.

**The rule** (`service-requests.service.ts`, `cancelRequest`): a `ServiceRequest` may only be cancelled by the employee who submitted it — the request's own `employeeId`. This directly implements data-model.md section 3's "Access" invariant ("one employee must not be able to read another employee's requests"), applied here to the write path where it's easiest to demonstrate and test.

**Allowed case** — the owner cancels their own request:
```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1001/cancel -H "X-Employee-Id: EMP-1"
```
```
HTTP 200
{"id":"REQ-1001","employeeId":"EMP-1","serviceId":"SVC-1","currentStatus":"CANCELLED","createdAt":"..."}
```

**Denied case** — a different employee tries to cancel it:
```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1002/cancel -H "X-Employee-Id: EMP-1"
```
```
HTTP 403
{"message":"\"EMP-1\" cannot cancel request \"REQ-1002\" — only its owner (\"EMP-2\") can.","error":"Forbidden","statusCode":403}
```

Both cases are asserted directly against the API in the e2e test (section 7.3) and against the service layer plus a real database row in the integration test (section 7.2), and exercised through the browser in the E2E test (section 7.4), which submits as one employee, switches the frontend's identity switcher to another, and confirms the cancel attempt is refused.

## 5. Invalid request rejected on purpose

Submitting or cancelling without saying who you are is rejected before any domain logic runs — this is a malformed request, not a domain decision, so it's a `400`, not a `401`/`403`:

```bash
curl -X POST http://localhost:3001/api/service-requests -H "Content-Type: application/json" -d '{"serviceId":"SVC-1"}'
```
```
HTTP 400
{"message":"Missing \"X-Employee-Id\" header — every request must say which employee it is acting as.","error":"Bad Request","statusCode":400}
```

(Week 2's existing invalid-request checks — unknown `employeeId`/`serviceId`, unknown `status` — still apply too; this is the one Week 3 adds.)

## 6. Expected failure handled on purpose

Once a request has moved past `SUBMITTED` (ops has started work, or it already reached a terminal state), cancelling it is no longer allowed — but that's an entirely foreseeable situation (the employee just clicked too late), not a bug, so it's handled with a clear `400` instead of an unhandled exception:

```bash
curl -X PATCH http://localhost:3001/api/service-requests/REQ-1003/status -H "Content-Type: application/json" -H "X-Employee-Id: EMP-1" -d '{"status":"IN_PROGRESS"}'
# -> 200, currentStatus "IN_PROGRESS"

curl -X PATCH http://localhost:3001/api/service-requests/REQ-1003/cancel -H "X-Employee-Id: EMP-1"
```
```
HTTP 400
{"message":"Request \"REQ-1003\" is \"IN_PROGRESS\" and can no longer be cancelled — only a \"SUBMITTED\" request can be.","error":"Bad Request","statusCode":400}
```

The pure rule this checks against, `canCancel(status)`, lives in `status-transitions.ts` and is the one unit-tested in section 7.1. (A related, deliberately-refused case: sending `PATCH /:id/status` with `status: "CANCELLED"` directly is also rejected with `400`, so `CANCELLED` can only ever be reached through the owner-checked `/cancel` endpoint — the authorization check in section 4 can't be bypassed by going through the other endpoint.)

## 7. Tests

All backend tests run from `backend/`; the E2E test runs from the repo root. See README.md for the exact commands to reproduce this.

### 7.1 Unit test for a business rule
`backend/src/service-requests/status-transitions.spec.ts` tests `canCancel()` and `canTransition()`/`explainRejectedTransition()` as pure functions — no HTTP, no database. It's the rule from section 6: a request is cancellable only while `SUBMITTED`, plus the existing Week 2 lifecycle rules (no backward moves, no skipping `IN_PROGRESS`, terminal statuses stay terminal).

### 7.2 Integration test between backend and database
`backend/test/service-requests.integration.spec.ts` boots `ServiceRequestsService` against a real TypeORM/`better-sqlite3` connection (in-memory SQLite for test speed — same engine and dialect the real app uses, seeded through the same `onModuleInit` path). It calls the service methods and then reads the rows back through the repositories directly, proving persistence really happened rather than trusting the service's own return value:
- `createRequest` leaves a real, independently-readable `service_requests` row and one `request_status_events` row.
- `cancelRequest` updates `current_status` to `CANCELLED` and appends a second event row.
- A denied cancel (wrong owner) leaves the stored row untouched.

### 7.3 Regression protection + the Week 3 flow's HTTP behaviour
`backend/test/service-requests.e2e-spec.ts` uses supertest against a full Nest app (real database, in-memory for speed). Its first describe block, "regression: the Week 2 status-transition walkthrough still behaves the same", replays backend/README.md's original hand-verified Week 2 walkthrough — submit, `SUBMITTED -> IN_PROGRESS -> RESOLVED`, refuse leaving a terminal status, refuse an unknown employee, and check the append-only history — as automated assertions, so persistence and the cancel feature can never silently break that already-working path again. Its second block covers the Week 3 additions over HTTP: the invalid-request case (section 5), both authorization outcomes (section 4), the expected-failure case (section 6), and the CANCELLED-is-endpoint-only rule.

### 7.4 E2E test
`e2e/service-request-flow.spec.ts` (Playwright) drives the actual built frontend in a real browser against the actual backend against a real (throwaway) database file — nothing mocked. `playwright.config.ts` starts both servers itself (`webServer`, invoking `node dist/main.js` / Vite's JS entrypoint directly rather than through `npm run <script>`, so Playwright can actually terminate the process it started instead of leaving an orphaned child holding the port), each pointed at its own scratch database/port so it never touches `backend/data/operations-hub.sqlite`. Two tests:
1. An employee submits a request, clicks it to open its status/history detail view, cancels it from there, and sees it become `Cancelled` with the cancel button gone — the full happy path a real user takes.
2. The authorization rule from section 4, from the browser: submit as one employee, switch the identity switcher to another, use "Find a request" to open the first employee's request by id (its status is visible to anyone who has the id), and confirm clicking "Cancel this request" is refused with the same "only its owner" message.

## 8. What we did not build (by design, per the milestone scope)

- No real login/session system — the `X-Employee-Id` header stands in for "who's signed in" (section 4). A real login would replace the header with a session/JWT; the authorization check itself wouldn't need to change.
- No CI/CD, deployment, or monitoring — out of scope for this milestone.
- No external integrations — the whole flow is self-contained (frontend, backend, and its own database).
- No Employee/Service CRUD — still fixed seed data (`seed-data.ts`), same as Week 2; only `ServiceRequest` has a lifecycle this week.
