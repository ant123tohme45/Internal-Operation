import { IntakeAiProvider } from './intake-ai.types';
import { HeuristicIntakeAiProvider } from './heuristic-intake-ai.provider';
import { HttpIntakeAiProvider } from './http-intake-ai.provider';

export const INTAKE_AI_PROVIDER = Symbol('INTAKE_AI_PROVIDER');

/**
 * Chooses which IntakeAiProvider the app runs with. Defaults to the free,
 * deterministic heuristic provider — a paid provider is opt-in, never
 * required (Week 4 brief). Set AI_PROVIDER=openai plus AI_API_KEY to use a
 * real model instead; a missing key falls back to the heuristic provider
 * with a warning rather than failing to boot, so a misconfigured
 * environment degrades instead of breaking the whole app.
 */
export function createIntakeAiProvider(env: NodeJS.ProcessEnv = process.env): IntakeAiProvider {
  if (env.AI_PROVIDER === 'openai') {
    if (!env.AI_API_KEY) {
      console.warn(
        'AI_PROVIDER=openai was set but AI_API_KEY is missing — falling back to the heuristic intake provider.',
      );
      return new HeuristicIntakeAiProvider();
    }
    return new HttpIntakeAiProvider({
      apiKey: env.AI_API_KEY,
      baseUrl: env.AI_BASE_URL,
      model: env.AI_MODEL,
    });
  }

  return new HeuristicIntakeAiProvider();
}
