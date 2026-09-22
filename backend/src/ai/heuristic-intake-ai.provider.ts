import { BoundedService, IntakeAiProvider, IntakeCandidate } from './intake-ai.types';

/**
 * The default AI provider: deterministic keyword-overlap scoring, no
 * network call, no API key, no cost. This is what "Paid AI provider is not
 * required" (Week 4 brief) means concretely — the capability works out of
 * the box, and the optional HttpIntakeAiProvider (http-intake-ai.provider.ts)
 * can replace it later without any other file changing (see
 * intake-ai-provider.factory.ts).
 *
 * It is deliberately simple, not a toy: this is a legitimate lightweight
 * NLP technique (bag-of-words overlap, the same family as TF-style keyword
 * matching), not a mock standing in for a "real" implementation. Its
 * output shape and validation path are identical to what a real LLM
 * provider must also satisfy.
 */
export class HeuristicIntakeAiProvider implements IntakeAiProvider {
  readonly name = 'heuristic-keyword-overlap';

  private static readonly STOPWORDS = new Set([
    'a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is',
    'it', 'my', 'me', 'i', 'am', 'are', 'was', 'were', 'be', 'been',
    'with', 'this', 'that', 'have', 'has', 'had', 'need', 'needs',
    'please', 'hi', 'hello', 'can', 'you', 'we', 'us', 'our', 'just',
    'would', 'like', 'want', 'issue', 'problem', 'help', 'about', 'at',
    'so', 'there', 's', 't', 'don', 'won', 'got',
  ]);

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !HeuristicIntakeAiProvider.STOPWORDS.has(token));
  }

  private keywordBag(service: BoundedService): Set<string> {
    const source = [
      ...this.tokenize(service.name),
      ...this.tokenize(service.departmentOwner),
      ...this.tokenize(service.category ?? ''),
      ...(service.keywords ?? []).flatMap((k) => this.tokenize(k)),
    ];
    return new Set(source);
  }

  async suggest(freeText: string, services: BoundedService[]): Promise<IntakeCandidate> {
    const inputTokens = new Set(this.tokenize(freeText));

    if (inputTokens.size === 0) {
      return {
        serviceId: null,
        confidence: 0,
        rationale: 'No meaningful keywords found in the input after removing common words.',
      };
    }

    let best: { service: BoundedService; overlap: number; score: number } | null = null;

    for (const service of services) {
      const bag = this.keywordBag(service);
      let overlap = 0;
      for (const token of inputTokens) {
        if (bag.has(token)) overlap += 1;
      }
      if (overlap === 0) continue;

      // Precision against the input, not recall against the (much larger)
      // keyword bag — a short, specific input ("badge") should score just
      // as confidently as a long one that happens to share one word.
      const score = overlap / inputTokens.size;

      if (!best || score > best.score) {
        best = { service, overlap, score };
      }
    }

    if (!best) {
      return {
        serviceId: null,
        confidence: 0,
        rationale: 'No overlap between the input and any known service\'s name, category, department, or keywords.',
      };
    }

    return {
      serviceId: best.service.id,
      confidence: Math.min(1, best.score),
      rationale: `${best.overlap} overlapping keyword(s) with "${best.service.name}" (${best.service.departmentOwner}).`,
    };
  }
}
