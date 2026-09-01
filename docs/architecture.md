# Architecture Draft
*Internal Operations Service Hub*

## 1 **Selected Requirement** 

From my product-spec.md, I picked: "Employees must be able to browse and search for internal services and get filtered results back."
I picked this one because it has clear people involved, a clear flow, and a clear place where it can fail.

## 2 **Actors** 

- Employee: searches for a service and looks at the results.
- Service Administrator: keeps the list of services up to date so employees can actually find something real.

## 3 **Responsibilities** 

- Employee: types a search, reviews the results.
- User Interface: takes the search input, shows the results.
- Service Hub: receives the search request, requests matching services from the Catalog, and returns the results to the User Interface.
- Service Catalog: stores the service info, gives it when asked.
- Service Administrator: adds/edits/removes services in the Catalog.

## 4 **Major Parts (and why each one exists)**

- User Interface – exists because employees need a place to type a search and see the results.
- Service Hub – exists because something has to receive the search and do the filtering.
- Service Catalog – exists because the Hub needs somewhere to actually get the service data from.
Employee and Service Administrator are people, not system parts — they use the system, they aren't inside it.

## 5 **System Boundary**

Inside the system:
- User Interface
- Service Hub
- Service Catalog

Outside the system:
- Employee
- Service Administrator

They interact with the product but they are not part of the product itself.

No external dependencies outside the system are used for this requirement — the Service Hub reads only from the Service Catalog it owns.

## 6 **Information Flow** 

Employee -> User Interface -> Service Hub -> Service Catalog -> Service Hub -> User Interface -> Employee

Steps:
1. Employee types a search.
2. User Interface sends the search request to the Service Hub.
3. Service Hub sends the search criteria to the Service Catalog.
4. Service Catalog returns the relevant service data.
5. Service Hub applies the required filtering and prepares the results.
6. User Interface shows the filtered results to the Employee.

[Diagram showing three main system components inside the Internal Operations Service Hub System boundary: user interface, service hub, and service catalog/CMDB/data store, with arrows indicating request and response flows between them; below, an External Actors boundary contains Employee and Service Administrator with arrows from Employee to the user interface and from Service Administrator to the service catalog. The diagram is a neutral schematic.](images/architecture-diagram.png)


## 7 **Where Trust/Permissions Matter** 

- For this requirement, the system assumes that authenticated employees are allowed to search the service catalog. No additional authorization check is required at this stage.
- If the product later introduces department-specific services, the Service Hub could apply authorization rules before returning results.

## 8 **What Happens If the Service Catalog Goes Down** 

- Detect: The Service Hub notices the Catalog didn't respond.
- User: The employee still gets results, just older ones, not an error page.
- Fallback: The Service Hub shows the last saved list of services instead of failing the whole search.
- Trace: This protects the requirement in Section 1 — the search doesn't just break, it degrades gracefully.

This also is how the reliability non-functional requirement in product-spec.md (section 5, "the hub should be reliable and always available") is met for this requirement specifically: availability comes from the Service Hub serving last-known data instead of failing outright, not from any new component.

## 9 **Decision Record**

**Problem:** When the Service Catalog doesn't respond in time, something has to decide how the search degrades instead of just failing.

**Options:**
- Let the User Interface show an error and require the employee to retry manually.
- Let the User Interface cache the last results itself.
- Let the Service Hub own the fallback and return the last-saved catalog data.

**Decision:** The Service Hub owns the fallback and returns the last-saved catalog data.

**Consequence:** The employee sees older results instead of an error, at the cost of the Service Hub needing to keep a last-known copy of catalog data. This keeps the fallback logic in one place (the Service Hub), matching section 5's system boundary — the User Interface stays a display layer, not a source of truth.

## 10 Scope Note

This document designs the browse/search requirement only (section 1). Submit/track and authentication — the other two functional requirements in product-spec.md's section 3 — are out of scope here and still need their own architecture pass. `data-model.md` section 7 extends this document's responsibility assignments provisionally to cover them in the meantime, and flags that extension as unconfirmed.
