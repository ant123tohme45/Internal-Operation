# Data Model
*Internal Operations Service Hub*

## 1 Scope: what this file is derived from and what it covers

- Derived from `product-spec.md` (the 3 functional requirements) and `architecture.md` (the browse/search component design).
- `architecture.md` explicitly only designed one requirement in depth: browse/search. Submit/track and authentication were deferred, by its own closing note (section 10).
- A data model has to describe what the whole system remembers, not just the one flow that got an architecture pass. So this file covers all three functional requirements, but is explicit below about which parts are backed by an architecture diagram and which parts are derived straight from the product spec.
- Known gap carried forward on purpose (not hidden): submit/track and auth do not yet have their own architecture.md pass. See section 7.

## 2 Domain: entities, relationships, ownership

## 2.1 Entities (only things that pass the "own identity / relationships / history / lifecycle" test)

**Employee**
- id, username, password_hash, full_name, department, role (employee | service_administrator)
- Own identity, referenced by every request, has a lifecycle (active/inactive), so it earns its own entity.

**Service** (catalog item)
- id, name, description, category, department_owner, is_active
- Has identity, is maintained (created/edited/retired) by administrators, and is what browse/search returns. Matches architecture.md's "Service Catalog".

**ServiceRequest**
- id, employee_id (FK), service_id (FK), current_status, created_at
- This is the central durable-state object: has identity, relationships to Employee and Service, and its own lifecycle (Submitted -> In Progress -> Resolved/Rejected).

**RequestStatusEvent**
- id, request_id (FK), status, changed_by (employee_id of the actor who made the change), timestamp, comment (optional)
- Own timestamp, meaning over time, explains *how* a request got to its current status, not just what the status is. See ADR-001 for why this exists as its own entity instead of being folded into a single status column.

## 2.1.1 Entity Diagram

![Entity-relationship diagram showing four boxes: Employee, ServiceRequest (highlighted as the central durable-state entity), Service, and RequestStatusEvent. An arrow labeled "submits" runs from Employee (1) to ServiceRequest (many). An arrow labeled "requests" runs from ServiceRequest (many) to Service (1). A downward arrow labeled "has history" runs from ServiceRequest (1) to RequestStatusEvent (many). A dashed box labeled "Service Administrator (Employee with role = service_administrator)" connects to Service via a dashed arrow labeled "manages," dashed because this relationship is not yet backed by its own architecture.md pass.](images/data-model-erd.png)

## 2.2 Entity-or-attribute calls worth defending out loud

- `current_status` on ServiceRequest: a plain attribute is not enough on its own. If someone asks "why is this request still open," a single status column can't answer that -> paired with RequestStatusEvent. This exact tension is ADR-001.
- `category` on Service: kept as a plain attribute, not its own entity, because it currently has no relationships or lifecycle of its own beyond labeling a service. Flagged here as an assumption that could change if category management becomes its own feature.

## 2.3 Relationships

- Employee --submits--> ServiceRequest (1 Employee : many ServiceRequests)
- ServiceRequest --requests--> Service (many ServiceRequests : 1 Service)
- ServiceRequest --has history--> RequestStatusEvent (1 ServiceRequest : many RequestStatusEvents)
- Employee (acting as Service Administrator) --manages--> Service (many admins : many services)
  - Assumption: any administrator can manage any service. product-spec.md's "unknowns" section (6.1) already flags that authorization scope is not decided yet, so this is intentionally the simplest starting assumption, not a hidden decision.

## 3 Lifecycle + rules (invariants)

- **Ownership**: every ServiceRequest belongs to exactly one known Employee. Every RequestStatusEvent belongs to exactly one known ServiceRequest.
- **History**: status changes are never overwritten in place; each change is appended as a new RequestStatusEvent row.
- **Lifecycle**: ServiceRequest moves Submitted -> In Progress -> Resolved | Rejected, and cannot move backward (e.g. Resolved cannot return to Submitted).
- **Access**: one employee must not be able to read another employee's requests. This is a direct restatement of product-spec.md's acceptance criteria: "Denied access for unauthorized users, or attempting to access restricted info."

## 3.1 Where each rule actually lives

- Uniqueness / required references (unique username, valid employee_id and service_id foreign keys) -> database constraints.
- Valid status transitions (no skipping or reversing states) -> backend/domain logic.
- Authorization (who may read/write which request) -> authorization policy / access checks in the backend. architecture.md doesn't assign this for submit/track (it wasn't in scope there), but it does establish the pattern this follows: the Service Hub, not the User Interface, owns decision logic and holds the data (its section 9), while the User Interface stays a display layer, not a source of truth (its section 3 Decision Record).

## 4 Storage: relational vs document

**Decision: relational.**

- Relationships are central: Employee, ServiceRequest, Service and RequestStatusEvent constantly reference each other.
- Consistency matters: the current status shown to an employee has to actually match the real event history, not drift from it.
- Typical reads combine related data: "this request, with its full history" or "this service, with the requests against it."

These three reasons are exactly the "Relational often fits when" criteria: relationships are central, consistency across records matters, queries combine related data. Document storage would make more sense if a request were a self-contained, rarely cross-referenced blob, which is not the case here.

## 5 Access patterns (named before any index is proposed)

- Get current status of a request -> by request_id -> current_status (fast read, denormalized).
- Get full status history of a request -> by request_id -> events ordered by time.
- Get "my requests" for the logged-in employee -> by employee_id -> list of that employee's requests.
- Browse/search services by category or keyword -> filtered service list (already the flow architecture.md designed).
- Authenticate a user at login -> by username -> employee record, for password check.

## 6 Indexes (only where a named access pattern justifies one)

- Unique index on Employee.username - required for login and to prevent duplicate accounts.
- Index on ServiceRequest.employee_id - supports the "my requests" access pattern.
- Index on RequestStatusEvent.request_id (ordered by timestamp) - supports the "full history" access pattern.
- Index/search structure on Service.category - supports the browse/search access pattern already defined in architecture.md.

No index exists here without a named access pattern above justifying it.

## 7 Architecture alignment for submit/track (extending, not duplicating, architecture.md)

architecture.md only produced a full component design for browse/search, and its closing note (section 10) says submit/track and authentication would need their own architecture pass. Rather than leaving that as an open hole, this section extends architecture.md's own responsibility assignments (its section 3) the minimum amount needed to justify where each new entity's rules live, so the two files agree instead of one silently going further than the other:

- architecture.md already assigns the **Service Hub** the job of receiving the request and coordinating with the Catalog (its section 3, for search). The same component is the natural owner of ServiceRequest creation and of appending RequestStatusEvent rows — no new system part is introduced, this is the existing Service Hub responsibility applied to a second requirement.
- architecture.md already treats the **User Interface** as a display layer that takes input and shows results, not a source of truth (its section 3, and its section 9 Decision Record). The same rule applies here: current_status is displayed by the UI but written only by the Service Hub. Note that architecture.md's system boundary (its section 5) places the User Interface *inside* the system — this is a statement about which component owns writes, not about the UI being outside the system.
- architecture.md does not yet assign an owner for authorization checks. This data model assumes, per product-spec.md's still-open unknown (6.1), that the Service Hub performs the "employee can only read their own requests" check, the same place architecture.md already puts filtering logic for search. This is a reasonable default, not a resolved decision — a full architecture pass for submit/track and auth would confirm or revise it.
