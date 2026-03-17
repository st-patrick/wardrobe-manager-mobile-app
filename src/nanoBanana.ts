import * as ImageManipulator from 'expo-image-manipulator';

import {
  GEMINI_API_KEY,
  NANO_BANANA_ASPECT_RATIO,
  NANO_BANANA_IMAGE_SIZE,
  NANO_BANANA_MAX_ATTEMPTS,
  NANO_BANANA_MODEL,
  NANO_BANANA_RETRY_BASE_DELAY_MS,
  NANO_BANANA_TIMEOUT_MS,
} from './config/keys';

type TryOnRequest = {
  personImageUri: string;
  outfitImageUris: string[];
  outfitDescription: string;
  onStatus?: (message: string) => void;
};

type GeminiPayload = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
        inline_data?: {
          mime_type?: string;
          data?: string;
        };
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type TryOnFailure = {
  message: string;
  retriable: boolean;
  status?: number;
};

const RETRIABLE_HTTP_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

class TryOnGatewayError extends Error {
  retriable: boolean;
  status?: number;

  constructor(message: string, retriable: boolean, status?: number) {
    super(message);
    this.name = 'TryOnGatewayError';
    this.retriable = retriable;
    this.status = status;
  }
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function backoffDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 450);
  return NANO_BANANA_RETRY_BASE_DELAY_MS * 2 ** exponent + jitter;
}

async function toJpegBase64(imageUri: string): Promise<string> {
  const normalized = await ImageManipulator.manipulateAsync(imageUri, [{ resize: { width: 900 } }], {
    compress: 0.72,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!normalized.base64) {
    throw new Error('Failed to prepare image for try-on.');
  }

  return normalized.base64;
}

function extractImageBase64(payload: GeminiPayload): string | null {
  const candidates = payload.candidates ?? [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];

    for (const part of parts) {
      const camel = part.inlineData?.data;
      if (typeof camel === 'string' && camel.length > 0) {
        return camel;
      }

      const snake = part.inline_data?.data;
      if (typeof snake === 'string' && snake.length > 0) {
        return snake;
      }
    }
  }

  return null;
}

function extractTextParts(payload: GeminiPayload): string {
  const lines: string[] = [];

  (payload.candidates ?? []).forEach((candidate) => {
    (candidate.content?.parts ?? []).forEach((part) => {
      if (typeof part.text === 'string' && part.text.trim().length > 0) {
        lines.push(part.text.trim());
      }
    });
  });

  return lines.join(' ').trim();
}

function parseGeminiPayload(raw: string): GeminiPayload {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as GeminiPayload;
  } catch {
    return {
      error: {
        message: `Model returned a non-JSON response: ${raw.slice(0, 180)}`,
      },
    };
  }
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === 'AbortError' || error.message.toLowerCase().includes('aborted');
}

function classifyTryOnFailure(error: unknown): TryOnFailure {
  if (error instanceof TryOnGatewayError) {
    return {
      message: error.message,
      retriable: error.retriable,
      status: error.status,
    };
  }

  if (isAbortError(error)) {
    return {
      message: `Request timed out after ${Math.round(NANO_BANANA_TIMEOUT_MS / 1000)}s`,
      retriable: true,
    };
  }

  if (error instanceof TypeError) {
    return {
      message: error.message || 'Network request failed.',
      retriable: true,
    };
  }

  if (error instanceof Error) {
    const message = error.message || 'Unknown try-on error.';
    const lowered = message.toLowerCase();
    const retriable =
      lowered.includes('network request failed') ||
      lowered.includes('timeout') ||
      lowered.includes('temporar') ||
      lowered.includes('unavailable') ||
      lowered.includes('rate limit') ||
      lowered.includes('429') ||
      lowered.includes('500') ||
      lowered.includes('502') ||
      lowered.includes('503') ||
      lowered.includes('504');
    return { message, retriable };
  }

  return {
    message: 'Unknown try-on failure.',
    retriable: false,
  };
}

function buildHttpError(status: number, payload: GeminiPayload): TryOnGatewayError {
  const payloadMessage = asText(payload.error?.message).trim();
  const fallback = `Gemini request failed (${status}).`;
  return new TryOnGatewayError(payloadMessage || fallback, RETRIABLE_HTTP_STATUS.has(status), status);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function generateTryOnImage({
  personImageUri,
  outfitImageUris,
  outfitDescription,
  onStatus,
}: TryOnRequest): Promise<string> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('PASTE_GEMINI_API_KEY_HERE')) {
    throw new Error('Gemini API key missing. Add it in .env');
  }

  if (outfitImageUris.length === 0) {
    throw new Error('No outfit references available for try-on.');
  }

  const referenceUris = [personImageUri, ...outfitImageUris.slice(0, 5)];
  onStatus?.(`Preparing ${referenceUris.length} reference image(s)...`);
  const encodedImages = await Promise.all(referenceUris.map((uri) => toJpegBase64(uri)));

  const prompt = [
    'Generate a realistic virtual try-on image.',
    'Keep the person identity, face, body shape, pose, and camera perspective consistent with the first image (person reference).',
    'Dress the person using garments from the remaining outfit reference images in a natural and coherent way.',
    'Preserve garment details (material, silhouette, closure, collar, sleeve length, shoes).',
    'Avoid artifacts, duplicate limbs, warped hands, or broken anatomy.',
    `Outfit details: ${outfitDescription}`,
  ].join(' ');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${NANO_BANANA_MODEL}:generateContent`;

  for (let attempt = 1; attempt <= NANO_BANANA_MAX_ATTEMPTS; attempt += 1) {
    onStatus?.(`Try-on request attempt ${attempt}/${NANO_BANANA_MAX_ATTEMPTS}...`);
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  ...encodedImages.map((base64) => ({
                    inline_data: {
                      mime_type: 'image/jpeg',
                      data: base64,
                    },
                  })),
                ],
              },
            ],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: {
                aspectRatio: NANO_BANANA_ASPECT_RATIO,
                imageSize: NANO_BANANA_IMAGE_SIZE,
              },
            },
          }),
        },
        NANO_BANANA_TIMEOUT_MS
      );

      const raw = await response.text();
      const payload = parseGeminiPayload(raw);

      if (!response.ok) {
        throw buildHttpError(response.status, payload);
      }

      const base64Image = extractImageBase64(payload);
      if (!base64Image) {
        const textFallback = extractTextParts(payload);
        const message = textFallback
          ? `Gemini returned no image: ${textFallback}`
          : 'Gemini returned no image output.';
        throw new TryOnGatewayError(message, false, response.status);
      }

      onStatus?.(`Try-on succeeded on attempt ${attempt}/${NANO_BANANA_MAX_ATTEMPTS}.`);
      return base64Image;
    } catch (error) {
      const failure = classifyTryOnFailure(error);
      const canRetry = failure.retriable && attempt < NANO_BANANA_MAX_ATTEMPTS;

      if (!canRetry) {
        onStatus?.(`Try-on failed on attempt ${attempt}/${NANO_BANANA_MAX_ATTEMPTS}.`);
        throw new Error(
          `Try-on failed after ${attempt} attempt${attempt === 1 ? '' : 's'}: ${failure.message}`
        );
      }

      const delayMs = backoffDelayMs(attempt);
      onStatus?.(
        `Attempt ${attempt}/${NANO_BANANA_MAX_ATTEMPTS} failed (${failure.message}). Retrying in ${Math.ceil(delayMs / 1000)}s...`
      );
      await sleep(delayMs);
    }
  }

  throw new Error('Try-on failed after all retries.');
}
