import type { WardrobeItem } from './types';

export type OutfitRole = 'shoes' | 'pants' | 'top' | 'belt' | 'sweater' | 'jacket';

export type OutfitCombo = {
  id: string;
  score: number;
  reasons: string[];
  insulationIndex: number;
  insulationDelta: number;
  parts: {
    shoes: WardrobeItem;
    pants: WardrobeItem;
    top: WardrobeItem;
    belt: WardrobeItem | null;
    sweater: WardrobeItem | null;
    jacket: WardrobeItem | null;
  };
};

export type OutfitGenerationResult = {
  combos: OutfitCombo[];
  inventory: Record<OutfitRole, number>;
  missingRequired: Array<'shoes' | 'pants' | 'top'>;
  notes: string[];
  targetInsulation: number;
};

export type OutfitGenerationOptions = {
  targetInsulation?: number;
};

type ClassifiedItem = WardrobeItem & {
  classificationStatus: 'classified';
  classification: NonNullable<WardrobeItem['classification']>;
};

const REQUIRED_ROLES: Array<'shoes' | 'pants' | 'top'> = ['shoes', 'pants', 'top'];
const NEUTRAL_FAMILIES = new Set(['black', 'white', 'gray', 'brown', 'beige', 'navy', 'denim']);
const DEFAULT_TARGET_INSULATION = 70;
const MAX_RAW_COMBO_SAMPLE = 1800;

const SHOE_TOKENS = ['shoe', 'sneaker', 'boot', 'loafer', 'heel', 'sandals', 'slipper'];
const PANTS_TOKENS = ['pant', 'jean', 'trouser', 'chino', 'slack', 'jogger', 'cargo', 'legging'];
const SWEATER_TOKENS = ['sweater', 'hoodie', 'cardigan', 'pullover', 'knit', 'sweatshirt', 'fleece'];
const JACKET_TOKENS = ['jacket', 'coat', 'parka', 'blazer', 'puffer', 'bomber', 'anorak'];
const BELT_TOKENS = ['belt'];

function isClassifiedItem(item: WardrobeItem): item is ClassifiedItem {
  return item.classificationStatus === 'classified' && item.classification !== null;
}

