export const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';

export const OPENAI_CLASSIFIER_MODEL =
  process.env.EXPO_PUBLIC_OPENAI_CLASSIFIER_MODEL ?? 'gpt-4.1-mini';

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function boundedPositiveIntFromEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = positiveIntFromEnv(raw, fallback);
  return Math.max(min, Math.min(max, value));
}

export const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';

export const NANO_BANANA_MODEL =
  process.env.EXPO_PUBLIC_NANO_BANANA_MODEL ?? 'gemini-3-pro-image-preview';

export const NANO_BANANA_ASPECT_RATIO =
  process.env.EXPO_PUBLIC_NANO_BANANA_ASPECT_RATIO ?? '5:4';

export const NANO_BANANA_IMAGE_SIZE =
  process.env.EXPO_PUBLIC_NANO_BANANA_IMAGE_SIZE ?? '1K';

export const NANO_BANANA_TIMEOUT_MS = boundedPositiveIntFromEnv(
  process.env.EXPO_PUBLIC_NANO_BANANA_TIMEOUT_MS,
  90000,
  5000,
  300000
);

export const NANO_BANANA_MAX_ATTEMPTS = boundedPositiveIntFromEnv(
  process.env.EXPO_PUBLIC_NANO_BANANA_MAX_ATTEMPTS,
  3,
  1,
  6
);

export const NANO_BANANA_RETRY_BASE_DELAY_MS = boundedPositiveIntFromEnv(
  process.env.EXPO_PUBLIC_NANO_BANANA_RETRY_BASE_DELAY_MS,
  1500,
  250,
  20000
);
