import * as ImageManipulator from 'expo-image-manipulator';

import { OPENAI_API_KEY, OPENAI_CLASSIFIER_MODEL } from './config/keys';
import type { ClassificationColor, GarmentClassification } from './types';

export class OpenAIRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenAIRequestError';
    this.status = status;
  }
}

const CLASSIFICATION_PROMPT = `Analyze the clothing item image and return JSON only.
Use this exact JSON shape:
{
  "category": "top|bottom|dress|outerwear|shoes|bag|accessory|other",
  "subcategory": "short label",
  "itemType": "specific type",
  "dominantColors": [{"name": "color", "hex": "#RRGGBB", "percentage": 0.0}],
  "secondaryColors": [{"name": "color", "hex": "#RRGGBB", "percentage": 0.0}],
  "pattern": "solid|striped|plaid|printed|other",
  "material": ["material names"],
  "estimatedSize": "best estimate like XS/S/M/L/XL or shoe size range",
  "fit": "slim|regular|relaxed|oversized|unknown",
  "collar": "type or unknown",
  "sleeveLength": "sleeveless|short|3/4|long|unknown",
  "closure": "zipper|buttons|lace|none|other|unknown",
  "pockets": "none|single|multiple|cargo|unknown",
  "shoeType": "if shoes, else unknown",
  "heel": "flat|low|mid|high|unknown",
  "toeShape": "round|pointed|square|unknown",
  "features": ["distinctive features"],
  "formality": "casual|smart-casual|formal|sport|unknown",
  "season": ["spring", "summer", "fall", "winter"],
  "tags": ["useful retrieval tags"],
  "insulationIndex": 0,
  "confidence": 0.0,
  "notes": "compact description"
}
Rules:
- Describe observable visual details only.
- insulationIndex must be between 0 and 100 where 0 is very breathable/light and 100 is highly insulating.
- Confidence must be between 0 and 1.
- Keep notes under 35 words.
- If uncertain, use "unknown" instead of guessing hard.`;

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

function extractOutputText(payload: ResponsesPayload): string {
  if (typeof payload.output_text === 'string' && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }

  const segments: string[] = [];
  payload.output?.forEach((block) => {
    block.content?.forEach((content) => {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        segments.push(content.text);
      }
    });
  });

  return segments.join('\n').trim();
}

function extractJsonText(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start < 0 || end <= start) {
    throw new Error('Classifier returned non-JSON output.');
  }

  return raw.slice(start, end + 1);
}

function asString(value: unknown, fallback = 'unknown'): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function asColorArray(value: unknown): ClassificationColor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const pctValue = Number(raw.percentage);
      const percentage = Number.isFinite(pctValue) ? Math.max(0, Math.min(1, pctValue)) : 0;

      return {
        name: asString(raw.name),
        hex: asString(raw.hex, '#000000'),
        percentage,
      };
    })
    .filter((entry): entry is ClassificationColor => entry !== null);
}

function normalizeClassification(raw: Record<string, unknown>): GarmentClassification {
  const rawConfidence = Number(raw.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(1, rawConfidence))
    : 0;
  const rawInsulation = Number(raw.insulationIndex);
  const insulationIndex = Number.isFinite(rawInsulation)
    ? Math.max(0, Math.min(100, Math.round(rawInsulation)))
    : 0;

  return {
    category: asString(raw.category),
    subcategory: asString(raw.subcategory),
    itemType: asString(raw.itemType),
    dominantColors: asColorArray(raw.dominantColors),
    secondaryColors: asColorArray(raw.secondaryColors),
    pattern: asString(raw.pattern),
    material: asStringArray(raw.material),
    estimatedSize: asString(raw.estimatedSize),
    fit: asString(raw.fit),
    collar: asString(raw.collar),
    sleeveLength: asString(raw.sleeveLength),
    closure: asString(raw.closure),
    pockets: asString(raw.pockets),
    shoeType: asString(raw.shoeType),
    heel: asString(raw.heel),
    toeShape: asString(raw.toeShape),
    features: asStringArray(raw.features),
    formality: asString(raw.formality),
    season: asStringArray(raw.season),
    tags: asStringArray(raw.tags),
    insulationIndex,
    confidence,
    notes: asString(raw.notes, ''),
  };
}

async function toJpegDataUri(imageUri: string): Promise<string> {
  const normalized = await ImageManipulator.manipulateAsync(imageUri, [], {
    compress: 0.75,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!normalized.base64) {
    throw new Error('Failed to convert image to JPEG for analysis.');
  }

  return `data:image/jpeg;base64,${normalized.base64}`;
}

export async function classifyWardrobeImage(imageUri: string): Promise<GarmentClassification> {
  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('PASTE_OPENAI_API_KEY_HERE')) {
    throw new Error('OpenAI API key missing. Add it in .env');
  }

  const jpegDataUri = await toJpegDataUri(imageUri);

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_CLASSIFIER_MODEL,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: CLASSIFICATION_PROMPT,
            },
            {
              type: 'input_image',
              image_url: jpegDataUri,
            },
          ],
        },
      ],
      max_output_tokens: 900,
    }),
  });

  const payload = (await response.json()) as ResponsesPayload;

  if (!response.ok) {
    throw new OpenAIRequestError(
      response.status,
      payload.error?.message ?? `OpenAI request failed (${response.status}).`
    );
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error('OpenAI returned empty output.');
  }

  const parsed = JSON.parse(extractJsonText(outputText)) as Record<string, unknown>;
  return normalizeClassification(parsed);
}
