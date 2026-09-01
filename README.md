# Internal Operations Service Hub

A company-internal system for requesting and tracking help from departments such as IT, HR, and Finance — instead of scattering requests across email, chat, and phone calls with no visibility into status.

This repository is the **v0.1 product foundation**: specification, architecture, and data model. It is documentation-only — no implementation is required or claimed at this stage.

## Repository structure

```
operations-hub/
  README.md
  docs/
    product-spec.md        - problem, actors, requirements, acceptance criteria
    architecture.md        - selected requirement, components, responsibilities, failure handling
    data-model.md          - entities, relationships, invariants, storage and access reasoning
    decisions/
      ADR-001.md           - decision record: request status as event history + current-status field
    images/
      architecture-diagram.png - referenced by architecture.md section 6
      data-model-erd.png       - referenced by data-model.md section 2.1.1
```

## Reading order

1. **[docs/product-spec.md](docs/product-spec.md)** — what problem this solves and what the product must do.
2. **[docs/architecture.md](docs/architecture.md)** — how one requirement (browse/search) is structured: actors, components, system boundary, information flow, and what happens when the Service Catalog fails.
3. **[docs/data-model.md](docs/data-model.md)** — what the system must remember and enforce: entities, relationships, lifecycle rules, and why storage/access decisions were made.
4. **[docs/decisions/ADR-001.md](docs/decisions/ADR-001.md)** — why request status is kept as both a full event history and a fast-read current-status field.

## Status

- Specification: done
- Architecture (browse/search only): done — submit/track and authentication are explicitly deferred, see `architecture.md`'s closing note (section 10)
- Data model: done, covering all three functional requirements

