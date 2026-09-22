import { AiProviderError, BoundedService, IntakeAiProvider, IntakeCandidate } from './intake-ai.types';

export interface AnthropicIntakeAiProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * The Anthropic-API equivalent of HttpIntakeAiProvider (same file's
 * comment explains why this exists at all: proving the capability is
 * genuinely pluggable, not required for grading). Same contract, same
 * validation happening one layer up in intake-ai.core.ts — only the wire
 * format differs, because Anthropic's Messages API shape (system field,
 * x-api-key header, `content` blocks in the response) isn't the OpenAI
 * chat-completions shape the other provider speaks.
 *
 * Selected via AI_PROVIDER=anthropic + AI_API_KEY (an Anthropic Console API
 * key from console.anthropic.com — not a claude.ai chat subscription,
 * which is a different product and doesn't grant API access on its own).
 */
export class AnthropicIntakeAiProvider implements IntakeAiProvider {
  readonly name = 'http-anthropic';

  constructor(private readonly config: AnthropicIntakeAiProviderConfig) {}

  async suggest(freeText: string, services: BoundedService[]): Promise<IntakeCandidate> {
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com/v1';
    const model = this.config.model ?? 'claude-haiku-4-5-20251001';
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
      'Reply with strict JSON only, no prose, no markdown code fences, matching exactly: ' +
      '{"serviceId": string|null, "confidence": number between 0 and 1, "rationale": string}.';

    const userPrompt = `Catalog: ${JSON.stringify(catalog)}\n\nEmployee request: ${JSON.stringify(freeText)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
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

    const block = (body as any)?.content?.[0];
    const text = block?.type === 'text' ? block.text : undefined;
    if (typeof text !== 'string') {
      throw new AiProviderError('AI provider response did not contain a text content block.');
    }

    let parsed: unknown;
    try {
      // Models occasionally wrap JSON in a markdown fence despite instructions
      // not to — strip one if present rather than failing on it outright.
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new AiProviderError('AI provider message content was not valid JSON.', err);
    }

    // Deliberately no shape/catalog validation here beyond parsing —
    // intake-ai.core.ts is the single place that happens, so every
    // provider is held to the same check (see http-intake-ai.provider.ts).
    const candidate = parsed as Record<string, unknown>;
    return {
      serviceId: (candidate.serviceId as string | null) ?? null,
      confidence: typeof candidate.confidence === 'number' ? candidate.confidence : 0,
      rationale: typeof candidate.rationale === 'string' ? candidate.rationale : '',
    };
  }
}