function itemText(item: ClassifiedItem): string {
  return [
    item.classification.category,
    item.classification.subcategory,
    item.classification.itemType,
    item.classification.shoeType,
    ...item.classification.tags,
  ]
    .join(' ')
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTokenWord(text: string, token: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(token)}s?\\b`, 'i');
  return pattern.test(text);
}

function matchesAnyToken(text: string, tokens: string[]): boolean {
  return tokens.some((token) => hasTokenWord(text, token));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeTargetInsulation(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_TARGET_INSULATION;
  }

  return clamp(Math.round(value), 0, 100);
}

function normalizeStoredInsulation(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return clamp(Math.round(numeric), 0, 100);
}

function fallbackInsulation(item: ClassifiedItem): number {
  const text = itemText(item);

  let insulation = 35;
  if (item.classification.category === 'outerwear' || matchesAnyToken(text, JACKET_TOKENS)) {
    insulation = 74;
  } else if (
    item.classification.category === 'top' &&
    matchesAnyToken(text, SWEATER_TOKENS)
  ) {
    insulation = 62;
  } else if (item.classification.category === 'top') {
    insulation = 38;
  } else if (item.classification.category === 'bottom' || matchesAnyToken(text, PANTS_TOKENS)) {
    insulation = 44;
  } else if (item.classification.category === 'shoes' || matchesAnyToken(text, SHOE_TOKENS)) {
    insulation = hasTokenWord(text, 'boot') ? 42 : 33;
  } else if (item.classification.category === 'accessory' && matchesAnyToken(text, BELT_TOKENS)) {
    insulation = 10;
  }

  if (hasTokenWord(text, 'wool') || hasTokenWord(text, 'fleece') || hasTokenWord(text, 'puffer')) {
    insulation += 9;
  }
  if (hasTokenWord(text, 'linen') || hasTokenWord(text, 'mesh') || hasTokenWord(text, 'vented')) {
    insulation -= 8;
  }

  if (item.classification.sleeveLength === 'long') {
    insulation += 5;
  } else if (item.classification.sleeveLength === 'short') {
    insulation -= 5;
  } else if (item.classification.sleeveLength === 'sleeveless') {
    insulation -= 10;
  }

  if (item.classification.season.includes('winter')) {
    insulation += 6;
  }
  if (item.classification.season.includes('summer')) {
    insulation -= 6;
  }

  return clamp(insulation, 0, 100);
}

function itemInsulation(item: ClassifiedItem | null): number {
  if (!item) {
    return 0;
  }

  const fromClassifier = normalizeStoredInsulation(item.classification.insulationIndex);
  if (fromClassifier !== null) {
    return fromClassifier;
  }

  return fallbackInsulation(item);
}

function colorFamily(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }

  const value = name.toLowerCase();

  if (value.includes('black')) return 'black';
  if (value.includes('white') || value.includes('ivory') || value.includes('cream')) return 'white';
  if (value.includes('gray') || value.includes('grey') || value.includes('charcoal')) return 'gray';
  if (value.includes('navy')) return 'navy';
  if (value.includes('blue') || value.includes('denim')) return 'denim';
  if (value.includes('brown') || value.includes('tan') || value.includes('camel')) return 'brown';
  if (value.includes('beige') || value.includes('khaki')) return 'beige';
  if (value.includes('green') || value.includes('olive')) return 'green';
  if (value.includes('red') || value.includes('burgundy') || value.includes('maroon')) return 'red';
  if (value.includes('pink')) return 'pink';
  if (value.includes('yellow') || value.includes('mustard')) return 'yellow';
  if (value.includes('orange') || value.includes('rust')) return 'orange';
  if (value.includes('purple') || value.includes('violet')) return 'purple';

  return value;
}

function primaryColorFamily(item: ClassifiedItem | null): string | null {
  if (!item || item.classification.dominantColors.length === 0) {
    return null;
  }

  return colorFamily(item.classification.dominantColors[0]?.name ?? null);
}

function sortByNewest<T extends WardrobeItem>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

function trimPool<T>(items: T[], limit: number): T[] {
  const targetLimit = Math.max(1, limit);
  if (items.length <= targetLimit) {
    return shuffle(items);
  }

  return shuffle(items).slice(0, targetLimit);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function getCount(map: Map<string, number>, id: string): number {
  return map.get(id) ?? 0;
}

function incrementCount(map: Map<string, number>, id: string): void {
  map.set(id, getCount(map, id) + 1);
}

function reuseCap(targetCount: number, uniqueCount: number): number {
  if (uniqueCount <= 1) {
    return targetCount;
  }

  return Math.max(1, Math.ceil(targetCount / uniqueCount));
}

function selectDiverseCombos(candidates: OutfitCombo[], maxCombos: number): OutfitCombo[] {
  const targetCount = Math.max(1, maxCombos);
  if (candidates.length <= targetCount) {
    return shuffle(candidates);
  }

  const topCap = reuseCap(targetCount, new Set(candidates.map((combo) => combo.parts.top.id)).size);
  const pantsCap = reuseCap(targetCount, new Set(candidates.map((combo) => combo.parts.pants.id)).size);
  const shoesCap = reuseCap(targetCount, new Set(candidates.map((combo) => combo.parts.shoes.id)).size);
  const sweaterCap = reuseCap(
    targetCount,
    new Set(candidates.map((combo) => combo.parts.sweater?.id).filter((id): id is string => Boolean(id))).size
  );
  const jacketCap = reuseCap(
    targetCount,
    new Set(candidates.map((combo) => combo.parts.jacket?.id).filter((id): id is string => Boolean(id))).size
  );
  const beltCap = reuseCap(
    targetCount,
    new Set(candidates.map((combo) => combo.parts.belt?.id).filter((id): id is string => Boolean(id))).size
  );

  const usage = {
    top: new Map<string, number>(),
    pants: new Map<string, number>(),
    shoes: new Map<string, number>(),
    sweater: new Map<string, number>(),
    jacket: new Map<string, number>(),
    belt: new Map<string, number>(),
  } as const;

  const remaining = [...candidates];
  const selected: OutfitCombo[] = [];

  while (selected.length < targetCount && remaining.length > 0) {
    const ranked = remaining
      .map((combo, index) => {
        const topCount = getCount(usage.top, combo.parts.top.id);
        const pantsCount = getCount(usage.pants, combo.parts.pants.id);
        const shoesCount = getCount(usage.shoes, combo.parts.shoes.id);
        const sweaterCount = combo.parts.sweater ? getCount(usage.sweater, combo.parts.sweater.id) : 0;
        const jacketCount = combo.parts.jacket ? getCount(usage.jacket, combo.parts.jacket.id) : 0;
        const beltCount = combo.parts.belt ? getCount(usage.belt, combo.parts.belt.id) : 0;

        const reusePenalty =
          topCount * 11 +
          pantsCount * 10 +
          shoesCount * 10 +
          sweaterCount * 6 +
          jacketCount * 6 +
          beltCount * 4;

        const capPenalty =
          (topCount >= topCap ? 20 : 0) +
          (pantsCount >= pantsCap ? 18 : 0) +
          (shoesCount >= shoesCap ? 18 : 0) +
          (combo.parts.sweater && sweaterCount >= sweaterCap ? 10 : 0) +
          (combo.parts.jacket && jacketCount >= jacketCap ? 10 : 0) +
          (combo.parts.belt && beltCount >= beltCap ? 8 : 0);

        const noveltyBonus =
          (topCount === 0 ? 9 : 0) +
          (pantsCount === 0 ? 8 : 0) +
          (shoesCount === 0 ? 8 : 0) +
          (combo.parts.sweater && sweaterCount === 0 ? 3 : 0) +
          (combo.parts.jacket && jacketCount === 0 ? 3 : 0) +
          (combo.parts.belt && beltCount === 0 ? 2 : 0);

        const randomness = Math.random() * 8;
        const diversifiedScore = combo.score + noveltyBonus + randomness - reusePenalty - capPenalty;

        return {
          combo,
          index,
          diversifiedScore,
        };
      })
      .sort((a, b) => b.diversifiedScore - a.diversifiedScore);

    const pickWindow = ranked.slice(0, Math.min(8, ranked.length));
    const pick = pickWindow[Math.floor(Math.random() * pickWindow.length)];
    const chosen = pick.combo;

    selected.push(chosen);
    remaining.splice(pick.index, 1);

    incrementCount(usage.top, chosen.parts.top.id);
    incrementCount(usage.pants, chosen.parts.pants.id);
    incrementCount(usage.shoes, chosen.parts.shoes.id);
    if (chosen.parts.sweater) {
      incrementCount(usage.sweater, chosen.parts.sweater.id);
    }
    if (chosen.parts.jacket) {
      incrementCount(usage.jacket, chosen.parts.jacket.id);
    }
    if (chosen.parts.belt) {
      incrementCount(usage.belt, chosen.parts.belt.id);
    }
  }

  return selected;
}

function chooseBestBelt(
  belts: ClassifiedItem[],
  excludedIds: Set<string>,
  parts: {
    pants: ClassifiedItem;
    shoes: ClassifiedItem;
    top: ClassifiedItem;
    sweater: ClassifiedItem | null;
    jacket: ClassifiedItem | null;
  }
): ClassifiedItem | null {
  if (belts.length === 0) {
    return null;
  }

  const pantsColor = primaryColorFamily(parts.pants);
  const shoesColor = primaryColorFamily(parts.shoes);

  let best: ClassifiedItem | null = null;
  let bestScore = -1;

  belts.forEach((belt) => {
    if (excludedIds.has(belt.id)) {
      return;
    }

    const beltColor = primaryColorFamily(belt);
    let score = 0;

    if (beltColor && (beltColor === pantsColor || beltColor === shoesColor)) {
      score += 8;
    }

    if (beltColor && NEUTRAL_FAMILIES.has(beltColor)) {
      score += 5;
    }

    if (belt.createdAt > (best?.createdAt ?? 0)) {
      score += 1;
    }

    if (score > bestScore) {
      best = belt;
      bestScore = score;
    }
  });

  return best;
}

function comboInsulationIndex(parts: OutfitCombo['parts']): number {
  const top = itemInsulation(parts.top as ClassifiedItem);
  const pants = itemInsulation(parts.pants as ClassifiedItem);
  const shoes = itemInsulation(parts.shoes as ClassifiedItem);
  const belt = itemInsulation(parts.belt as ClassifiedItem | null);
  const sweater = itemInsulation(parts.sweater as ClassifiedItem | null);
  const jacket = itemInsulation(parts.jacket as ClassifiedItem | null);

  const total =
    top * 0.3 +
    pants * 0.26 +
    shoes * 0.18 +
    belt * 0.06 +
    sweater * 0.22 +
    jacket * 0.28;

  return clamp(Math.round(total), 0, 100);
}

function scoreCombo(
  parts: OutfitCombo['parts'],
  targetInsulation: number
): { score: number; reasons: string[]; insulationIndex: number; insulationDelta: number } {
  let score = 50;
  const reasons: string[] = [];

  const colors = [
    primaryColorFamily(parts.top as ClassifiedItem),
    primaryColorFamily(parts.pants as ClassifiedItem),
    primaryColorFamily(parts.shoes as ClassifiedItem),
    primaryColorFamily(parts.sweater as ClassifiedItem | null),
    primaryColorFamily(parts.jacket as ClassifiedItem | null),
  ].filter((value): value is string => Boolean(value));

  const neutralCount = colors.filter((color) => NEUTRAL_FAMILIES.has(color)).length;
  const loudCount = colors.length - neutralCount;

  if (neutralCount >= 2) {
    score += 12;
    reasons.push('Strong neutral base');
  }

  if (loudCount <= 2) {
    score += 8;
    reasons.push('Balanced color profile');
  }

  const pantsColor = primaryColorFamily(parts.pants as ClassifiedItem);
  const shoesColor = primaryColorFamily(parts.shoes as ClassifiedItem);

  if (pantsColor && shoesColor && pantsColor === shoesColor) {
    score += 7;
    reasons.push('Shoes and pants align');
  }

  if (parts.belt) {
    score += 4;
    reasons.push('Accessory finish');
  }

  const insulationIndex = comboInsulationIndex(parts);
  const insulationDelta = insulationIndex - targetInsulation;
  const insulationDistance = Math.abs(insulationDelta);

  if (insulationDistance <= 8) {
    score += 22;
    reasons.push('Insulation target matched');
  } else if (insulationDistance <= 16) {
    score += 14;
    reasons.push('Insulation close to target');
  } else if (insulationDistance <= 25) {
    score += 6;
    reasons.push('Insulation near target');
  } else {
    score -= Math.min(18, 6 + Math.round((insulationDistance - 25) / 2));
    reasons.push(insulationDelta > 0 ? 'Runs warmer than target' : 'Runs lighter than target');
  }

  if (targetInsulation >= 60 && parts.sweater) {
    score += 4;
  }

  if (targetInsulation >= 65 && parts.jacket) {
    score += 6;
  }

  if (targetInsulation >= 75 && parts.sweater && parts.jacket) {
    score += 5;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons: reasons.slice(0, 3),
    insulationIndex,
    insulationDelta,
  };
}

function classifyInventory(items: ClassifiedItem[]) {
  const shoes: ClassifiedItem[] = [];
  const pants: ClassifiedItem[] = [];
  const tops: ClassifiedItem[] = [];
  const belts: ClassifiedItem[] = [];
  const sweaters: ClassifiedItem[] = [];
  const jackets: ClassifiedItem[] = [];

  const usedIds = new Set<string>();

  const takeByRule = (rule: (item: ClassifiedItem) => boolean, target: ClassifiedItem[]) => {
    items.forEach((item) => {
      if (usedIds.has(item.id)) {
        return;
      }
      if (rule(item)) {
        target.push(item);
        usedIds.add(item.id);
      }
    });
  };

  takeByRule((item) => {
    const text = itemText(item);
    return (
      item.classification.category === 'shoes' ||
      (item.classification.shoeType && item.classification.shoeType !== 'unknown') ||
      matchesAnyToken(text, SHOE_TOKENS)
    );
  }, shoes);

  takeByRule((item) => {
    const text = itemText(item);
    return item.classification.category === 'bottom' || matchesAnyToken(text, PANTS_TOKENS);
  }, pants);

  takeByRule((item) => {
    const text = itemText(item);
    return item.classification.category === 'outerwear' || matchesAnyToken(text, JACKET_TOKENS);
  }, jackets);

  takeByRule((item) => {
    const text = itemText(item);
    return item.classification.category === 'top' && matchesAnyToken(text, SWEATER_TOKENS);
  }, sweaters);

  takeByRule((item) => {
    const text = itemText(item);
    return item.classification.category === 'accessory' && matchesAnyToken(text, BELT_TOKENS);
  }, belts);

  takeByRule((item) => item.classification.category === 'top', tops);

  if (tops.length === 0) {
    takeByRule((item) => matchesAnyToken(itemText(item), ['shirt', 'blouse', 'tee', 't-shirt']), tops);
  }

  return {
    shoes: sortByNewest(shoes),
    pants: sortByNewest(pants),
    top: sortByNewest(tops),
    belt: sortByNewest(belts),
    sweater: sortByNewest(sweaters),
    jacket: sortByNewest(jackets),
  } as const;
}

export function generateWinterOutfitCombos(
  allItems: WardrobeItem[],
  maxCombos = 20,
  options: OutfitGenerationOptions = {}
): OutfitGenerationResult {
  const targetInsulation = normalizeTargetInsulation(options.targetInsulation);
  const classified = allItems.filter(isClassifiedItem);
  const inventory = classifyInventory(classified);

  const missingRequired = REQUIRED_ROLES.filter((role) => inventory[role].length === 0);
  const notes: string[] = [`Target outfit insulation: ${targetInsulation}/100.`];

  if (targetInsulation >= 60 && inventory.sweater.length === 0 && inventory.jacket.length === 0) {
    notes.push('No sweater or jacket classified yet; winter layering is limited.');
  }

  if (targetInsulation <= 45) {
    notes.push('Warm-weather mode: lighter outfits are preferred.');
  } else if (targetInsulation >= 70) {
    notes.push('Cold-weather mode: layered looks are preferred.');
  }
  notes.push('Diversity mode is enabled: generated looks rotate core pieces more aggressively.');

  if (missingRequired.length > 0) {
    return {
      combos: [],
      inventory: {
        shoes: inventory.shoes.length,
        pants: inventory.pants.length,
        top: inventory.top.length,
        belt: inventory.belt.length,
        sweater: inventory.sweater.length,
        jacket: inventory.jacket.length,
      },
      missingRequired,
      notes,
      targetInsulation,
    };
  }

  const shoesPool = trimPool(inventory.shoes, 8);
  const pantsPool = trimPool(inventory.pants, 8);
  const topPool = trimPool(inventory.top, 8);
  const sweaterPool = trimPool(inventory.sweater, 5);
  const jacketPool = trimPool(inventory.jacket, 5);
  const beltPool = trimPool(inventory.belt, 8);

  const requireWinterLayer =
    targetInsulation >= 60 && (sweaterPool.length > 0 || jacketPool.length > 0);
  const sweaterOptions: Array<ClassifiedItem | null> = sweaterPool.length > 0 ? [null, ...sweaterPool] : [null];
  const jacketOptions: Array<ClassifiedItem | null> = jacketPool.length > 0 ? [null, ...jacketPool] : [null];

  const rawCombos: OutfitCombo[] = [];
  let observedComboCount = 0;

  for (const top of topPool) {
    for (const pants of pantsPool) {
      for (const shoes of shoesPool) {
        if (top.id === pants.id || top.id === shoes.id || pants.id === shoes.id) {
          continue;
        }

        for (const sweater of sweaterOptions) {
          for (const jacket of jacketOptions) {
            if (sweater && (sweater.id === top.id || sweater.id === pants.id || sweater.id === shoes.id)) {
              continue;
            }

            if (jacket && (jacket.id === top.id || jacket.id === pants.id || jacket.id === shoes.id)) {
              continue;
            }

            if (sweater && jacket && sweater.id === jacket.id) {
              continue;
            }

            if (requireWinterLayer && !sweater && !jacket) {
              continue;
            }

            const excludedIds = new Set<string>([top.id, pants.id, shoes.id]);
            if (sweater) {
              excludedIds.add(sweater.id);
            }
            if (jacket) {
              excludedIds.add(jacket.id);
            }

            const belt = chooseBestBelt(beltPool, excludedIds, {
              top,
              pants,
              shoes,
              sweater,
              jacket,
            });

            const parts: OutfitCombo['parts'] = {
              top,
              pants,
              shoes,
              belt,
              sweater,
              jacket,
            };

            const scored = scoreCombo(parts, targetInsulation);
            const combo: OutfitCombo = {
              id: [
                top.id,
                pants.id,
                shoes.id,
                sweater?.id ?? 'none',
                jacket?.id ?? 'none',
                belt?.id ?? 'none',
              ].join('|'),
              score: scored.score,
              reasons: scored.reasons,
              insulationIndex: scored.insulationIndex,
              insulationDelta: scored.insulationDelta,
              parts,
            };

            observedComboCount += 1;
            if (rawCombos.length < MAX_RAW_COMBO_SAMPLE) {
              rawCombos.push(combo);
            } else {
              const replacementIndex = Math.floor(Math.random() * observedComboCount);
              if (replacementIndex < MAX_RAW_COMBO_SAMPLE) {
                rawCombos[replacementIndex] = combo;
              }
            }
          }
        }
      }
    }
  }

  const bestByCore = new Map<string, OutfitCombo>();
  rawCombos.forEach((combo) => {
    const coreKey = `${combo.parts.top.id}|${combo.parts.pants.id}|${combo.parts.shoes.id}`;
    const existing = bestByCore.get(coreKey);
    if (!existing || combo.score > existing.score) {
      bestByCore.set(coreKey, combo);
    }
  });

  const combos = selectDiverseCombos(
    Array.from(bestByCore.values()).sort((a, b) => b.score - a.score),
    Math.max(1, maxCombos)
  );

  return {
    combos,
    inventory: {
      shoes: inventory.shoes.length,
      pants: inventory.pants.length,
      top: inventory.top.length,
      belt: inventory.belt.length,
      sweater: inventory.sweater.length,
      jacket: inventory.jacket.length,
    },
    missingRequired,
    notes,
    targetInsulation,
  };
}
