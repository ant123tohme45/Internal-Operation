import {
  AiProviderError,
  BoundedService,
  IntakeAiProvider,
  IntakeCandidate,
  IntakeSuggestionResult,
} from './intake-ai.types';

/** Below this confidence, a suggestion is not shown to the employee at all
 * — "advisory" only means something if low-quality guesses are filtered
 * out before they reach anyone (docs/week4-production-ai.md, "why a
 * threshold"). Chosen empirically against the eval cases in src/ai/eval:
 * high enough to reject one-word-of-noise overlaps, low enough that a
 * single strong keyword (the "thin input" case) still clears it. */
export const CONFIDENCE_THRESHOLD = 0.35;

const MAX_INPUT_LENGTH = 500;

function isValidCandidateShape(value: unknown): value is IntakeCandidate {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const serviceIdOk = candidate.serviceId === null || typeof candidate.serviceId === 'string';
  const confidenceOk =
    typeof candidate.confidence === 'number' &&
    Number.isFinite(candidate.confidence) &&
    candidate.confidence >= 0 &&
    candidate.confidence <= 1;
  const rationaleOk = typeof candidate.rationale === 'string';
  return serviceIdOk && confidenceOk && rationaleOk;
}

/**
 * The one place free text becomes a decision. Every path through this
 * function ends in either a validated, in-catalog match or a specific,
 * named reason it doesn't — there is no path where a provider's raw output
 * reaches the caller unchecked. This is what "AI is advisory; software/
 * human authority stays final" (Week 4 brief) means in code:
 *
 *  1. Trivial input rejected before any provider is even called.
 *  2. The provider is given only the bounded, backend-owned service list —
 *     it cannot be told about services that don't exist.
 *  3. A provider that throws (network/timeout/transport failure) degrades
 *     to "no suggestion", never an unhandled exception reaching the HTTP
 *     layer.
 *  4. A provider's output is validated for *shape* (right types, confidence
 *     in range) — content that doesn't match is "invalid", not trusted.
 *  5. A provider's chosen serviceId is re-checked for *catalog membership*
 *     against the same bounded list, independent of whether the provider
 *     is well-behaved — closing the gap even a compromised or hallucinating
 *     provider (real LLMs do this) can't get through.
 *  6. Only a candidate that survives all of the above, at or above
 *     CONFIDENCE_THRESHOLD, is ever returned as a match.
 *
 * Callers (intake-ai.service.ts) additionally re-validate the winning
 * serviceId against a *fresh* read of the database before ever letting it
 * reach request creation — this function validates against the exact list
 * it was given, which is the strongest guarantee it alone can make.
 */
export async function getIntakeSuggestion(
  freeText: string,
  services: BoundedService[],
  provider: IntakeAiProvider,
): Promise<IntakeSuggestionResult> {
  const trimmed = (freeText ?? '').trim().slice(0, MAX_INPUT_LENGTH);
  if (!trimmed) {
    return { matched: false, reason: 'empty_input' };
  }

  if (services.length === 0) {
    return { matched: false, reason: 'no_services_available' };
  }

  let candidate: IntakeCandidate;
  try {
    candidate = await provider.suggest(trimmed, services);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { matched: false, reason: 'provider_unavailable', detail: message };
  }

  if (!isValidCandidateShape(candidate)) {
    return {
      matched: false,
      reason: 'invalid_ai_output',
      detail: 'Provider response did not match the expected candidate shape.',
    };
  }

  if (candidate.serviceId === null) {
    return { matched: false, reason: 'no_confident_match', detail: candidate.rationale };
  }

  const known = services.some((s) => s.id === candidate.serviceId);
  if (!known) {
    return {
      matched: false,
      reason: 'invalid_ai_output',
      detail: `Provider suggested "${candidate.serviceId}", which is not in the bounded service list it was given.`,
    };
  }

  if (candidate.confidence < CONFIDENCE_THRESHOLD) {
    return {
      matched: false,
      reason: 'below_confidence_threshold',
      detail: `Confidence ${candidate.confidence.toFixed(2)} is below the ${CONFIDENCE_THRESHOLD} threshold.`,
    };
  }

  return {
    matched: true,
    serviceId: candidate.serviceId,
    confidence: candidate.confidence,
    rationale: candidate.rationale,
  };
}

export { AiProviderError };
