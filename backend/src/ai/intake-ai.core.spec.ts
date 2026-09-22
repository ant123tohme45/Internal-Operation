import { getIntakeSuggestion, CONFIDENCE_THRESHOLD } from './intake-ai.core';
import { HeuristicIntakeAiProvider } from './heuristic-intake-ai.provider';
import { BoundedService, IntakeAiProvider, IntakeCandidate } from './intake-ai.types';

/**
 * Unit tests for the framework-free decision logic behind the Week 4
 * Request Intake AI capability (docs/week4-production-ai.md). No NestJS,
 * no database — a fake IntakeAiProvider stands in wherever a test needs to
 * control exactly what "the AI" returns, the same technique the eval
 * harness (src/ai/eval) uses to force the provider-failure and
 * invalid-output cases deterministically.
 */

const CATALOG: BoundedService[] = [
  { id: 'SVC-1', name: 'Laptop replacement', departmentOwner: 'IT', category: 'Hardware', keywords: ['laptop', 'screen', 'cracked'] },
  { id: 'SVC-2', name: 'Payroll correction', departmentOwner: 'Finance', category: 'Payroll', keywords: ['paycheck', 'salary'] },
];

function fakeProvider(impl: (freeText: string, services: BoundedService[]) => Promise<IntakeCandidate>): IntakeAiProvider {
  return { name: 'fake', suggest: impl };
}

describe('getIntakeSuggestion — input validation', () => {
  it('rejects empty input before calling the provider', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('should not be called');
    });
    const result = await getIntakeSuggestion('   ', CATALOG, provider);
    expect(result).toEqual({ matched: false, reason: 'empty_input' });
  });

  it('reports no_services_available when the catalog is empty, without calling the provider', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('should not be called');
    });
    const result = await getIntakeSuggestion('laptop', [], provider);
    expect(result).toEqual({ matched: false, reason: 'no_services_available' });
  });
});

describe('getIntakeSuggestion — provider failure (network/timeout/transport error)', () => {
  it('degrades to provider_unavailable instead of throwing', async () => {
    const provider = fakeProvider(async () => {
      throw new Error('ECONNRESET');
    });
    const result = await getIntakeSuggestion('my laptop is broken', CATALOG, provider);
    expect(result).toEqual({
      matched: false,
      reason: 'provider_unavailable',
      detail: 'ECONNRESET',
    });
  });
});

describe('getIntakeSuggestion — invalid AI output', () => {
  it('rejects a candidate whose serviceId is not in the bounded catalog it was given (hallucination)', async () => {
    const provider = fakeProvider(async () => ({
      serviceId: 'SVC-999-DOES-NOT-EXIST',
      confidence: 0.95,
      rationale: 'very sure',
    }));
    const result = await getIntakeSuggestion('laptop', CATALOG, provider);
    expect(result).toEqual({
      matched: false,
      reason: 'invalid_ai_output',
      detail: expect.stringContaining('SVC-999-DOES-NOT-EXIST'),
    });
  });

  it('rejects a candidate with a malformed shape (confidence out of range)', async () => {
    const provider = fakeProvider(async () => ({ serviceId: 'SVC-1', confidence: 5, rationale: 'nope' } as IntakeCandidate));
    const result = await getIntakeSuggestion('laptop', CATALOG, provider);
    expect(result.matched).toBe(false);
    if (!result.matched) expect(result.reason).toBe('invalid_ai_output');
  });

  it('rejects a candidate that is not even the right shape (e.g. a string)', async () => {
    const provider = fakeProvider(async () => 'SVC-1' as unknown as IntakeCandidate);
    const result = await getIntakeSuggestion('laptop', CATALOG, provider);
    expect(result.matched).toBe(false);
    if (!result.matched) expect(result.reason).toBe('invalid_ai_output');
  });
});

describe('getIntakeSuggestion — confidence threshold', () => {
  it('does not surface a candidate below CONFIDENCE_THRESHOLD', async () => {
    const provider = fakeProvider(async () => ({
      serviceId: 'SVC-1',
      confidence: CONFIDENCE_THRESHOLD - 0.01,
      rationale: 'weak match',
    }));
    const result = await getIntakeSuggestion('something', CATALOG, provider);
    expect(result).toEqual({
      matched: false,
      reason: 'below_confidence_threshold',
      detail: expect.any(String),
    });
  });

  it('surfaces a candidate at or above CONFIDENCE_THRESHOLD', async () => {
    const provider = fakeProvider(async () => ({
      serviceId: 'SVC-1',
      confidence: CONFIDENCE_THRESHOLD,
      rationale: 'good enough',
    }));
    const result = await getIntakeSuggestion('laptop screen', CATALOG, provider);
    expect(result).toEqual({
      matched: true,
      serviceId: 'SVC-1',
      confidence: CONFIDENCE_THRESHOLD,
      rationale: 'good enough',
    });
  });

  it('treats a provider-declared null (no confident match) as no_confident_match, not a match', async () => {
    const provider = fakeProvider(async () => ({ serviceId: null, confidence: 0, rationale: 'nothing fits' }));
    const result = await getIntakeSuggestion('something vague', CATALOG, provider);
    expect(result).toEqual({ matched: false, reason: 'no_confident_match', detail: 'nothing fits' });
  });
});

/**
 * The default, no-API-key provider, exercised end to end through
 * getIntakeSuggestion — these are the same three named categories the Week
 * 4 brief asks eval cases to cover (clear, thin, ambiguous), as ordinary
 * automated tests. The eval harness (src/ai/eval) covers the same ground
 * plus the AI-specific categories (trusted context, provider failure,
 * invalid output) in its own reproducible-command format.
 */
describe('HeuristicIntakeAiProvider via getIntakeSuggestion — representative inputs', () => {
  const provider = new HeuristicIntakeAiProvider();

  it('clear input: a specific, on-catalog description matches confidently', async () => {
    const result = await getIntakeSuggestion(
      'My laptop screen is cracked and it will not turn on, I need a replacement',
      CATALOG,
      provider,
    );
    expect(result).toMatchObject({ matched: true, serviceId: 'SVC-1' });
  });

  it('thin input: a single strong keyword still matches', async () => {
    const result = await getIntakeSuggestion('paycheck', CATALOG, provider);
    expect(result).toMatchObject({ matched: true, serviceId: 'SVC-2' });
  });

  it('ambiguous input: generic phrasing with no catalog-specific keywords does not match', async () => {
    const result = await getIntakeSuggestion('I have an issue, please help', CATALOG, provider);
    expect(result).toMatchObject({ matched: false, reason: 'no_confident_match' });
  });

  it('conditional on the current catalog: adding a service changes what can match, without any code change', async () => {
    const before = await getIntakeSuggestion('reset my badge', CATALOG, provider);
    expect(before).toMatchObject({ matched: false, reason: 'no_confident_match' });

    const withBadgeService: BoundedService[] = [
      ...CATALOG,
      { id: 'SVC-3', name: 'Access badge reset', departmentOwner: 'HR', category: 'Security', keywords: ['badge', 'access'] },
    ];
    const after = await getIntakeSuggestion('reset my badge', withBadgeService, provider);
    expect(after).toMatchObject({ matched: true, serviceId: 'SVC-3' });
  });
});
