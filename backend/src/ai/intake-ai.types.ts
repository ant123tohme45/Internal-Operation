/**
 * Types shared by every part of the Request Intake AI capability
 * (docs/week4-production-ai.md). Deliberately framework-free — no NestJS,
 * no TypeORM — so the orchestration logic in intake-ai.core.ts can be
 * exercised directly by unit tests and by the eval harness (src/ai/eval)
 * without booting a Nest application or touching a database.
 */

/** The bounded, product-owned context an AI provider is allowed to choose
 * from. This is the *only* information a provider receives about the
 * service catalog — it is never given the ability to invent a service that
 * isn't already a real, backend-owned row. */
export interface BoundedService {
  id: string;
  name: string;
  departmentOwner: string;
  category?: string;
  keywords?: string[];
}

/** What a provider returns: at most one candidate service id (or null for
 * "no confident match"), plus a confidence score and a short human-readable
 * reason. This is advisory data only — see intake-ai.core.ts for why it is
 * never trusted on its own. */
export interface IntakeCandidate {
  serviceId: string | null;
  confidence: number;
  rationale: string;
}

/** Thrown by a provider to signal it could not produce a candidate at all
 * (timeout, network error, non-2xx response, malformed transport-level
 * response, ...). Distinct from an IntakeCandidate with bad *content*,
 * which is a validation failure, not a provider failure. */
export class AiProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** Anything that can turn free text + a bounded service list into a
 * candidate. The heuristic provider (default, no external calls) and the
 * optional HTTP provider both implement this — the rest of the system
 * never needs to know which one is in use. */
export interface IntakeAiProvider {
  readonly name: string;
  suggest(freeText: string, services: BoundedService[]): Promise<IntakeCandidate>;
}

/** Every reason a suggestion can come back unmatched. Kept as distinct,
 * named values (not a generic "failed: true") so callers — and the eval
 * harness — can assert on *why*, not just whether it worked. */
export type UnmatchedReason =
  | 'empty_input'
  | 'no_services_available'
  | 'provider_unavailable'
  | 'invalid_ai_output'
  | 'no_confident_match'
  | 'below_confidence_threshold';

export type IntakeSuggestionResult =
  | {
      matched: true;
      serviceId: string;
      confidence: number;
      rationale: string;
    }
  | {
      matched: false;
      reason: UnmatchedReason;
      detail?: string;
    };
