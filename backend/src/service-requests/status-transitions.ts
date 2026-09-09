/**
 * The ServiceRequest lifecycle, fixed in Week 1 (../../../docs/data-model.md,
 * section 3 "Lifecycle + rules (invariants)"):
 *
 *   Submitted -> In Progress -> Resolved | Rejected
 *
 * and it "cannot move backward (e.g. Resolved cannot return to Submitted)".
 *
 * Read literally, that also means a request cannot skip "In Progress" — the
 * only documented path to Resolved or Rejected runs through it.
 *
 * This file is the one place that rule is enforced. Every status change in
 * the API goes through canTransition() below, so the invariant can't be
 * bypassed by some future endpoint that forgets to check it.
 */

export type RequestStatus =
  | 'SUBMITTED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'REJECTED';

export const REQUEST_STATUSES: RequestStatus[] = [
  'SUBMITTED',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
];

/** Every status a request in a given status is allowed to move to next. */
const ALLOWED_NEXT_STATUSES: Record<RequestStatus, RequestStatus[]> = {
  SUBMITTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED', 'REJECTED'],
  RESOLVED: [], // terminal: a resolved request does not move again
  REJECTED: [], // terminal: a rejected request does not move again
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return ALLOWED_NEXT_STATUSES[from].includes(to);
}

/** A human-readable reason a transition was refused, used in the 400 response. */
export function explainRejectedTransition(
  from: RequestStatus,
  to: RequestStatus,
): string {
  if (from === to) {
    return `"${from}" is already the current status; there is nothing to transition.`;
  }
  if (ALLOWED_NEXT_STATUSES[from].length === 0) {
    return `"${from}" is a terminal status (data-model.md section 3) — a request cannot leave it once reached.`;
  }
  if (to === 'SUBMITTED') {
    return `Cannot move back to "SUBMITTED" — data-model.md section 3 forbids moving backward.`;
  }
  if (from === 'SUBMITTED' && to !== 'IN_PROGRESS') {
    return `Cannot skip "IN_PROGRESS" — a request must reach "IN_PROGRESS" before it can reach "${to}".`;
  }
  return `"${from}" cannot move directly to "${to}".`;
}
