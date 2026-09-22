import { AiProviderError, BoundedService, IntakeAiProvider, IntakeCandidate } from './intake-ai.types';

export interface HttpIntakeAiProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Optional, not-required-to-grade provider: calls an OpenAI-compatible
 * chat-completions endpoint and asks it to pick a service id from the
 * bounded list it's given. Not used by default (HeuristicIntakeAiProvider
 * is) — this exists to prove the capability is genuinely pluggable to a
 * real model for Week 5 ("put it live"), not hard-coded around the
 * heuristic. Selected via AI_PROVIDER=openai (see intake-ai-provider.factory.ts);
 * with no API key configured, the factory falls back to the heuristic
 * provider instead of failing to boot.
 *
 * Every failure mode — network error, timeout, non-2xx response, a
 * response body that isn't the JSON shape asked for — surfaces as an
 * AiProviderError. intake-ai.core.ts treats that identically to the
 * heuristic provider erroring: a graceful "no suggestion", never a crash.
 * A malformed-but-200 response (right transport, wrong content) instead
 * reaches intake-ai.core.ts as an invalid candidate shape, which is
 * likewise never trusted.
 */
export class HttpIntakeAiProvider implements IntakeAiProvider {
  readonly name = 'http-openai-compatible';

  constructor(private readonly config: HttpIntakeAiProviderConfig) {}

  async suggest(freeText: string, services: BoundedService[]): Promise<IntakeCandidate> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const model = this.config.model ?? 'gpt-4o-mini';
    const timeoutMs = this.config.timeoutMs ?? 8000;

    const catalog = services.map((s) => ({
      id: s.id,
      name: s.name,
      department: s.departmentOwner,
      category: s.category,
    }));

    const systemPrompt =
      'You match an employee\'s free-text request to at most one service from a fixed catalog. ' +
      'You may ONLY choose an id that appears in the provided catalog, or null if nothing is a confident match. ' +
      'Reply with strict JSON only, no prose, matching exactly: ' +
      '{"serviceId": string|null, "confidence": number between 0 and 1, "rationale": string}.';

    const userPrompt = `Catalog: ${JSON.stringify(catalog)}\n\nEmployee request: ${JSON.stringify(freeText)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      throw new AiProviderError('Request to the AI provider failed (network error or timeout).', err);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new AiProviderError(`AI provider responded with HTTP ${response.status}.`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      throw new AiProviderError('AI provider response was not valid JSON.', err);
    }

    const content = (body as any)?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new AiProviderError('AI provider response did not contain a message body.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new AiProviderError('AI provider message content was not valid JSON.', err);
    }

    // Deliberately no shape/catalog validation here beyond basic parsing —
    // intake-ai.core.ts is the single place that happens, so every
    // provider (this one and the heuristic) is held to the same check.
    const candidate = parsed as Record<string, unknown>;
    return {
      serviceId: (candidate.serviceId as string | null) ?? null,
      confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 0,
      rationale: typeof candidate.rationale === 'string' ? candidate.rationale : '',
    };
  }
}
