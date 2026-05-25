import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as ExpoSharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { OpenAIRequestError, classifyWardrobeImage } from './src/openai';
import { generateTryOnImage } from './src/nanoBanana';
import { generateWinterOutfitCombos, type OutfitCombo, type OutfitGenerationResult } from './src/combinator';
import { DEVELOPER_MODE } from './src/config/constants';
import type { ClassificationStatus, GarmentClassification, WardrobeItem } from './src/types';

type Tab = 'camera' | 'wardrobe' | 'lookbook' | 'tryons' | 'outfit';
type WeatherProfile = 'warm' | 'mild' | 'cold';
type WardrobeCategory = {
  label: string;
  items: WardrobeItem[];
};

type LookPartRole = 'jacket' | 'sweater' | 'top' | 'belt' | 'pants' | 'shoes' | 'item';
type LookPartSnapshot = {
  role: LookPartRole;
  itemId: string;
  externalKey: string;
  uri: string;
  label: string;
};

type OutfitSource = 'lookbook' | 'wardrobe' | 'tryon' | 'inspiration';
type RenderFeedback = 'yay' | 'nay';
type OutfitRecord = {
  id: string;
  createdAt: number;
  name: string;
  source: OutfitSource;
  lookId: string;
  lookScore: number;
  lookInsulationIndex: number;
  lookInsulationDelta: number;
  lookReasons: string[];
  lookParts: LookPartSnapshot[];
};

type TryOnRenderRecord = {
  id: string;
  uri: string;
  createdAt: number;
  outfitId: string;
  outfitName: string;
  outfitSource: OutfitSource;
  lookId: string;
  lookScore: number;
  lookInsulationIndex: number;
  lookInsulationDelta: number;
  lookReasons: string[];
  lookParts: LookPartSnapshot[];
  feedback: RenderFeedback | null;
  feedbackAt: number | null;
};

type LookbookPrefs = {
  likedLookIds: string[];
};

type OutfitGraphNode = {
  externalKey: string;
  label: string;
  roles: LookPartRole[];
  appearances: number;
  yayCount: number;
  nayCount: number;
  lastFeedbackAt: number;
};

type OutfitGraphEdge = {
  edgeKey: string;
  itemAExternalKey: string;
  itemBExternalKey: string;
  coAppearances: number;
  yayCount: number;
  nayCount: number;
  lastFeedbackAt: number;
};

type OutfitIntelligenceGraph = {
  generatedAt: number;
  ratedRenderCount: number;
  nodes: OutfitGraphNode[];
  edges: OutfitGraphEdge[];
};

const PHOTO_DIRECTORY_NAME = 'captures';
const ORIGINAL_DIRECTORY_NAME = 'originals';
const INSPIRATION_DIRECTORY_NAME = 'inspirations';
const TRYON_SUBJECT_DIRECTORY_NAME = 'tryon-subjects';
const TRYON_RENDER_DIRECTORY_NAME = 'tryon-renders';
const METADATA_FILE_NAME = 'wardrobe-items.json';
const TRYON_METADATA_FILE_NAME = 'tryon-renders.json';
const LOOKBOOK_PREFS_FILE_NAME = 'lookbook-prefs.json';
const SAVED_OUTFITS_FILE_NAME = 'saved-outfits.json';
const OUTFIT_GRAPH_FILE_NAME = 'outfit-graph.json';
const WHITE_PAPER_NOTE =
  'TODO: require a white-paper reference in each photo for reliable color correction.';
const CLASSIFICATION_CONCURRENCY = 3;
const ROLE_DISPLAY_ORDER: LookPartRole[] = ['jacket', 'sweater', 'top', 'belt', 'pants', 'shoes', 'item'];
const WEATHER_PRESETS: Record<
  WeatherProfile,
  { label: string; subtitle: string; targetInsulation: number }
> = {
  warm: { label: 'Warm', subtitle: 'light layers', targetInsulation: 38 },
  mild: { label: 'Mild', subtitle: 'balanced', targetInsulation: 58 },
  cold: { label: 'Cold', subtitle: 'winter', targetInsulation: 78 },
};

function getPhotoDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_DIRECTORY_NAME);
}

function getOriginalDirectory(): Directory {
  return new Directory(Paths.document, ORIGINAL_DIRECTORY_NAME);
}

function getInspirationDirectory(): Directory {
  return new Directory(Paths.document, INSPIRATION_DIRECTORY_NAME);
}

function getMetadataFile(): File {
  return new File(Paths.document, METADATA_FILE_NAME);
}

function getTryOnMetadataFile(): File {
  return new File(Paths.document, TRYON_METADATA_FILE_NAME);
}

function getLookbookPrefsFile(): File {
  return new File(Paths.document, LOOKBOOK_PREFS_FILE_NAME);
}

function getSavedOutfitsFile(): File {
  return new File(Paths.document, SAVED_OUTFITS_FILE_NAME);
}

function getOutfitGraphFile(): File {
  return new File(Paths.document, OUTFIT_GRAPH_FILE_NAME);
}

function getTryOnSubjectDirectory(): Directory {
  return new Directory(Paths.document, TRYON_SUBJECT_DIRECTORY_NAME);
}

function getTryOnRenderDirectory(): Directory {
  return new Directory(Paths.document, TRYON_RENDER_DIRECTORY_NAME);
}

function ensurePhotoDirectory(): Directory {
  const directory = getPhotoDirectory();
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

function ensureOriginalDirectory(): Directory {
  const directory = getOriginalDirectory();
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

function ensureInspirationDirectory(): Directory {
  const directory = getInspirationDirectory();
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

function ensureTryOnSubjectDirectory(): Directory {
  const directory = getTryOnSubjectDirectory();
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

function ensureTryOnRenderDirectory(): Directory {
  const directory = getTryOnRenderDirectory();
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

function parseCreatedAtFromName(name: string): number {
  const timestamp = Number(name.split('-')[0]);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function defaultWardrobeItem(id: string, uri: string): WardrobeItem {
  return {
    id,
    uri,
    createdAt: parseCreatedAtFromName(id),
    sourceUri: null,
    originalLocalUri: null,
    originalSha256: null,
    jpegSha256: null,
    classificationStatus: 'unclassified',
    classification: null,
    classifiedAt: null,
    classificationError: null,
  };
}

function createPhotoBaseName(): string {
  const randomSuffix = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, '0');
  return `${Date.now()}-${randomSuffix}`;
}

function listImageUrisFromDirectory(directory: Directory): string[] {
  if (!directory.exists) {
    return [];
  }

  return directory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .sort((a, b) => parseCreatedAtFromName(b.name) - parseCreatedAtFromName(a.name))
    .map((entry) => entry.uri);
}

function getExtensionFromUri(uri: string): string {
  const sanitized = uri.split('?')[0].split('#')[0];
  const match = sanitized.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? 'bin';
}

async function sha256ForFileUri(uri: string): Promise<string> {
  const file = new File(uri);
  const base64 = await file.base64();
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
}

async function createWardrobeItemFromSourceUri(sourceUri: string): Promise<WardrobeItem> {
  const baseName = createPhotoBaseName();

  const originalDirectory = ensureOriginalDirectory();
  const originalExtension = getExtensionFromUri(sourceUri);
  const originalFile = new File(originalDirectory, `${baseName}.${originalExtension}`);
  new File(sourceUri).copy(originalFile);

  const jpegDirectory = ensurePhotoDirectory();
  const manipulated = await ImageManipulator.manipulateAsync(originalFile.uri, [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const jpegFile = new File(jpegDirectory, `${baseName}.jpg`);
  new File(manipulated.uri).copy(jpegFile);

  const [originalSha256, jpegSha256] = await Promise.all([
    sha256ForFileUri(originalFile.uri),
    sha256ForFileUri(jpegFile.uri),
  ]);

  return {
    id: `${baseName}.jpg`,
    uri: jpegFile.uri,
    createdAt: parseCreatedAtFromName(baseName),
    sourceUri,
    originalLocalUri: originalFile.uri,
    originalSha256,
    jpegSha256,
    classificationStatus: 'unclassified',
    classification: null,
    classifiedAt: null,
    classificationError: null,
  };
}

async function createTryOnSubjectFromSourceUri(sourceUri: string): Promise<string> {
  const baseName = createPhotoBaseName();
  const subjectDirectory = ensureTryOnSubjectDirectory();

  const manipulated = await ImageManipulator.manipulateAsync(sourceUri, [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const subjectFile = new File(subjectDirectory, `${baseName}.jpg`);
  new File(manipulated.uri).copy(subjectFile);
  return subjectFile.uri;
}

async function createInspirationOutfitFromSourceUri(sourceUri: string): Promise<OutfitRecord> {
  const baseName = createPhotoBaseName();
  const createdAt = parseCreatedAtFromName(baseName);
  const inspirationDirectory = ensureInspirationDirectory();

  const manipulated = await ImageManipulator.manipulateAsync(sourceUri, [], {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const inspirationFile = new File(inspirationDirectory, `${baseName}.jpg`);
  new File(manipulated.uri).copy(inspirationFile);
  const jpegSha256 = await sha256ForFileUri(inspirationFile.uri);

  return {
    id: `inspiration-${baseName}`,
    createdAt,
    name: `Inspiration ${new Date(createdAt).toLocaleString()}`,
    source: 'inspiration',
    lookId: '',
    lookScore: 0,
    lookInsulationIndex: 0,
    lookInsulationDelta: 0,
    lookReasons: [],
    lookParts: [
      {
        role: 'item',
        itemId: inspirationFile.name,
        externalKey: `inspiration-jpeg-sha256:${jpegSha256}`,
        uri: inspirationFile.uri,
        label: 'Shared inspiration',
      },
    ],
  };
}

async function saveTryOnRenderFromBase64(base64Image: string): Promise<{
  id: string;
  uri: string;
  createdAt: number;
}> {
  const renderDirectory = ensureTryOnRenderDirectory();
  const baseName = createPhotoBaseName();
  const renderFile = new File(renderDirectory, `${baseName}-render.jpg`);
  const rawBase64 = base64Image.includes(',') ? base64Image.split(',').pop() ?? '' : base64Image;
  const sanitizedBase64 = rawBase64.replace(/\s+/g, '');

  await FileSystemLegacy.writeAsStringAsync(renderFile.uri, sanitizedBase64, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });

  return {
    id: renderFile.name,
    uri: renderFile.uri,
    createdAt: parseCreatedAtFromName(baseName),
  };
}

function roleLabel(role: LookPartRole): string {
  if (role === 'item') {
    return 'Item';
  }
  return role[0].toUpperCase() + role.slice(1);
}

function roleRank(role: LookPartRole): number {
  const found = ROLE_DISPLAY_ORDER.indexOf(role);
  return found >= 0 ? found : ROLE_DISPLAY_ORDER.length;
}

function normalizeOutfitSource(value: unknown): OutfitSource {
  if (value === 'lookbook' || value === 'wardrobe' || value === 'tryon' || value === 'inspiration') {
    return value;
  }
  return 'lookbook';
}

function externalKeyForItem(item: WardrobeItem): string {
  if (item.originalSha256) {
    return `orig-sha256:${item.originalSha256}`;
  }
  if (item.jpegSha256) {
    return `jpeg-sha256:${item.jpegSha256}`;
  }
  return `item-id:${item.id}`;
}

function guessRoleForItem(item: WardrobeItem): LookPartRole {
  const text = [
    item.classification?.category ?? '',
    item.classification?.subcategory ?? '',
    item.classification?.itemType ?? '',
    item.classification?.shoeType ?? '',
    ...(item.classification?.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  if (item.classification?.category === 'shoes' || /\b(shoe|sneaker|boot|loafer|heel|sandal)\b/.test(text)) {
    return 'shoes';
  }
  if (item.classification?.category === 'bottom' || /\b(pant|jean|trouser|chino|slack|jogger|cargo|legging)\b/.test(text)) {
    return 'pants';
  }
  if (item.classification?.category === 'accessory' && /\bbelt\b/.test(text)) {
    return 'belt';
  }
  if (item.classification?.category === 'outerwear' || /\b(jacket|coat|parka|puffer|blazer|bomber|anorak)\b/.test(text)) {
    return 'jacket';
  }
  if (
    item.classification?.category === 'top' &&
    /\b(sweater|hoodie|cardigan|pullover|knit|sweatshirt|fleece)\b/.test(text)
  ) {
    return 'sweater';
  }
  if (item.classification?.category === 'top') {
    return 'top';
  }
  return 'item';
}

function snapshotFromItem(item: WardrobeItem, role: LookPartRole): LookPartSnapshot {
  return {
    role,
    itemId: item.id,
    externalKey: externalKeyForItem(item),
    uri: item.uri,
    label: itemNameForOutfit(item),
  };
}

function sortLookPartSnapshots(parts: LookPartSnapshot[]): LookPartSnapshot[] {
  return [...parts].sort((a, b) => {
    const roleDiff = roleRank(a.role) - roleRank(b.role);
    if (roleDiff !== 0) {
      return roleDiff;
    }
    return a.label.localeCompare(b.label);
  });
}

function lookPartSnapshots(combo: OutfitCombo): LookPartSnapshot[] {
  const candidates: Array<{ role: LookPartRole; item: WardrobeItem | null }> = [
    { role: 'jacket', item: combo.parts.jacket },
    { role: 'sweater', item: combo.parts.sweater },
    { role: 'top', item: combo.parts.top },
    { role: 'belt', item: combo.parts.belt },
    { role: 'pants', item: combo.parts.pants },
    { role: 'shoes', item: combo.parts.shoes },
  ];

  return candidates
    .filter((entry): entry is { role: LookPartRole; item: WardrobeItem } => entry.item !== null)
    .map((entry) => snapshotFromItem(entry.item, entry.role));
}

function lookPartSnapshotsFromWardrobeItems(selectedItems: WardrobeItem[]): LookPartSnapshot[] {
  return sortLookPartSnapshots(selectedItems.map((item) => snapshotFromItem(item, guessRoleForItem(item))));
}

function normalizeRenderFeedback(value: unknown): RenderFeedback | null {
  if (value === 'yay' || value === 'nay') {
    return value;
  }
  return null;
}

function normalizedExternalKey(part: LookPartSnapshot): string {
  if (part.externalKey.length > 0) {
    return part.externalKey;
  }
  if (part.itemId.length > 0) {
    return `item-id:${part.itemId}`;
  }
  return `part-uri:${part.uri}`;
}

function edgeKeyForExternalKeys(first: string, second: string): string {
  return first < second ? `${first}::${second}` : `${second}::${first}`;
}

function buildOutfitIntelligenceGraph(records: TryOnRenderRecord[]): OutfitIntelligenceGraph {
  const nodeMap = new Map<
    string,
    {
      externalKey: string;
      label: string;
      roles: Set<LookPartRole>;
      appearances: number;
      yayCount: number;
      nayCount: number;
      lastFeedbackAt: number;
    }
  >();
  const edgeMap = new Map<string, OutfitGraphEdge>();
  let ratedRenderCount = 0;

  records.forEach((record) => {
    const feedback = record.feedback;
    if (!feedback) {
      return;
    }

    ratedRenderCount += 1;
    const feedbackAt = record.feedbackAt ?? record.createdAt;

    const uniquePartMap = new Map<string, LookPartSnapshot>();
    record.lookParts.forEach((part) => {
      const key = normalizedExternalKey(part);
      if (!uniquePartMap.has(key)) {
        uniquePartMap.set(key, {
          ...part,
          externalKey: key,
        });
      }
    });
    const uniqueParts = Array.from(uniquePartMap.values());

    uniqueParts.forEach((part) => {
      const key = part.externalKey;
      const existing = nodeMap.get(key);
      if (existing) {
        existing.appearances += 1;
        existing.roles.add(part.role);
        if (feedback === 'yay') {
          existing.yayCount += 1;
        } else {
          existing.nayCount += 1;
        }
        existing.lastFeedbackAt = Math.max(existing.lastFeedbackAt, feedbackAt);
      } else {
        nodeMap.set(key, {
          externalKey: key,
          label: part.label || roleLabel(part.role),
          roles: new Set([part.role]),
          appearances: 1,
          yayCount: feedback === 'yay' ? 1 : 0,
          nayCount: feedback === 'nay' ? 1 : 0,
          lastFeedbackAt: feedbackAt,
        });
      }
    });

    for (let i = 0; i < uniqueParts.length; i += 1) {
      for (let j = i + 1; j < uniqueParts.length; j += 1) {
        const first = uniqueParts[i];
        const second = uniqueParts[j];
        const edgeKey = edgeKeyForExternalKeys(first.externalKey, second.externalKey);
        const existingEdge = edgeMap.get(edgeKey);
        if (existingEdge) {
          existingEdge.coAppearances += 1;
          if (feedback === 'yay') {
            existingEdge.yayCount += 1;
          } else {
            existingEdge.nayCount += 1;
          }
          existingEdge.lastFeedbackAt = Math.max(existingEdge.lastFeedbackAt, feedbackAt);
        } else {
          const [itemAExternalKey, itemBExternalKey] =
            first.externalKey < second.externalKey
              ? [first.externalKey, second.externalKey]
              : [second.externalKey, first.externalKey];

          edgeMap.set(edgeKey, {
            edgeKey,
            itemAExternalKey,
            itemBExternalKey,
            coAppearances: 1,
            yayCount: feedback === 'yay' ? 1 : 0,
            nayCount: feedback === 'nay' ? 1 : 0,
            lastFeedbackAt: feedbackAt,
          });
        }
      }
    }
  });

  const nodes: OutfitGraphNode[] = Array.from(nodeMap.values())
    .map((node) => ({
      externalKey: node.externalKey,
      label: node.label,
      roles: Array.from(node.roles).sort((a, b) => roleRank(a) - roleRank(b)),
      appearances: node.appearances,
      yayCount: node.yayCount,
      nayCount: node.nayCount,
      lastFeedbackAt: node.lastFeedbackAt,
    }))
    .sort((a, b) => b.yayCount - a.yayCount || b.appearances - a.appearances || a.label.localeCompare(b.label));

  const edges = Array.from(edgeMap.values()).sort(
    (a, b) =>
      b.yayCount - a.yayCount ||
      b.coAppearances - a.coAppearances ||
      a.itemAExternalKey.localeCompare(b.itemAExternalKey)
  );

  return {
    generatedAt: Date.now(),
    ratedRenderCount,
    nodes,
    edges,
  };
}

function defaultTryOnRenderRecord(id: string, uri: string): TryOnRenderRecord {
  return {
    id,
    uri,
    createdAt: parseCreatedAtFromName(id),
    outfitId: '',
    outfitName: '',
    outfitSource: 'lookbook',
    lookId: '',
    lookScore: 0,
    lookInsulationIndex: 0,
    lookInsulationDelta: 0,
    lookReasons: [],
    lookParts: [],
    feedback: null,
    feedbackAt: null,
  };
}

function isLookPartRole(value: unknown): value is LookPartRole {
  return (
    value === 'jacket' ||
    value === 'sweater' ||
    value === 'top' ||
    value === 'belt' ||
    value === 'pants' ||
    value === 'shoes' ||
    value === 'item'
  );
}

function readStoredTryOnRenders(raw: string | null): Record<string, TryOnRenderRecord> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return {};
    }

    const map: Record<string, TryOnRenderRecord> = {};
    parsed.forEach((entry) => {
      if (!isRecord(entry)) {
        return;
      }

      const id = typeof entry.id === 'string' ? entry.id : null;
      const uri = typeof entry.uri === 'string' ? entry.uri : null;
      if (!id || !uri) {
        return;
      }

      const lookParts = Array.isArray(entry.lookParts)
        ? entry.lookParts
            .filter((part) => isRecord(part) && isLookPartRole(part.role))
            .map((part) => ({
              role: part.role as LookPartRole,
              itemId: typeof part.itemId === 'string' ? part.itemId : '',
              externalKey:
                typeof part.externalKey === 'string'
                  ? part.externalKey
                  : typeof part.itemId === 'string'
                    ? `item-id:${part.itemId}`
                    : '',
              uri: typeof part.uri === 'string' ? part.uri : '',
              label: typeof part.label === 'string' ? part.label : 'Item',
            }))
            .filter((part) => part.uri.length > 0)
        : [];

      map[id] = {
        id,
        uri,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : parseCreatedAtFromName(id),
        outfitId: typeof entry.outfitId === 'string' ? entry.outfitId : '',
        outfitName: typeof entry.outfitName === 'string' ? entry.outfitName : '',
        outfitSource: normalizeOutfitSource(entry.outfitSource),
        lookId: typeof entry.lookId === 'string' ? entry.lookId : '',
        lookScore: typeof entry.lookScore === 'number' ? entry.lookScore : 0,
        lookInsulationIndex:
          typeof entry.lookInsulationIndex === 'number' ? entry.lookInsulationIndex : 0,
        lookInsulationDelta:
          typeof entry.lookInsulationDelta === 'number' ? entry.lookInsulationDelta : 0,
        lookReasons: Array.isArray(entry.lookReasons)
          ? entry.lookReasons.filter((reason): reason is string => typeof reason === 'string')
          : [],
        lookParts,
        feedback: normalizeRenderFeedback(entry.feedback),
        feedbackAt: typeof entry.feedbackAt === 'number' ? entry.feedbackAt : null,
      };
    });

    return map;
  } catch {
    return {};
  }
}

async function loadStoredTryOnRenders(): Promise<Record<string, TryOnRenderRecord>> {
  const metadataFile = getTryOnMetadataFile();
  if (!metadataFile.exists) {
    return {};
  }

  try {
    const raw = await metadataFile.text();
    return readStoredTryOnRenders(raw);
  } catch {
    return {};
  }
}

function persistTryOnRenders(records: TryOnRenderRecord[]) {
  try {
    const metadataFile = getTryOnMetadataFile();
    if (!metadataFile.exists) {
      metadataFile.create({ intermediates: true, overwrite: true });
    }
    metadataFile.write(JSON.stringify(records));

    const graphFile = getOutfitGraphFile();
    if (!graphFile.exists) {
      graphFile.create({ intermediates: true, overwrite: true });
    }
    const graph = buildOutfitIntelligenceGraph(records);
    graphFile.write(JSON.stringify(graph));
  } catch {
    // non-fatal
  }
}

function mergeFilesystemAndStoredTryOnRenders(
  fileUris: string[],
  storedMap: Record<string, TryOnRenderRecord>
): TryOnRenderRecord[] {
  const merged = fileUris.map((uri) => {
    const file = new File(uri);
    const stored = storedMap[file.name];
    if (!stored) {
      return defaultTryOnRenderRecord(file.name, uri);
    }

    return {
      ...stored,
      uri,
      id: file.name,
    };
  });

  return merged.sort((a, b) => b.createdAt - a.createdAt);
}

function readLookbookPrefs(raw: string | null): LookbookPrefs {
  if (!raw) {
    return { likedLookIds: [] };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.likedLookIds)) {
      return { likedLookIds: [] };
    }

    return {
      likedLookIds: parsed.likedLookIds.filter((id): id is string => typeof id === 'string'),
    };
  } catch {
    return { likedLookIds: [] };
  }
}

async function loadLookbookPrefs(): Promise<LookbookPrefs> {
  const prefsFile = getLookbookPrefsFile();
  if (!prefsFile.exists) {
    return { likedLookIds: [] };
  }

  try {
    const raw = await prefsFile.text();
    return readLookbookPrefs(raw);
  } catch {
    return { likedLookIds: [] };
  }
}

function persistLookbookPrefs(prefs: LookbookPrefs) {
  try {
    const prefsFile = getLookbookPrefsFile();
    if (!prefsFile.exists) {
      prefsFile.create({ intermediates: true, overwrite: true });
    }
    prefsFile.write(JSON.stringify(prefs));
  } catch {
    // non-fatal
  }
}

function readSavedOutfits(raw: string | null): OutfitRecord[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    const outfits: OutfitRecord[] = [];
    parsed.forEach((entry) => {
      if (!isRecord(entry)) {
        return;
      }

      const id = typeof entry.id === 'string' ? entry.id : null;
      const name = typeof entry.name === 'string' ? entry.name : null;
      if (!id || !name) {
        return;
      }

      const lookParts = Array.isArray(entry.lookParts)
        ? entry.lookParts
            .filter((part) => isRecord(part) && isLookPartRole(part.role))
            .map((part) => ({
              role: part.role as LookPartRole,
              itemId: typeof part.itemId === 'string' ? part.itemId : '',
              externalKey:
                typeof part.externalKey === 'string'
                  ? part.externalKey
                  : typeof part.itemId === 'string'
                    ? `item-id:${part.itemId}`
                    : '',
              uri: typeof part.uri === 'string' ? part.uri : '',
              label: typeof part.label === 'string' ? part.label : 'Item',
            }))
            .filter((part) => part.uri.length > 0)
        : [];

      outfits.push({
        id,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : parseCreatedAtFromName(id),
        name,
        source: normalizeOutfitSource(entry.source),
        lookId: typeof entry.lookId === 'string' ? entry.lookId : '',
        lookScore: typeof entry.lookScore === 'number' ? entry.lookScore : 0,
        lookInsulationIndex:
          typeof entry.lookInsulationIndex === 'number' ? entry.lookInsulationIndex : 0,
        lookInsulationDelta:
          typeof entry.lookInsulationDelta === 'number' ? entry.lookInsulationDelta : 0,
        lookReasons: Array.isArray(entry.lookReasons)
          ? entry.lookReasons.filter((reason): reason is string => typeof reason === 'string')
          : [],
        lookParts: sortLookPartSnapshots(lookParts),
      });
    });

    return outfits.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function loadSavedOutfits(): Promise<OutfitRecord[]> {
  const outfitsFile = getSavedOutfitsFile();
  if (!outfitsFile.exists) {
    return [];
  }

  try {
    const raw = await outfitsFile.text();
    return readSavedOutfits(raw);
  } catch {
    return [];
  }
}

function persistSavedOutfits(outfits: OutfitRecord[]) {
  try {
    const outfitsFile = getSavedOutfitsFile();
    if (!outfitsFile.exists) {
      outfitsFile.create({ intermediates: true, overwrite: true });
    }
    outfitsFile.write(JSON.stringify(outfits));
  } catch {
    // non-fatal
  }
}

function sortNewestFirst(items: WardrobeItem[]): WardrobeItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

function listItemsFromFilesystem(): WardrobeItem[] {
  const directory = getPhotoDirectory();
  if (!directory.exists) {
    return [];
  }

  return sortNewestFirst(
    directory
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((entry) => defaultWardrobeItem(entry.name, entry.uri))
  );
}

function isClassificationStatus(value: unknown): value is ClassificationStatus {
  return value === 'unclassified' || value === 'classified' || value === 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeStoredClassification(value: unknown): GarmentClassification | null {
  if (!isRecord(value)) {
    return null;
  }
  return value as GarmentClassification;
}

function readStoredItems(raw: string | null): Record<string, WardrobeItem> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return {};
    }

    const map: Record<string, WardrobeItem> = {};
    parsed.forEach((entry) => {
      if (!isRecord(entry)) {
        return;
      }

      const id = typeof entry.id === 'string' ? entry.id : null;
      const uri = typeof entry.uri === 'string' ? entry.uri : null;
      if (!id || !uri) {
        return;
      }

      map[id] = {
        id,
        uri,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : parseCreatedAtFromName(id),
        sourceUri: typeof entry.sourceUri === 'string' ? entry.sourceUri : null,
        originalLocalUri: typeof entry.originalLocalUri === 'string' ? entry.originalLocalUri : null,
        originalSha256: typeof entry.originalSha256 === 'string' ? entry.originalSha256 : null,
        jpegSha256: typeof entry.jpegSha256 === 'string' ? entry.jpegSha256 : null,
        classificationStatus: isClassificationStatus(entry.classificationStatus)
          ? entry.classificationStatus
          : 'unclassified',
        classification: sanitizeStoredClassification(entry.classification),
        classifiedAt: typeof entry.classifiedAt === 'number' ? entry.classifiedAt : null,
        classificationError:
          typeof entry.classificationError === 'string' ? entry.classificationError : null,
      };
    });

    return map;
  } catch {
    return {};
  }
}

async function loadStoredItemsFromMetadataFile(): Promise<Record<string, WardrobeItem>> {
  const metadataFile = getMetadataFile();
  if (!metadataFile.exists) {
    return {};
  }

  try {
    const raw = await metadataFile.text();
    return readStoredItems(raw);
  } catch {
    return {};
  }
}

function persistItemsToMetadataFile(items: WardrobeItem[]) {
  try {
    const metadataFile = getMetadataFile();
    if (!metadataFile.exists) {
      metadataFile.create({ intermediates: true, overwrite: true });
    }
    metadataFile.write(JSON.stringify(items));
  } catch {
    // Non-fatal; app can still operate with in-memory state.
  }
}

function mergeFilesystemAndStored(
  fileItems: WardrobeItem[],
  storedMap: Record<string, WardrobeItem>
): WardrobeItem[] {
  const merged = fileItems.map((fileItem) => {
    const storedItem = storedMap[fileItem.id];
    if (!storedItem) {
      return fileItem;
    }

    return {
      ...fileItem,
      sourceUri: storedItem.sourceUri,
      originalLocalUri: storedItem.originalLocalUri,
      originalSha256: storedItem.originalSha256,
      jpegSha256: storedItem.jpegSha256,
      classificationStatus: storedItem.classificationStatus,
      classification: storedItem.classification,
      classifiedAt: storedItem.classifiedAt,
      classificationError: storedItem.classificationError,
    };
  });

  return sortNewestFirst(merged);
}

function primaryLabel(item: WardrobeItem): string {
  if (!item.classification) {
    return item.classificationStatus === 'error' ? 'Classification failed' : 'Unclassified';
  }

  const parts = [item.classification.category, item.classification.subcategory, item.classification.itemType]
    .filter((part) => part && part !== 'unknown')
    .slice(0, 2);

  return parts.length > 0 ? parts.join(' • ') : 'Classified';
}

function colorSummary(item: WardrobeItem): string {
  if (!item.classification || item.classification.dominantColors.length === 0) {
    return 'No color profile yet';
  }

  return item.classification.dominantColors
    .slice(0, 3)
    .map((color) => color.name)
    .join(', ');
}

function featureSummary(item: WardrobeItem): string {
  if (!item.classification) {
    return 'Run analysis to detect collar, pockets, fit, and more.';
  }

  const topFeatures = item.classification.features.slice(0, 3);
  if (topFeatures.length > 0) {
    return topFeatures.join(', ');
  }

  return `Fit: ${item.classification.fit} • Pockets: ${item.classification.pockets}`;
}

function referenceSummary(item: WardrobeItem): string {
  if (!item.originalSha256 || !item.jpegSha256) {
    return 'Reference hashes pending';
  }

  return `orig:${item.originalSha256.slice(0, 10)} • jpg:${item.jpegSha256.slice(0, 10)}`;
}

function insulationSummary(item: WardrobeItem): string {
  if (!item.classification) {
    return 'No insulation profile yet';
  }

  const raw = Number(item.classification.insulationIndex);
  const index = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : null;

  if (index === null) {
    return 'No insulation profile yet';
  }

  if (index >= 72) {
    return `${index}/100 (high warmth)`;
  }
  if (index >= 45) {
    return `${index}/100 (mid warmth)`;
  }
  return `${index}/100 (light)`;
}

function itemNameForOutfit(item: WardrobeItem): string {
  if (!item.classification) {
    return 'Unclassified item';
  }

  const candidates = [
    item.classification.itemType,
    item.classification.subcategory,
    item.classification.category,
  ];
  const named = candidates.find((entry) => entry && entry !== 'unknown');
  return named ?? 'Item';
}

function lookPartsInDisplayOrder(combo: OutfitCombo): WardrobeItem[] {
  return [
    combo.parts.jacket,
    combo.parts.sweater,
    combo.parts.top,
    combo.parts.belt,
    combo.parts.pants,
    combo.parts.shoes,
  ].filter((part): part is WardrobeItem => part !== null);
}

function resolveLookPartSnapshots(parts: LookPartSnapshot[], liveItems: WardrobeItem[]): LookPartSnapshot[] {
  const byId = new Map<string, WardrobeItem>();
  const byExternalKey = new Map<string, WardrobeItem>();

  liveItems.forEach((item) => {
    byId.set(item.id, item);
    byExternalKey.set(externalKeyForItem(item), item);
  });

  return sortLookPartSnapshots(
    parts.map((part) => {
      const match = byId.get(part.itemId) ?? byExternalKey.get(part.externalKey);
      if (!match) {
        return part;
      }

      const role = part.role === 'item' ? guessRoleForItem(match) : part.role;
      return {
        ...part,
        role,
        itemId: match.id,
        externalKey: externalKeyForItem(match),
        uri: match.uri,
        label: itemNameForOutfit(match),
      };
    })
  );
}

function createOutfitRecordFromLook(
  combo: OutfitCombo,
  options: {
    name: string;
    source: OutfitSource;
    id?: string;
    createdAt?: number;
  }
): OutfitRecord {
  return {
    id: options.id ?? `outfit-${createPhotoBaseName()}`,
    createdAt: options.createdAt ?? Date.now(),
    name: options.name,
    source: options.source,
    lookId: combo.id,
    lookScore: combo.score,
    lookInsulationIndex: combo.insulationIndex,
    lookInsulationDelta: combo.insulationDelta,
    lookReasons: combo.reasons,
    lookParts: sortLookPartSnapshots(lookPartSnapshots(combo)),
  };
}

function createManualOutfitRecord(selectedItems: WardrobeItem[]): OutfitRecord {
  return {
    id: `outfit-${createPhotoBaseName()}`,
    createdAt: Date.now(),
    name: `Custom Outfit ${new Date().toLocaleDateString()}`,
    source: 'wardrobe',
    lookId: '',
    lookScore: 0,
    lookInsulationIndex: 0,
    lookInsulationDelta: 0,
    lookReasons: [],
    lookParts: lookPartSnapshotsFromWardrobeItems(selectedItems),
  };
}

function buildOutfitDescriptor(parts: LookPartSnapshot[]): string {
  const sorted = sortLookPartSnapshots(parts);
  return sorted.map((part) => `${roleLabel(part.role)}: ${part.label}`).join('. ');
}

function titleCaseLabel(value: string): string {
  if (!value) {
    return value;
  }

  return value
    .split(/[\s_-]+/)
    .filter((token) => token.length > 0)
    .map((token) => `${token[0].toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(' ');
}

function categoryLabelForItem(item: WardrobeItem): string {
  if (item.classificationStatus === 'classified' && item.classification?.category) {
    const rawCategory = item.classification.category.trim().toLowerCase();
    if (rawCategory && rawCategory !== 'unknown') {
      return titleCaseLabel(rawCategory);
    }
  }

  return 'Not analyzed yet';
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof OpenAIRequestError) {
    return error.status === 429;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('status 429') ||
    message.includes('(429)') ||
    message.includes(' 429')
  );
}

function sharePayloadFileUri(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const fileUri = typeof payload.fileUri === 'string' ? payload.fileUri : null;
  if (!fileUri || fileUri.length === 0) {
    return null;
  }
  return fileUri;
}

function isImageSharePayload(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }

  const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType.toLowerCase() : '';
  const contentType = typeof payload.contentType === 'string' ? payload.contentType.toLowerCase() : '';
  const fileUri = sharePayloadFileUri(payload);
  if (!fileUri) {
    return false;
  }

  if (mimeType.startsWith('image/')) {
    return true;
  }

  if (contentType.startsWith('image/') || contentType.includes('image')) {
    return true;
  }

  return /\.(jpe?g|png|heic|heif|webp|bmp|gif)$/i.test(fileUri.split('?')[0] ?? fileUri);
}

function sharePayloadFingerprint(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const fileUri = sharePayloadFileUri(payload);
  if (!fileUri) {
    return null;
  }

  const fileSize = typeof payload.fileSize === 'number' ? String(payload.fileSize) : '';
  return `${fileUri}|${fileSize}`;
}

function useIncomingShareCompat(): {
  incomingSharedPayload: unknown;
  clearIncomingShare: () => void;
} {
  const maybeHook = (ExpoSharing as unknown as {
    useIncomingShare?: () => {
      incomingSharedPayload: unknown;
      clearIncomingShare: () => void;
    };
  }).useIncomingShare;

  if (typeof maybeHook === 'function') {
    const value = maybeHook();
    return {
      incomingSharedPayload: value.incomingSharedPayload,
      clearIncomingShare: value.clearIncomingShare,
    };
  }

  return {
    incomingSharedPayload: null,
    clearIncomingShare: () => {
      // no-op for SDKs without incoming share support
    },
  };
}

export default function App() {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { incomingSharedPayload, clearIncomingShare } = useIncomingShareCompat();
  const lastHandledShareFingerprintRef = useRef<string | null>(null);

  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('wardrobe');

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);

  const [classificationProgress, setClassificationProgress] = useState({ done: 0, total: 0 });
  const [analysisPaused, setAnalysisPaused] = useState(false);
  const [deletingItemIds, setDeletingItemIds] = useState<Record<string, boolean>>({});
  const [outfitCombos, setOutfitCombos] = useState<OutfitCombo[]>([]);
  const [outfitResult, setOutfitResult] = useState<OutfitGenerationResult | null>(null);
  const [isGeneratingCombos, setIsGeneratingCombos] = useState(false);
  const [weatherProfile, setWeatherProfile] = useState<WeatherProfile>('cold');
  const [selectedLookId, setSelectedLookId] = useState<string | null>(null);
  const [likedLookIds, setLikedLookIds] = useState<string[]>([]);
  const [selectedWardrobeItemIds, setSelectedWardrobeItemIds] = useState<string[]>([]);
  const [savedOutfits, setSavedOutfits] = useState<OutfitRecord[]>([]);
  const [activeOutfit, setActiveOutfit] = useState<OutfitRecord | null>(null);
  const [subjectPhotoUris, setSubjectPhotoUris] = useState<string[]>([]);
  const [selectedSubjectPhotoUri, setSelectedSubjectPhotoUri] = useState<string | null>(null);
  const [tryOnRenders, setTryOnRenders] = useState<TryOnRenderRecord[]>([]);
  const [selectedTryOnRenderId, setSelectedTryOnRenderId] = useState<string | null>(null);
  const [imageViewerUri, setImageViewerUri] = useState<string | null>(null);
  const [imageViewerSession, setImageViewerSession] = useState(0);
  const [isPreparingSubjectPhoto, setIsPreparingSubjectPhoto] = useState(false);
  const [isRunningTryOn, setIsRunningTryOn] = useState(false);
  const [tryOnStatusMessage, setTryOnStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [wardrobeColumns, setWardrobeColumns] = useState(3);
  const [wardrobeDetailItem, setWardrobeDetailItem] = useState<WardrobeItem | null>(null);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        ensurePhotoDirectory();
        ensureOriginalDirectory();
        ensureInspirationDirectory();
        const subjectDirectory = ensureTryOnSubjectDirectory();
        const renderDirectory = ensureTryOnRenderDirectory();

        const [
          fileItems,
          storedMap,
          loadedSubjectPhotoUris,
          renderFileUris,
          storedTryOnMap,
          lookbookPrefs,
          loadedSavedOutfits,
        ] =
          await Promise.all([
          Promise.resolve(listItemsFromFilesystem()),
          loadStoredItemsFromMetadataFile(),
          Promise.resolve(listImageUrisFromDirectory(subjectDirectory)),
          Promise.resolve(listImageUrisFromDirectory(renderDirectory)),
          loadStoredTryOnRenders(),
          loadLookbookPrefs(),
          loadSavedOutfits(),
        ]);

        const merged = mergeFilesystemAndStored(fileItems, storedMap);
        const mergedTryOnRenders = mergeFilesystemAndStoredTryOnRenders(renderFileUris, storedTryOnMap);
        if (!mounted) {
          return;
        }

        setItems(merged);
        setSubjectPhotoUris(loadedSubjectPhotoUris);
        setSelectedSubjectPhotoUri(loadedSubjectPhotoUris[0] ?? null);
        setTryOnRenders(mergedTryOnRenders);
        setSelectedTryOnRenderId(mergedTryOnRenders[0]?.id ?? null);
        setLikedLookIds(lookbookPrefs.likedLookIds);
        setSavedOutfits(loadedSavedOutfits);
        setActiveOutfit(
          loadedSavedOutfits.find((outfit) => outfit.source !== 'inspiration') ?? loadedSavedOutfits[0] ?? null
        );
        persistItemsToMetadataFile(merged);
        persistTryOnRenders(mergedTryOnRenders);
        persistSavedOutfits(loadedSavedOutfits);
      } catch (error) {
        if (!mounted) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load wardrobe.');
      } finally {
        if (mounted) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const commitItems = useCallback((updater: (current: WardrobeItem[]) => WardrobeItem[]) => {
    setItems((current) => {
      const next = sortNewestFirst(updater(current));
      persistItemsToMetadataFile(next);
      return next;
    });
  }, []);

  const commitTryOnRenders = useCallback(
    (updater: (current: TryOnRenderRecord[]) => TryOnRenderRecord[]) => {
      setTryOnRenders((current) => {
        const next = [...updater(current)].sort((a, b) => b.createdAt - a.createdAt);
        persistTryOnRenders(next);
        return next;
      });
    },
    []
  );

  const commitSavedOutfits = useCallback((updater: (current: OutfitRecord[]) => OutfitRecord[]) => {
    setSavedOutfits((current) => {
      const next = [...updater(current)].sort((a, b) => b.createdAt - a.createdAt);
      persistSavedOutfits(next);
      return next;
    });
  }, []);

  const pendingCount = useMemo(
    () => items.filter((item) => item.classificationStatus !== 'classified').length,
    [items]
  );

  const groupedCategories = useMemo<WardrobeCategory[]>(() => {
    const map = new Map<string, WardrobeItem[]>();

    items.forEach((item) => {
      const label = categoryLabelForItem(item);
      const existing = map.get(label);
      if (existing) {
        existing.push(item);
      } else {
        map.set(label, [item]);
      }
    });

    const sections = Array.from(map.entries()).map(([label, groupedItems]) => ({
      label,
      items: sortNewestFirst(groupedItems),
    }));

    sections.sort((a, b) => {
      if (a.label === 'Not analyzed yet') {
        return -1;
      }
      if (b.label === 'Not analyzed yet') {
        return 1;
      }
      return a.label.localeCompare(b.label);
    });

    return sections;
  }, [items]);

  const selectedWardrobeItemSet = useMemo(
    () => new Set<string>(selectedWardrobeItemIds),
    [selectedWardrobeItemIds]
  );

  const selectedWardrobeItems = useMemo(
    () => items.filter((item) => selectedWardrobeItemSet.has(item.id)),
    [items, selectedWardrobeItemSet]
  );

  const selectedRoleCoverage = useMemo(() => {
    const roles = new Set(selectedWardrobeItems.map((item) => guessRoleForItem(item)));
    return {
      top: roles.has('top') || roles.has('sweater'),
      pants: roles.has('pants'),
      shoes: roles.has('shoes'),
    };
  }, [selectedWardrobeItems]);

  const visibleOutfitCombos = useMemo(() => {
    const activeIds = new Set(items.map((item) => item.id));

    return outfitCombos.filter((combo) => {
      const parts = [
        combo.parts.top,
        combo.parts.pants,
        combo.parts.shoes,
        combo.parts.belt,
        combo.parts.sweater,
        combo.parts.jacket,
      ];

      return parts.every((part) => part === null || activeIds.has(part.id));
    });
  }, [items, outfitCombos]);

  const selectedLook = useMemo(() => {
    if (visibleOutfitCombos.length === 0) {
      return null;
    }

    if (!selectedLookId) {
      return visibleOutfitCombos[0];
    }

    return visibleOutfitCombos.find((combo) => combo.id === selectedLookId) ?? visibleOutfitCombos[0];
  }, [selectedLookId, visibleOutfitCombos]);

  const selectedLookIndex = useMemo(() => {
    if (!selectedLook) {
      return -1;
    }

    return visibleOutfitCombos.findIndex((combo) => combo.id === selectedLook.id);
  }, [selectedLook, visibleOutfitCombos]);

  const selectedLookRenders = useMemo(() => {
    if (!selectedLook) {
      return [];
    }
    return tryOnRenders.filter((render) => render.lookId === selectedLook.id);
  }, [selectedLook, tryOnRenders]);

  const selectedTryOnRender = useMemo(() => {
    if (!selectedTryOnRenderId) {
      return tryOnRenders[0] ?? null;
    }
    return tryOnRenders.find((render) => render.id === selectedTryOnRenderId) ?? tryOnRenders[0] ?? null;
  }, [selectedTryOnRenderId, tryOnRenders]);

  const resolvedActiveOutfit = useMemo(() => {
    if (!activeOutfit) {
      return null;
    }
    return {
      ...activeOutfit,
      lookParts: resolveLookPartSnapshots(activeOutfit.lookParts, items),
    };
  }, [activeOutfit, items]);

  const activeOutfitLatestRender = useMemo(() => {
    if (!resolvedActiveOutfit) {
      return null;
    }
    return tryOnRenders.find((render) => render.outfitId === resolvedActiveOutfit.id) ?? null;
  }, [resolvedActiveOutfit, tryOnRenders]);

  const outfitGraph = useMemo(() => buildOutfitIntelligenceGraph(tryOnRenders), [tryOnRenders]);

  const isActiveOutfitSaved = useMemo(
    () => Boolean(activeOutfit && savedOutfits.some((outfit) => outfit.id === activeOutfit.id)),
    [activeOutfit, savedOutfits]
  );

  const visibleSavedOutfits = useMemo(
    () => savedOutfits.filter((outfit) => outfit.source !== 'inspiration'),
    [savedOutfits]
  );

  useEffect(() => {
    setCollapsedCategories((current) => {
      const next: Record<string, boolean> = {};
      groupedCategories.forEach((category) => {
        next[category.label] = current[category.label] ?? false;
      });
      return next;
    });
  }, [groupedCategories]);

  useEffect(() => {
    setSelectedWardrobeItemIds((current) => {
      const availableIds = new Set(items.map((item) => item.id));
      return current.filter((id) => availableIds.has(id));
    });
  }, [items]);

  useEffect(() => {
    setSelectedLookId((current) => {
      if (visibleOutfitCombos.length === 0) {
        return null;
      }

      if (current && visibleOutfitCombos.some((combo) => combo.id === current)) {
        return current;
      }

      return visibleOutfitCombos[0].id;
    });
  }, [visibleOutfitCombos]);

  useEffect(() => {
    setSelectedTryOnRenderId((current) => {
      if (tryOnRenders.length === 0) {
        return null;
      }

      if (current && tryOnRenders.some((render) => render.id === current)) {
        return current;
      }

      return tryOnRenders[0].id;
    });
  }, [tryOnRenders]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const shot = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: true,
      });

      if (!shot?.uri) {
        throw new Error('No image URI returned from camera.');
      }

      const savedItem = await createWardrobeItemFromSourceUri(shot.uri);
      commitItems((current) => [savedItem, ...current]);
      setActiveTab('wardrobe');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save photo.');
    } finally {
      setIsSaving(false);
    }
  }, [commitItems, isSaving]);

  const handleAddFromPhotos = useCallback(async () => {
    if (isImporting) {
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        throw new Error('Media library permission is required to import photos.');
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.9,
      });

      if (picked.canceled || picked.assets.length === 0) {
        return;
      }

      const importedItems: WardrobeItem[] = [];

      for (const asset of picked.assets) {
        if (!asset.uri) {
          continue;
        }
        const importedItem = await createWardrobeItemFromSourceUri(asset.uri);
        importedItems.push(importedItem);
      }

      if (importedItems.length > 0) {
        commitItems((current) => [...importedItems, ...current]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to import photos.');
    } finally {
      setIsImporting(false);
    }
  }, [commitItems, isImporting]);

  const toggleCategoryCollapsed = useCallback((label: string) => {
    setCollapsedCategories((current) => ({
      ...current,
      [label]: !current[label],
    }));
  }, []);

  const toggleWardrobeItemSelection = useCallback((itemId: string) => {
    setSelectedWardrobeItemIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
    );
  }, []);

  const handleCreateOutfitFromSelection = useCallback(() => {
    if (selectedWardrobeItems.length === 0) {
      setErrorMessage('Select at least one wardrobe item to build an outfit.');
      return;
    }

    const manualOutfit = createManualOutfitRecord(selectedWardrobeItems);
    setActiveOutfit(manualOutfit);
    setActiveTab('outfit');
    setErrorMessage(null);
  }, [selectedWardrobeItems]);

  const importInspirationFromSource = useCallback(
    async (sourceUri: string) => {
      const imported = await createInspirationOutfitFromSourceUri(sourceUri);
      commitSavedOutfits((current) => {
        const withoutDuplicate = current.filter((outfit) => outfit.id !== imported.id);
        return [imported, ...withoutDuplicate];
      });
      setActiveOutfit(imported);
      setActiveTab('outfit');
      setTryOnStatusMessage('Inspiration imported. Add/select your photo and create a render.');
      return imported;
    },
    [commitSavedOutfits]
  );

  useEffect(() => {
    if (isBootstrapping) {
      return;
    }

    if (!incomingSharedPayload) {
      return;
    }

    const fingerprint = sharePayloadFingerprint(incomingSharedPayload);
    if (fingerprint && lastHandledShareFingerprintRef.current === fingerprint) {
      return;
    }

    if (fingerprint) {
      lastHandledShareFingerprintRef.current = fingerprint;
    }

    const fileUri = sharePayloadFileUri(incomingSharedPayload);
    if (!fileUri || !isImageSharePayload(incomingSharedPayload)) {
      setErrorMessage('Shared content is not an image. Share a screenshot or photo.');
      Alert.alert('Unsupported share', 'Only image shares are supported right now.');
      clearIncomingShare();
      return;
    }

    let cancelled = false;
    setErrorMessage(null);

    void (async () => {
      try {
        await importInspirationFromSource(fileUri);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Unable to import shared inspiration image.';
          setErrorMessage(message);
          Alert.alert('Share import failed', message);
        }
      } finally {
        clearIncomingShare();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearIncomingShare, importInspirationFromSource, incomingSharedPayload, isBootstrapping]);

  const handleGenerateCombos = useCallback(() => {
    if (isGeneratingCombos) {
      return;
    }

    const preset = WEATHER_PRESETS[weatherProfile];

    setIsGeneratingCombos(true);
    setErrorMessage(null);

    try {
      const result = generateWinterOutfitCombos(items, 20, {
        targetInsulation: preset.targetInsulation,
      });
      setOutfitResult(result);
      setOutfitCombos(result.combos);

      if (result.combos.length === 0) {
        if (result.missingRequired.length > 0) {
          setErrorMessage(
            `Need classified ${result.missingRequired.join(', ')} to build outfits.`
          );
        } else {
          setErrorMessage('No sensible combos generated yet. Classify more items first.');
        }
      }
    } finally {
      setIsGeneratingCombos(false);
    }
  }, [isGeneratingCombos, items, weatherProfile]);

  const toggleLookLiked = useCallback((lookId: string) => {
    setLikedLookIds((current) => {
      const next = current.includes(lookId)
        ? current.filter((id) => id !== lookId)
        : [...current, lookId];
      persistLookbookPrefs({ likedLookIds: next });
      return next;
    });
  }, []);

  const handleSetRenderFeedback = useCallback(
    (renderId: string, feedback: RenderFeedback) => {
      commitTryOnRenders((current) =>
        current.map((render) => {
          if (render.id !== renderId) {
            return render;
          }
          const nextFeedback = render.feedback === feedback ? null : feedback;
          return {
            ...render,
            feedback: nextFeedback,
            feedbackAt: nextFeedback ? Date.now() : null,
          };
        })
      );
    },
    [commitTryOnRenders]
  );

  const openImageViewer = useCallback((uri: string) => {
    setImageViewerSession((current) => current + 1);
    setImageViewerUri(uri);
  }, []);

  const openLookFromTryOn = useCallback(
    (record: TryOnRenderRecord) => {
      const fallbackName = record.outfitName || `Rendered outfit ${new Date(record.createdAt).toLocaleDateString()}`;
      const recovered: OutfitRecord = {
        id: record.outfitId || `render-${record.id}`,
        createdAt: record.createdAt,
        name: fallbackName,
        source: record.outfitSource || 'tryon',
        lookId: record.lookId,
        lookScore: record.lookScore,
        lookInsulationIndex: record.lookInsulationIndex,
        lookInsulationDelta: record.lookInsulationDelta,
        lookReasons: record.lookReasons,
        lookParts: resolveLookPartSnapshots(record.lookParts, items),
      };

      setActiveOutfit(recovered);
      setActiveTab('outfit');
      setErrorMessage(null);
    },
    [items]
  );

  const attachSubjectPhotoFromSource = useCallback(async (sourceUri: string) => {
    const subjectUri = await createTryOnSubjectFromSourceUri(sourceUri);
    setSubjectPhotoUris((current) => [subjectUri, ...current]);
    setSelectedSubjectPhotoUri(subjectUri);
  }, []);

  const handleAddSubjectFromPhotos = useCallback(async () => {
    if (isPreparingSubjectPhoto) {
      return;
    }

    setIsPreparingSubjectPhoto(true);
    setErrorMessage(null);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        throw new Error('Media library permission is required to add your photo for try-on.');
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.95,
      });

      if (picked.canceled || picked.assets.length === 0 || !picked.assets[0]?.uri) {
        return;
      }

      await attachSubjectPhotoFromSource(picked.assets[0].uri);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add subject photo.');
    } finally {
      setIsPreparingSubjectPhoto(false);
    }
  }, [attachSubjectPhotoFromSource, isPreparingSubjectPhoto]);

  const handleTakeSubjectPhoto = useCallback(async () => {
    if (isPreparingSubjectPhoto) {
      return;
    }

    setIsPreparingSubjectPhoto(true);
    setErrorMessage(null);

    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (!cameraPermission.granted) {
        throw new Error('Camera permission is required to capture your try-on photo.');
      }

      const captured = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.95,
        cameraType: ImagePicker.CameraType.front,
      });

      if (captured.canceled || captured.assets.length === 0 || !captured.assets[0]?.uri) {
        return;
      }

      await attachSubjectPhotoFromSource(captured.assets[0].uri);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to capture subject photo.');
    } finally {
      setIsPreparingSubjectPhoto(false);
    }
  }, [attachSubjectPhotoFromSource, isPreparingSubjectPhoto]);

  const runTryOnForOutfit = useCallback(
    async (outfit: OutfitRecord) => {
      if (isRunningTryOn) {
        return;
      }

      if (!selectedSubjectPhotoUri) {
        setTryOnStatusMessage(null);
        setErrorMessage('Select or add a photo of yourself first.');
        return;
      }

      const resolvedParts = resolveLookPartSnapshots(outfit.lookParts, items);
      if (resolvedParts.length === 0) {
        setTryOnStatusMessage(null);
        setErrorMessage('This outfit has no usable items to render.');
        return;
      }

      setIsRunningTryOn(true);
      setErrorMessage(null);
      setTryOnStatusMessage('Preparing try-on request...');

      try {
        const renderedBase64 = await generateTryOnImage({
          personImageUri: selectedSubjectPhotoUri,
          outfitImageUris: resolvedParts.map((part) => part.uri),
          outfitDescription: buildOutfitDescriptor(resolvedParts),
          onStatus: (message) => setTryOnStatusMessage(message),
        });

        const saved = await saveTryOnRenderFromBase64(renderedBase64);
        const record: TryOnRenderRecord = {
          id: saved.id,
          uri: saved.uri,
          createdAt: saved.createdAt,
          outfitId: outfit.id,
          outfitName: outfit.name,
          outfitSource: outfit.source,
          lookId: outfit.lookId,
          lookScore: outfit.lookScore,
          lookInsulationIndex: outfit.lookInsulationIndex,
          lookInsulationDelta: outfit.lookInsulationDelta,
          lookReasons: outfit.lookReasons,
          lookParts: resolvedParts,
          feedback: null,
          feedbackAt: null,
        };

        commitTryOnRenders((current) => [record, ...current]);
        setSelectedTryOnRenderId(record.id);
        setTryOnStatusMessage('Try-on render completed.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Try-on generation failed.';
        setErrorMessage(message);
        setTryOnStatusMessage('Try-on failed. See error details.');
        Alert.alert('Try-on failed', message);
      } finally {
        setIsRunningTryOn(false);
      }
    },
    [commitTryOnRenders, isRunningTryOn, items, selectedSubjectPhotoUri]
  );

  const handleRunTryOn = useCallback(() => {
    if (!selectedLook) {
      setTryOnStatusMessage(null);
      setErrorMessage('Generate and select a look first.');
      return;
    }

    const lookOutfit = createOutfitRecordFromLook(selectedLook, {
      id: `lookbook-${selectedLook.id}`,
      name: `Look ${selectedLookIndex >= 0 ? selectedLookIndex + 1 : 1}`,
      source: 'lookbook',
    });
    void runTryOnForOutfit(lookOutfit);
  }, [runTryOnForOutfit, selectedLook, selectedLookIndex]);

  const handleRunTryOnFromActiveOutfit = useCallback(() => {
    if (!resolvedActiveOutfit) {
      setTryOnStatusMessage(null);
      setErrorMessage('Select or build an outfit first.');
      return;
    }
    void runTryOnForOutfit(resolvedActiveOutfit);
  }, [resolvedActiveOutfit, runTryOnForOutfit]);

  const handleSaveActiveOutfit = useCallback(() => {
    if (!resolvedActiveOutfit) {
      setErrorMessage('No outfit selected to save.');
      return;
    }
    if (isActiveOutfitSaved) {
      return;
    }

    commitSavedOutfits((current) => {
      const withoutExisting = current.filter((outfit) => outfit.id !== resolvedActiveOutfit.id);
      return [resolvedActiveOutfit, ...withoutExisting];
    });
    setActiveOutfit(resolvedActiveOutfit);
    setErrorMessage(null);
  }, [commitSavedOutfits, isActiveOutfitSaved, resolvedActiveOutfit]);

  const performDeleteItem = useCallback(
    async (item: WardrobeItem) => {
      setDeletingItemIds((current) => ({ ...current, [item.id]: true }));
      setErrorMessage(null);

      try {
        const urisToDelete = [item.uri, item.originalLocalUri].filter(
          (uri): uri is string => typeof uri === 'string' && uri.length > 0
        );

        urisToDelete.forEach((uri) => {
          const file = new File(uri);
          if (file.exists) {
            file.delete();
          }
        });

        commitItems((current) => current.filter((entry) => entry.id !== item.id));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to delete item.');
      } finally {
        setDeletingItemIds((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }
    },
    [commitItems]
  );

  const handleDeleteItem = useCallback(
    (item: WardrobeItem) => {
      if (deletingItemIds[item.id]) {
        return;
      }

      Alert.alert(
        'Delete item?',
        'This will remove the image from your wardrobe and app storage.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              void performDeleteItem(item);
            },
          },
        ]
      );
    },
    [deletingItemIds, performDeleteItem]
  );

  const handleClassifyUnclassified = useCallback(async () => {
    if (isClassifying) {
      return;
    }

    const queue = items.filter((item) => item.classificationStatus !== 'classified');
    if (queue.length === 0) {
      return;
    }

    setErrorMessage(null);
    setIsClassifying(true);
    setAnalysisPaused(false);
    setClassificationProgress({ done: 0, total: queue.length });

    let nextIndex = 0;
    let doneCount = 0;
    let pausedForRateLimit = false;

    const worker = async () => {
      while (true) {
        if (pausedForRateLimit) {
          return;
        }

        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= queue.length) {
          return;
        }

        const target = queue[currentIndex];

        try {
          const classification = await classifyWardrobeImage(target.uri);

          commitItems((current) =>
            current.map((item) =>
              item.id === target.id
                ? {
                    ...item,
                    classificationStatus: 'classified',
                    classification,
                    classifiedAt: Date.now(),
                    classificationError: null,
                  }
                : item
            )
          );
        } catch (error) {
          if (isRateLimitError(error)) {
            if (!pausedForRateLimit) {
              pausedForRateLimit = true;
              setAnalysisPaused(true);
              setErrorMessage('Rate limit reached. Analysis paused. Tap Analyze again to resume.');
            }
          } else {
            const message =
              error instanceof Error ? error.message : `Classification failed for ${target.id}.`;

            commitItems((current) =>
              current.map((item) =>
                item.id === target.id
                  ? {
                      ...item,
                      classificationStatus: 'error',
                      classificationError: message,
                    }
                  : item
              )
            );
            setErrorMessage(message);
          }
        } finally {
          doneCount += 1;
          setClassificationProgress({ done: doneCount, total: queue.length });
        }
      }
    };

    const workerCount = Math.min(CLASSIFICATION_CONCURRENCY, queue.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    setIsClassifying(false);
    if (!pausedForRateLimit) {
      setAnalysisPaused(false);
    }
  }, [commitItems, isClassifying, items]);

  const wardrobeGridGap = 2;
  const wardrobeTileSize = useMemo(
    () => (viewportWidth - wardrobeGridGap * (wardrobeColumns + 1)) / wardrobeColumns,
    [viewportWidth, wardrobeColumns]
  );

  const allItemsFlat = useMemo(() => {
    const result: { type: 'header'; label: string; count: number }[] | { type: 'item'; item: WardrobeItem }[] = [];
    const mixed: ({ type: 'header'; label: string; count: number } | { type: 'item'; item: WardrobeItem })[] = [];
    groupedCategories.forEach((category) => {
      mixed.push({ type: 'header', label: category.label, count: category.items.length });
      category.items.forEach((item) => mixed.push({ type: 'item', item }));
    });
    return mixed;
  }, [groupedCategories]);

  const handleWardrobePinch = useCallback((scale: number) => {
    setWardrobeColumns((current) => {
      if (scale < 0.85 && current > 2) return current - 1;
      if (scale > 1.15 && current < 6) return current + 1;
      return current;
    });
  }, []);

  const pinchBaseRef = useRef<number | null>(null);
  const pinchColumnsRef = useRef(3);

  const handleWardrobeTouchStart = useCallback((e: { nativeEvent: { touches: { pageX: number; pageY: number }[] } }) => {
    if (e.nativeEvent.touches.length === 2) {
      const [t1, t2] = e.nativeEvent.touches;
      pinchBaseRef.current = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
      pinchColumnsRef.current = wardrobeColumns;
    }
  }, [wardrobeColumns]);

  const handleWardrobeTouchMove = useCallback((e: { nativeEvent: { touches: { pageX: number; pageY: number }[] } }) => {
    if (e.nativeEvent.touches.length === 2 && pinchBaseRef.current !== null) {
      const [t1, t2] = e.nativeEvent.touches;
      const dist = Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
      const scale = dist / pinchBaseRef.current;
      let next = pinchColumnsRef.current;
      if (scale > 1.35) next = Math.max(2, pinchColumnsRef.current - 1);
      else if (scale < 0.7) next = Math.min(6, pinchColumnsRef.current + 1);
      setWardrobeColumns(next);
    }
  }, []);

  const handleWardrobeTouchEnd = useCallback(() => {
    pinchBaseRef.current = null;
  }, []);

  const renderWardrobeDetailModal = () => {
    if (!wardrobeDetailItem) return null;
    const item = wardrobeDetailItem;
    const isSelectedForOutfit = selectedWardrobeItemSet.has(item.id);
    const isDeleting = Boolean(deletingItemIds[item.id]);

    return (
      <Modal visible animationType="slide" transparent={false}>
        <SafeAreaView style={styles.detailModalContainer}>
          <ScrollView contentContainerStyle={styles.detailModalScroll} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => openImageViewer(item.uri)}>
              <Image source={{ uri: item.uri }} style={styles.detailModalImage} resizeMode="contain" />
            </Pressable>

            <View style={styles.detailModalInfo}>
              <Text style={styles.detailModalTitle}>{primaryLabel(item)}</Text>

              {item.classification ? (
                <>
                  <View style={styles.detailModalRow}>
                    <Text style={styles.detailModalLabel}>Color</Text>
                    <View style={styles.detailModalColorRow}>
                      {item.classification.dominantColors.slice(0, 4).map((color, i) => (
                        <View key={i} style={styles.detailModalColorChip}>
                          <View style={[styles.detailModalColorDot, { backgroundColor: color.hex }]} />
                          <Text style={styles.detailModalColorName}>{color.name}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.detailModalRow}>
                    <Text style={styles.detailModalLabel}>Insulation</Text>
                    <Text style={styles.detailModalValue}>{insulationSummary(item)}</Text>
                  </View>

                  <View style={styles.detailModalRow}>
                    <Text style={styles.detailModalLabel}>Details</Text>
                    <Text style={styles.detailModalValue}>{featureSummary(item)}</Text>
                  </View>

                  <View style={styles.detailModalRow}>
                    <Text style={styles.detailModalLabel}>Material</Text>
                    <Text style={styles.detailModalValue}>{item.classification.material.join(', ') || 'Unknown'}</Text>
                  </View>

                  <View style={styles.detailModalRow}>
                    <Text style={styles.detailModalLabel}>Fit</Text>
                    <Text style={styles.detailModalValue}>{item.classification.fit || 'Unknown'}</Text>
                  </View>

                  {item.classification.tags.length > 0 ? (
                    <View style={styles.detailModalRow}>
                      <Text style={styles.detailModalLabel}>Tags</Text>
                      <Text style={styles.detailModalValue}>{item.classification.tags.join(', ')}</Text>
                    </View>
                  ) : null}

                  {DEVELOPER_MODE ? (
                    <>
                      <View style={styles.detailModalRow}>
                        <Text style={styles.detailModalLabel}>Confidence</Text>
                        <Text style={styles.detailModalValue}>{Math.round(item.classification.confidence * 100)}%</Text>
                      </View>
                      <View style={styles.detailModalRow}>
                        <Text style={styles.detailModalLabel}>Ref</Text>
                        <Text style={styles.detailModalValue}>{referenceSummary(item)}</Text>
                      </View>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={styles.detailModalHint}>
                  {item.classificationStatus === 'error'
                    ? `Classification failed: ${item.classificationError ?? 'Unknown error'}`
                    : 'Not analyzed yet. Classification will detect color, material, fit, and more.'}
                </Text>
              )}
            </View>

            <View style={styles.detailModalActions}>
              <Pressable
                style={[
                  styles.detailModalSelectButton,
                  isSelectedForOutfit ? styles.detailModalSelectButtonActive : null,
                ]}
                onPress={() => toggleWardrobeItemSelection(item.id)}
              >
                <Text
                  style={[
                    styles.detailModalSelectButtonText,
                    isSelectedForOutfit ? styles.detailModalSelectButtonTextActive : null,
                  ]}
                >
                  {isSelectedForOutfit ? 'Remove from Outfit' : 'Select for Outfit'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.detailModalDeleteButton, isDeleting ? styles.detailModalDeleteButtonDisabled : null]}
                onPress={() => {
                  handleDeleteItem(item);
                  setWardrobeDetailItem(null);
                }}
                disabled={isDeleting}
              >
                <Text style={styles.detailModalDeleteButtonText}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>

          <Pressable style={styles.detailModalCloseButton} onPress={() => setWardrobeDetailItem(null)}>
            <Text style={styles.detailModalCloseButtonText}>Close</Text>
          </Pressable>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderLookbookPickerCard = (combo: OutfitCombo, index: number) => {
    const previewParts = lookPartsInDisplayOrder(combo).slice(0, 4);
    const isSelected = selectedLook?.id === combo.id;
    const isLiked = likedLookIds.includes(combo.id);

    return (
      <Pressable
        key={combo.id}
        style={[styles.lookPickerCard, isSelected ? styles.lookPickerCardActive : null]}
        onPress={() => setSelectedLookId(combo.id)}
      >
        <View style={styles.lookPickerPreviewGrid}>
          {previewParts.map((part) => (
            <Pressable key={`${combo.id}-${part.id}`} onPress={() => openImageViewer(part.uri)}>
              <Image source={{ uri: part.uri }} style={styles.lookPickerPreviewImage} />
            </Pressable>
          ))}
          {Array.from({ length: Math.max(0, 4 - previewParts.length) }).map((_, fillIndex) => (
            <View key={`${combo.id}-fill-${fillIndex}`} style={styles.lookPickerPreviewPlaceholder} />
          ))}
        </View>
        <View style={styles.lookPickerMetaRow}>
          <Text style={styles.lookPickerMetaTitle}>Look {index + 1}</Text>
          {isLiked || DEVELOPER_MODE ? (
            <View style={styles.lookPickerMetaRight}>
              {isLiked ? <Text style={styles.lookPickerLiked}>♥</Text> : null}
              {DEVELOPER_MODE ? <Text style={styles.lookPickerMetaScore}>{combo.score}</Text> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderCameraArea = () => {
    if (!permission) {
      return (
        <View style={styles.centeredPanel}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.centeredPanel}>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>
              Enable camera permission so each tap captures and stores directly in your wardrobe.
            </Text>
            <Pressable style={styles.permissionButton} onPress={requestPermission}>
              <Text style={styles.permissionButtonText}>Allow Camera</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <>
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} mode="picture" />
          <View style={styles.overlayTop}>
            <Pressable style={styles.cameraBackButton} onPress={() => setActiveTab('wardrobe')}>
              <Text style={styles.cameraBackButtonText}>Back</Text>
            </Pressable>
            <Text style={styles.overlayText}>{items.length} in wardrobe</Text>
          </View>
          <View style={styles.overlayBottom}>
            <Pressable
              style={[styles.shutterOuter, isSaving ? styles.shutterOuterDisabled : null]}
              onPress={handleCapture}
              disabled={isSaving}
            >
              <View style={styles.shutterInner}>
                {isSaving ? <ActivityIndicator color="#0f172a" /> : null}
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.galleryContainer}>
          <FlatList
            data={items.slice(0, 12)}
            horizontal
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.galleryContent}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable onPress={() => openImageViewer(item.uri)}>
                <Image source={{ uri: item.uri }} style={styles.thumbnail} />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>Take a photo and it saves instantly.</Text>
              </View>
            }
          />
        </View>
      </>
    );
  };

  const renderWardrobeArea = () => (
    <View style={styles.wardrobeContainer}>
      {renderWardrobeDetailModal()}

      {/* Floating header bar */}
      <View style={styles.gridHeaderBar}>
        <View style={styles.gridHeaderLeft}>
          <Text style={styles.gridHeaderTitle}>{items.length} pieces</Text>
          {selectedWardrobeItems.length > 0 ? (
            <Text style={styles.gridHeaderSelection}>{selectedWardrobeItems.length} selected</Text>
          ) : null}
        </View>
        <View style={styles.gridHeaderRight}>
          <Pressable style={styles.gridHeaderButton} onPress={() => setShowAddMenu((v) => !v)}>
            <Text style={styles.gridHeaderButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Add menu dropdown */}
      {showAddMenu ? (
        <View style={styles.addMenuDropdown}>
          <Pressable
            style={styles.addMenuOption}
            onPress={() => {
              setShowAddMenu(false);
              setActiveTab('camera');
            }}
          >
            <Text style={styles.addMenuOptionText}>Take Photo</Text>
          </Pressable>
          <Pressable
            style={[styles.addMenuOption, isImporting ? styles.addMenuOptionDisabled : null]}
            onPress={() => {
              setShowAddMenu(false);
              handleAddFromPhotos();
            }}
            disabled={isImporting}
          >
            <Text style={styles.addMenuOptionText}>{isImporting ? 'Importing...' : 'Choose from Library'}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Zoom hint */}
      <View style={styles.zoomHintRow}>
        <Pressable
          style={styles.zoomButton}
          onPress={() => setWardrobeColumns((c) => Math.max(2, c - 1))}
        >
          <Text style={styles.zoomButtonText}>+</Text>
        </Pressable>
        <Text style={styles.zoomHintText}>{wardrobeColumns} columns</Text>
        <Pressable
          style={styles.zoomButton}
          onPress={() => setWardrobeColumns((c) => Math.min(6, c + 1))}
        >
          <Text style={styles.zoomButtonText}>-</Text>
        </Pressable>
      </View>

      {DEVELOPER_MODE ? (
        <Pressable
          style={[
            styles.classifyButton,
            pendingCount === 0 || isClassifying ? styles.classifyButtonDisabled : null,
          ]}
          onPress={handleClassifyUnclassified}
          disabled={pendingCount === 0 || isClassifying}
        >
          <Text style={styles.classifyButtonText}>
            {isClassifying
              ? `Analyzing ${classificationProgress.done}/${classificationProgress.total}`
              : pendingCount > 0
                ? analysisPaused
                  ? `Resume Analyze ${pendingCount} Pending`
                  : `Analyze ${pendingCount} Unclassified`
                : 'All Items Classified'}
          </Text>
        </Pressable>
      ) : null}

      {/* Photo grid */}
      <ScrollView
        contentContainerStyle={styles.gridScrollContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setShowAddMenu(false)}
        onTouchStart={handleWardrobeTouchStart as any}
        onTouchMove={handleWardrobeTouchMove as any}
        onTouchEnd={handleWardrobeTouchEnd as any}
      >
        {items.length === 0 ? (
          <View style={styles.emptyWardrobe}>
            <Text style={styles.emptyWardrobeTitle}>Your wardrobe is empty</Text>
            <Text style={styles.emptyWardrobeText}>
              Take a photo or import from your camera roll to get started.
            </Text>
          </View>
        ) : (
          <>
            {groupedCategories.map((category) => (
              <View key={category.label}>
                <View style={styles.gridCategoryHeader}>
                  <Text style={styles.gridCategoryTitle}>{category.label}</Text>
                  <Text style={styles.gridCategoryCount}>{category.items.length}</Text>
                </View>
                <View style={[styles.gridRow, { gap: wardrobeGridGap }]}>
                  {category.items.map((item) => {
                    const isSelected = selectedWardrobeItemSet.has(item.id);
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setWardrobeDetailItem(item)}
                        onLongPress={() => toggleWardrobeItemSelection(item.id)}
                        style={[
                          styles.gridTile,
                          {
                            width: wardrobeTileSize,
                            height: wardrobeTileSize,
                            marginBottom: wardrobeGridGap,
                          },
                        ]}
                      >
                        <Image source={{ uri: item.uri }} style={styles.gridTileImage} />
                        {isSelected ? (
                          <View style={styles.gridTileSelectedOverlay}>
                            <View style={styles.gridTileCheckmark}>
                              <Text style={styles.gridTileCheckmarkText}>✓</Text>
                            </View>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Floating outfit bar */}
      {selectedWardrobeItems.length > 0 ? (
        <View style={styles.floatingOutfitBar}>
          <View style={styles.floatingOutfitChips}>
            <View style={[styles.floatingOutfitChip, selectedRoleCoverage.top ? styles.floatingOutfitChipDone : null]}>
              <Text style={[styles.floatingOutfitChipText, selectedRoleCoverage.top ? styles.floatingOutfitChipTextDone : null]}>
                Top {selectedRoleCoverage.top ? '✓' : ''}
              </Text>
            </View>
            <View style={[styles.floatingOutfitChip, selectedRoleCoverage.pants ? styles.floatingOutfitChipDone : null]}>
              <Text style={[styles.floatingOutfitChipText, selectedRoleCoverage.pants ? styles.floatingOutfitChipTextDone : null]}>
                Pants {selectedRoleCoverage.pants ? '✓' : ''}
              </Text>
            </View>
            <View style={[styles.floatingOutfitChip, selectedRoleCoverage.shoes ? styles.floatingOutfitChipDone : null]}>
              <Text style={[styles.floatingOutfitChipText, selectedRoleCoverage.shoes ? styles.floatingOutfitChipTextDone : null]}>
                Shoes {selectedRoleCoverage.shoes ? '✓' : ''}
              </Text>
            </View>
          </View>
          <View style={styles.floatingOutfitActions}>
            <Pressable style={styles.floatingOutfitClearButton} onPress={() => setSelectedWardrobeItemIds([])}>
              <Text style={styles.floatingOutfitClearText}>Clear</Text>
            </Pressable>
            <Pressable
              style={styles.floatingOutfitGoButton}
              onPress={handleCreateOutfitFromSelection}
            >
              <Text style={styles.floatingOutfitGoText}>
                Preview ({selectedWardrobeItems.length})
              </Text>
            </Pressable>
            {resolvedActiveOutfit ? (
              <Pressable style={styles.floatingOutfitStudioButton} onPress={() => setActiveTab('outfit')}>
                <Text style={styles.floatingOutfitStudioText}>Try-On</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderOutfitArea = () => (
    <View style={styles.outfitScreenContainer}>
      <View style={styles.outfitScreenHeaderRow}>
        <View style={styles.outfitScreenHeader}>
          <Text style={styles.outfitScreenTitle}>Try-On Studio</Text>
          <Text style={styles.outfitScreenBody}>
            Pick your selfie and render your selected wardrobe outfit.
          </Text>
        </View>
        <View style={styles.outfitHeaderActions}>
          <Pressable style={styles.outfitBackButton} onPress={() => setActiveTab('wardrobe')}>
            <Text style={styles.outfitBackButtonText}>Wardrobe</Text>
          </Pressable>
        </View>
      </View>

      {visibleSavedOutfits.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.savedOutfitRow}
        >
          {visibleSavedOutfits.map((outfit) => {
            const active = resolvedActiveOutfit?.id === outfit.id;
            return (
              <Pressable
                key={outfit.id}
                style={[styles.savedOutfitChip, active ? styles.savedOutfitChipActive : null]}
                onPress={() => setActiveOutfit(outfit)}
              >
                <Text style={[styles.savedOutfitChipText, active ? styles.savedOutfitChipTextActive : null]}>
                  {outfit.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {resolvedActiveOutfit ? (
        <ScrollView contentContainerStyle={styles.outfitScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.outfitCard}>
            <Text style={styles.outfitCardTitle}>{resolvedActiveOutfit.name}</Text>
            <Text style={styles.outfitCardMeta}>
              {resolvedActiveOutfit.lookParts.length} items • source {resolvedActiveOutfit.source}
            </Text>
            <View style={styles.outfitCardActions}>
              <Pressable
                style={[styles.saveOutfitButton, isActiveOutfitSaved ? styles.saveOutfitButtonDisabled : null]}
                onPress={handleSaveActiveOutfit}
                disabled={isActiveOutfitSaved}
              >
                <Text style={styles.saveOutfitButtonText}>{isActiveOutfitSaved ? 'Saved' : 'Save Outfit'}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.outfitTryOnButton,
                  !selectedSubjectPhotoUri || isRunningTryOn ? styles.outfitTryOnButtonDisabled : null,
                ]}
                onPress={handleRunTryOnFromActiveOutfit}
                disabled={!selectedSubjectPhotoUri || isRunningTryOn}
              >
                <Text style={styles.outfitTryOnButtonText}>
                  {isRunningTryOn ? 'Rendering...' : 'Create Render'}
                </Text>
              </Pressable>
            </View>
            {tryOnStatusMessage ? <Text style={styles.tryOnStatusText}>{tryOnStatusMessage}</Text> : null}
          </View>

          {activeOutfitLatestRender ? (
            <View style={styles.latestRenderCard}>
              <View style={styles.latestRenderHeader}>
                <Text style={styles.latestRenderTitle}>Latest render</Text>
                <Pressable style={styles.tryOnResultOpenButton} onPress={() => setActiveTab('tryons')}>
                  <Text style={styles.tryOnResultOpenButtonText}>History</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => openImageViewer(activeOutfitLatestRender.uri)}>
                <Image source={{ uri: activeOutfitLatestRender.uri }} style={styles.tryOnResultImage} />
              </Pressable>
              <View style={styles.renderFeedbackRow}>
                <Pressable
                  style={[
                    styles.renderFeedbackButton,
                    activeOutfitLatestRender.feedback === 'yay' ? styles.renderFeedbackButtonYayActive : null,
                  ]}
                  onPress={() => handleSetRenderFeedback(activeOutfitLatestRender.id, 'yay')}
                >
                  <Text
                    style={[
                      styles.renderFeedbackButtonText,
                      activeOutfitLatestRender.feedback === 'yay' ? styles.renderFeedbackButtonTextActive : null,
                    ]}
                  >
                    Yay
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.renderFeedbackButton,
                    activeOutfitLatestRender.feedback === 'nay' ? styles.renderFeedbackButtonNayActive : null,
                  ]}
                  onPress={() => handleSetRenderFeedback(activeOutfitLatestRender.id, 'nay')}
                >
                  <Text
                    style={[
                      styles.renderFeedbackButtonText,
                      activeOutfitLatestRender.feedback === 'nay' ? styles.renderFeedbackButtonTextActive : null,
                    ]}
                  >
                    Nay
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.renderFeedbackHint}>Rate renders so the app learns which pieces work together.</Text>
            </View>
          ) : null}

          <View style={styles.outfitSubjectCard}>
            <Text style={styles.outfitSubjectTitle}>Subject photo</Text>
            <View style={styles.tryOnActionsRow}>
              <Pressable
                style={[styles.tryOnActionButton, isPreparingSubjectPhoto ? styles.tryOnActionButtonDisabled : null]}
                onPress={handleAddSubjectFromPhotos}
                disabled={isPreparingSubjectPhoto}
              >
                <Text style={styles.tryOnActionButtonText}>Add From Photos</Text>
              </Pressable>
              <Pressable
                style={[styles.tryOnActionButton, isPreparingSubjectPhoto ? styles.tryOnActionButtonDisabled : null]}
                onPress={handleTakeSubjectPhoto}
                disabled={isPreparingSubjectPhoto}
              >
                <Text style={styles.tryOnActionButtonText}>Take Photo</Text>
              </Pressable>
            </View>

            {subjectPhotoUris.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.subjectPickerRow}
              >
                {subjectPhotoUris.map((uri) => {
                  const isSelected = uri === selectedSubjectPhotoUri;
                  return (
                    <Pressable
                      key={uri}
                      style={[styles.subjectPickerItem, isSelected ? styles.subjectPickerItemActive : null]}
                      onPress={() => {
                        setSelectedSubjectPhotoUri(uri);
                        openImageViewer(uri);
                      }}
                    >
                      <Image source={{ uri }} style={styles.subjectPickerImage} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.tryOnHint}>Add at least one self photo to enable rendering.</Text>
            )}
          </View>

          <View style={styles.outfitPartsGrid}>
            {resolvedActiveOutfit.lookParts.map((part) => (
              <View key={`${resolvedActiveOutfit.id}-${part.externalKey}-${part.role}`} style={styles.outfitPartCard}>
                <Pressable onPress={() => openImageViewer(part.uri)}>
                  <Image source={{ uri: part.uri }} style={styles.outfitPartImage} />
                </Pressable>
                <Text style={styles.outfitPartRole}>{roleLabel(part.role)}</Text>
                <Text style={styles.outfitPartLabel} numberOfLines={1}>
                  {part.label}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.emptyLookbook}>
          <Text style={styles.emptyLookbookTitle}>No outfit selected</Text>
          <Text style={styles.emptyLookbookBody}>
            In Wardrobe, select items and tap Preview Outfit to open a custom outfit here.
          </Text>
        </View>
      )}
    </View>
  );

  const renderLookbookArea = () => (
    <View style={styles.lookbookContainer}>
      <View style={styles.lookbookHeaderRow}>
        <View style={styles.lookbookHeader}>
          <Text style={styles.lookbookHeaderTitle}>Combine</Text>
          <Text style={styles.lookbookHeaderBody}>
            Auto-generated outfit combinations from your wardrobe.
          </Text>
        </View>
        <Pressable
          style={[
            styles.combinatorButton,
            styles.lookbookGenerateButton,
            isGeneratingCombos ? styles.combinatorButtonDisabled : null,
          ]}
          onPress={handleGenerateCombos}
          disabled={isGeneratingCombos}
        >
          <Text style={styles.lookbookGenerateButtonText}>
            {isGeneratingCombos ? 'Generating...' : 'Refresh Looks'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.weatherModeRow}>
        {(['warm', 'mild', 'cold'] as const).map((profile) => {
          const preset = WEATHER_PRESETS[profile];
          const isActive = weatherProfile === profile;
          return (
            <Pressable
              key={profile}
              style={[styles.weatherModeButton, isActive ? styles.weatherModeButtonActive : null]}
              onPress={() => setWeatherProfile(profile)}
            >
              <Text style={[styles.weatherModeTitle, isActive ? styles.weatherModeTitleActive : null]}>
                {preset.label}
              </Text>
              <Text style={[styles.weatherModeSubtitle, isActive ? styles.weatherModeSubtitleActive : null]}>
                {preset.subtitle}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {DEVELOPER_MODE ? (
        <>
          <Text style={styles.weatherTargetText}>
            Target insulation: {WEATHER_PRESETS[weatherProfile].targetInsulation}/100
          </Text>

          {outfitResult ? (
            <Text style={styles.combinatorMeta}>
              Mode {WEATHER_PRESETS[weatherProfile].label} • target {outfitResult.targetInsulation}/100 •
              {' '}
              Inventory: shoes {outfitResult.inventory.shoes}, pants {outfitResult.inventory.pants},
              tops {outfitResult.inventory.top}, belts {outfitResult.inventory.belt}, sweaters{' '}
              {outfitResult.inventory.sweater}, jackets {outfitResult.inventory.jacket}
            </Text>
          ) : (
            <Text style={styles.combinatorMeta}>Generate once to build a visual lookbook from your wardrobe.</Text>
          )}

          {outfitResult?.missingRequired.length ? (
            <Text style={styles.combinatorWarning}>
              Missing required categories: {outfitResult.missingRequired.join(', ')}.
            </Text>
          ) : null}

          {outfitResult?.notes.map((note) => (
            <Text key={note} style={styles.combinatorNote}>
              {note}
            </Text>
          ))}
        </>
      ) : null}

      {visibleOutfitCombos.length > 0 ? (
        <ScrollView contentContainerStyle={styles.lookbookScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.lookPickerSection}>
            <Text style={styles.lookPickerSectionTitle}>Tap a look</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.lookPickerRow}
            >
              {visibleOutfitCombos.map((combo, index) => renderLookbookPickerCard(combo, index))}
            </ScrollView>
          </View>

          {selectedLook ? (
            <View style={styles.selectedLookSection}>
              <View style={styles.selectedLookGrid}>
                {lookPartsInDisplayOrder(selectedLook).map((item) => (
                  <View key={`selected-grid-${item.id}`} style={styles.selectedLookGridCell}>
                    <Pressable onPress={() => openImageViewer(item.uri)}>
                      <Image source={{ uri: item.uri }} style={styles.selectedLookGridImage} />
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.selectedLookDescriptorCard}>
                <View style={styles.selectedLookHeaderRow}>
                  <Text style={styles.selectedLookDescriptorTitle}>
                    Look {selectedLookIndex >= 0 ? selectedLookIndex + 1 : 1} details
                  </Text>
                  <Pressable
                    style={[
                      styles.likeLookButton,
                      likedLookIds.includes(selectedLook.id) ? styles.likeLookButtonActive : null,
                    ]}
                    onPress={() => toggleLookLiked(selectedLook.id)}
                  >
                    <Text
                      style={[
                        styles.likeLookButtonText,
                        likedLookIds.includes(selectedLook.id) ? styles.likeLookButtonTextActive : null,
                      ]}
                    >
                      {likedLookIds.includes(selectedLook.id) ? 'Liked ♥' : 'Like ♡'}
                    </Text>
                  </Pressable>
                </View>
                {DEVELOPER_MODE ? (
                  <Text style={styles.selectedLookDescriptorLine}>
                    Insulation {selectedLook.insulationIndex}/100
                    {selectedLook.insulationDelta === 0
                      ? ' (on target)'
                      : selectedLook.insulationDelta > 0
                        ? ` (+${selectedLook.insulationDelta} above target)`
                        : ` (${selectedLook.insulationDelta} below target)`}
                  </Text>
                ) : null}
                <Text style={styles.selectedLookDescriptorLine}>
                  Top: {itemNameForOutfit(selectedLook.parts.top)}
                </Text>
                <Text style={styles.selectedLookDescriptorLine}>
                  Pants: {itemNameForOutfit(selectedLook.parts.pants)}
                </Text>
                <Text style={styles.selectedLookDescriptorLine}>
                  Shoes: {itemNameForOutfit(selectedLook.parts.shoes)}
                </Text>
                <Text style={styles.selectedLookDescriptorLine}>
                  Layer:{' '}
                  {selectedLook.parts.jacket
                    ? itemNameForOutfit(selectedLook.parts.jacket)
                    : selectedLook.parts.sweater
                      ? itemNameForOutfit(selectedLook.parts.sweater)
                      : 'none'}
                </Text>
                <Text style={styles.selectedLookDescriptorLine}>
                  Belt: {selectedLook.parts.belt ? itemNameForOutfit(selectedLook.parts.belt) : 'optional'}
                </Text>
                {DEVELOPER_MODE ? (
                  <Text style={styles.lookbookReason}>{selectedLook.reasons.join(' • ')}</Text>
                ) : null}

                <View style={styles.selectedLookMiniThumbRow}>
                  {lookPartsInDisplayOrder(selectedLook).map((item) => (
                    <View key={`selected-mini-${item.id}`} style={styles.selectedLookMiniThumb}>
                      <Pressable onPress={() => openImageViewer(item.uri)}>
                        <Image source={{ uri: item.uri }} style={styles.selectedLookMiniThumbImage} />
                      </Pressable>
                    </View>
                  ))}
                </View>

                <View style={styles.tryOnPanel}>
                  <Text style={styles.tryOnTitle}>Virtual Try-On</Text>
                  <Text style={styles.tryOnBody}>
                    Pick a reference photo of yourself, then render this look.
                  </Text>

                  <View style={styles.tryOnActionsRow}>
                    <Pressable
                      style={[
                        styles.tryOnActionButton,
                        isPreparingSubjectPhoto ? styles.tryOnActionButtonDisabled : null,
                      ]}
                      onPress={handleAddSubjectFromPhotos}
                      disabled={isPreparingSubjectPhoto}
                    >
                      <Text style={styles.tryOnActionButtonText}>Add From Photos</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.tryOnActionButton,
                        isPreparingSubjectPhoto ? styles.tryOnActionButtonDisabled : null,
                      ]}
                      onPress={handleTakeSubjectPhoto}
                      disabled={isPreparingSubjectPhoto}
                    >
                      <Text style={styles.tryOnActionButtonText}>Take Photo</Text>
                    </Pressable>
                  </View>

                  {subjectPhotoUris.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.subjectPickerRow}
                    >
                      {subjectPhotoUris.map((uri) => {
                        const isSelected = uri === selectedSubjectPhotoUri;
                        return (
                          <Pressable
                            key={uri}
                            style={[
                              styles.subjectPickerItem,
                              isSelected ? styles.subjectPickerItemActive : null,
                            ]}
                            onPress={() => {
                              setSelectedSubjectPhotoUri(uri);
                              openImageViewer(uri);
                            }}
                          >
                            <Image source={{ uri }} style={styles.subjectPickerImage} />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <Text style={styles.tryOnHint}>Add at least one self photo to enable try-on.</Text>
                  )}

                  <Pressable
                    style={[
                      styles.tryOnRunButton,
                      !selectedSubjectPhotoUri || isRunningTryOn ? styles.tryOnRunButtonDisabled : null,
                    ]}
                    onPress={handleRunTryOn}
                    disabled={!selectedSubjectPhotoUri || isRunningTryOn}
                  >
                    <Text style={styles.tryOnRunButtonText}>
                      {isRunningTryOn ? 'Rendering Try-On...' : 'Try On This Look'}
                    </Text>
                  </Pressable>
                  {tryOnStatusMessage ? <Text style={styles.tryOnStatusText}>{tryOnStatusMessage}</Text> : null}

                  {selectedLookRenders[0] ? (
                    <View style={styles.tryOnResultCard}>
                      <View style={styles.tryOnResultHeader}>
                        <Text style={styles.tryOnResultTitle}>Latest render for this look</Text>
                        <Pressable style={styles.tryOnResultOpenButton} onPress={() => setActiveTab('tryons')}>
                          <Text style={styles.tryOnResultOpenButtonText}>All Try-Ons</Text>
                        </Pressable>
                      </View>
                      <Pressable onPress={() => openImageViewer(selectedLookRenders[0].uri)}>
                        <Image source={{ uri: selectedLookRenders[0].uri }} style={styles.tryOnResultImage} />
                      </Pressable>
                    </View>
                  ) : null}

                  {selectedLookRenders.length > 1 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.tryOnHistoryRow}
                    >
                      {selectedLookRenders.slice(1).map((render) => (
                        <Pressable key={render.id} onPress={() => openImageViewer(render.uri)}>
                          <Image source={{ uri: render.uri }} style={styles.tryOnHistoryThumb} />
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.emptyLookbook}>
          <Text style={styles.emptyLookbookTitle}>No looks yet</Text>
          <Text style={styles.emptyLookbookBody}>
            Tap Generate to create outfit combinations from your wardrobe.
          </Text>
          <Pressable
            style={[
              styles.combinatorButton,
              styles.lookbookGenerateButton,
              isGeneratingCombos ? styles.combinatorButtonDisabled : null,
              { marginTop: 16 },
            ]}
            onPress={handleGenerateCombos}
            disabled={isGeneratingCombos}
          >
            <Text style={styles.lookbookGenerateButtonText}>
              {isGeneratingCombos ? 'Generating...' : 'Generate Looks'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const renderTryOnsArea = () => (
    <View style={styles.tryOnsContainer}>
      <View style={styles.tryOnsHeaderRow}>
        <View style={styles.tryOnsHeader}>
          <Text style={styles.tryOnsHeaderTitle}>Try-Ons</Text>
          <Text style={styles.tryOnsHeaderBody}>
            {tryOnRenders.length} renders • {outfitGraph.ratedRenderCount} rated • newest first
          </Text>
        </View>
      </View>

      {tryOnRenders.length === 0 ? (
        <View style={styles.emptyLookbook}>
          <Text style={styles.emptyLookbookTitle}>No try-ons yet</Text>
          <Text style={styles.emptyLookbookBody}>
            Render from Lookbook or Outfit, then all results appear here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.tryOnsScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.tryOnsGrid}>
            {tryOnRenders.map((render) => {
              const isSelected = selectedTryOnRender?.id === render.id;
              return (
                <Pressable
                  key={render.id}
                  style={[styles.tryOnsGridCard, isSelected ? styles.tryOnsGridCardActive : null]}
                  onPress={() => setSelectedTryOnRenderId(render.id)}
                >
                  <Pressable
                    onPress={() => {
                      setSelectedTryOnRenderId(render.id);
                      openImageViewer(render.uri);
                    }}
                  >
                    <Image source={{ uri: render.uri }} style={styles.tryOnsGridImage} />
                  </Pressable>
                  {DEVELOPER_MODE ? (
                    <Text style={styles.tryOnsGridMeta}>{new Date(render.createdAt).toLocaleString()}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {selectedTryOnRender ? (
            <View style={styles.tryOnDetailCard}>
              <Pressable onPress={() => openImageViewer(selectedTryOnRender.uri)}>
                <Image source={{ uri: selectedTryOnRender.uri }} style={styles.tryOnDetailHero} />
              </Pressable>

              <Text style={styles.tryOnDetailTitle}>{DEVELOPER_MODE ? 'Look metadata' : 'Look details'}</Text>
              <View style={styles.renderFeedbackRow}>
                <Pressable
                  style={[
                    styles.renderFeedbackButton,
                    selectedTryOnRender.feedback === 'yay' ? styles.renderFeedbackButtonYayActive : null,
                  ]}
                  onPress={() => handleSetRenderFeedback(selectedTryOnRender.id, 'yay')}
                >
                  <Text
                    style={[
                      styles.renderFeedbackButtonText,
                      selectedTryOnRender.feedback === 'yay' ? styles.renderFeedbackButtonTextActive : null,
                    ]}
                  >
                    Yay
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.renderFeedbackButton,
                    selectedTryOnRender.feedback === 'nay' ? styles.renderFeedbackButtonNayActive : null,
                  ]}
                  onPress={() => handleSetRenderFeedback(selectedTryOnRender.id, 'nay')}
                >
                  <Text
                    style={[
                      styles.renderFeedbackButtonText,
                      selectedTryOnRender.feedback === 'nay' ? styles.renderFeedbackButtonTextActive : null,
                    ]}
                  >
                    Nay
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.renderFeedbackHint}>
                Stored with this render and used to build your outfit intelligence graph.
              </Text>
              {DEVELOPER_MODE ? (
                <>
                  <Text style={styles.selectedLookDescriptorLine}>
                    Score {selectedTryOnRender.lookScore} • Insulation {selectedTryOnRender.lookInsulationIndex}/100
                  </Text>
                  <Text style={styles.selectedLookDescriptorLine}>
                    Delta {selectedTryOnRender.lookInsulationDelta}
                  </Text>
                  <Text style={styles.selectedLookDescriptorLine}>
                    Liked: {likedLookIds.includes(selectedTryOnRender.lookId) ? 'yes' : 'no'}
                  </Text>
                  {selectedTryOnRender.lookReasons.length > 0 ? (
                    <Text style={styles.lookbookReason}>{selectedTryOnRender.lookReasons.join(' • ')}</Text>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.tryOnGraphSummary}>
                Graph links: {outfitGraph.edges.length} from {outfitGraph.ratedRenderCount} rated renders
              </Text>

              <View style={styles.tryOnDetailPartsGrid}>
                {selectedTryOnRender.lookParts.map((part) => (
                  <View key={`${selectedTryOnRender.id}-${part.role}-${part.itemId}`} style={styles.tryOnPartCard}>
                    <Pressable onPress={() => openImageViewer(part.uri)}>
                      <Image source={{ uri: part.uri }} style={styles.tryOnPartImage} />
                    </Pressable>
                    <Text style={styles.tryOnPartRole}>{roleLabel(part.role)}</Text>
                    <Text style={styles.tryOnPartLabel} numberOfLines={1}>
                      {part.label}
                    </Text>
                  </View>
                ))}
              </View>

              <Pressable
                style={styles.tryOnOpenLookButton}
                onPress={() => openLookFromTryOn(selectedTryOnRender)}
              >
                <Text style={styles.tryOnOpenLookButtonText}>Open Outfit Details</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );

  if (isBootstrapping) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.centeredPanel}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.content}>
        {activeTab === 'camera'
          ? renderCameraArea()
          : activeTab === 'wardrobe'
            ? renderWardrobeArea()
            : activeTab === 'outfit'
                ? renderOutfitArea()
                : activeTab === 'lookbook'
                  ? renderLookbookArea()
                  : renderTryOnsArea()}
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabButton, activeTab === 'wardrobe' ? styles.tabButtonActive : null]}
          onPress={() => setActiveTab('wardrobe')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'wardrobe' ? styles.tabButtonTextActive : null,
            ]}
          >
            Wardrobe
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'outfit' ? styles.tabButtonActive : null]}
          onPress={() => setActiveTab('outfit')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'outfit' ? styles.tabButtonTextActive : null,
            ]}
          >
            Try-On
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'lookbook' ? styles.tabButtonActive : null]}
          onPress={() => setActiveTab('lookbook')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'lookbook' ? styles.tabButtonTextActive : null,
            ]}
          >
            Combine
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === 'tryons' ? styles.tabButtonActive : null]}
          onPress={() => setActiveTab('tryons')}
        >
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'tryons' ? styles.tabButtonTextActive : null,
            ]}
          >
            History
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={Boolean(imageViewerUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewerUri(null)}
      >
        <View style={styles.imageViewerBackdrop}>
          <ScrollView
            key={imageViewerSession}
            style={styles.imageViewerScroll}
            contentContainerStyle={styles.imageViewerScrollContent}
            minimumZoomScale={1}
            maximumZoomScale={5}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            centerContent
            bouncesZoom
          >
            {imageViewerUri ? (
              <Image
                source={{ uri: imageViewerUri }}
                style={{
                  width: Math.max(120, viewportWidth - 24),
                  height: Math.max(220, viewportHeight - 180),
                  backgroundColor: '#020617',
                }}
                resizeMode="contain"
              />
            ) : null}
          </ScrollView>

          <Pressable style={styles.imageViewerCloseButton} onPress={() => setImageViewerUri(null)}>
            <Text style={styles.imageViewerCloseButtonText}>Close</Text>
          </Pressable>
          <Text style={styles.imageViewerHint}>Pinch to zoom</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    flex: 1,
  },
  centeredPanel: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 360,
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  permissionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  permissionBody: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 16,
  },
  permissionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#38bdf8',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  permissionButtonText: {
    color: '#0f172a',
    fontWeight: '700',
  },
  cameraContainer: {
    flex: 1,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  camera: {
    flex: 1,
  },
  overlayTop: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cameraBackButton: {
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  cameraBackButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  overlayText: {
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    overflow: 'hidden',
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 13,
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 84,
    height: 84,
    borderRadius: 84,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.65)',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterDisabled: {
    opacity: 0.75,
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 64,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryContainer: {
    height: 124,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#020617',
  },
  galleryContent: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  thumbnail: {
    width: 92,
    height: 92,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    marginRight: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 260,
    height: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#334155',
  },
  emptyStateText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  wardrobeContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  wardrobeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  wardrobeHeader: {
    flex: 1,
  },
  wardrobeHeaderTitle: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  wardrobeHeaderBody: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
  },
  quickActionsRow: {
    width: 170,
    gap: 8,
  },
  quickActionButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  quickActionButtonDisabled: {
    opacity: 0.55,
  },
  quickActionButtonText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  noteCard: {
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  noteTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    marginBottom: 4,
  },
  noteBody: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  classifyButton: {
    backgroundColor: '#22d3ee',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  classifyButtonDisabled: {
    opacity: 0.5,
  },
  classifyButtonText: {
    color: '#0f172a',
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  rateLimitHint: {
    color: '#fbbf24',
    fontSize: 12,
    marginTop: -2,
    marginBottom: 10,
  },
  lookbookNavButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0284c7',
    backgroundColor: 'rgba(14, 165, 233, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  lookbookNavButtonText: {
    color: '#e0f2fe',
    textAlign: 'center',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  combinatorButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#34d399',
  },
  combinatorButtonDisabled: {
    opacity: 0.55,
  },
  combinatorButtonText: {
    color: '#052e16',
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  combinatorMeta: {
    color: '#a5f3fc',
    fontSize: 12,
    marginBottom: 4,
  },
  combinatorWarning: {
    color: '#fdba74',
    fontSize: 12,
    marginBottom: 4,
  },
  combinatorNote: {
    color: '#cbd5e1',
    fontSize: 12,
    marginBottom: 4,
  },
  lookbookContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  lookbookHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  lookbookHeader: {
    flex: 1,
  },
  lookbookHeaderTitle: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  lookbookHeaderBody: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
    lineHeight: 18,
  },
  lookbookGenerateButton: {
    width: 132,
    marginBottom: 0,
    minHeight: 48,
    justifyContent: 'center',
  },
  lookbookGenerateButtonText: {
    color: '#052e16',
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  weatherModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    marginBottom: 6,
  },
  weatherModeButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0b1224',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  weatherModeButtonActive: {
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
  },
  weatherModeTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  weatherModeTitleActive: {
    color: '#e0f2fe',
  },
  weatherModeSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  weatherModeSubtitleActive: {
    color: '#a5f3fc',
  },
  weatherTargetText: {
    color: '#a5f3fc',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  lookbookScrollContent: {
    paddingTop: 10,
    paddingBottom: 110,
  },
  lookPickerSection: {
    marginBottom: 10,
  },
  lookPickerSectionTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  lookPickerRow: {
    paddingRight: 12,
  },
  lookPickerCard: {
    width: 148,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 6,
    marginRight: 8,
  },
  lookPickerCardActive: {
    borderColor: '#22d3ee',
    backgroundColor: '#082f49',
  },
  lookPickerPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  lookPickerPreviewImage: {
    width: '49%',
    aspectRatio: 1,
    borderRadius: 7,
    backgroundColor: '#020617',
    marginBottom: 4,
  },
  lookPickerPreviewPlaceholder: {
    width: '49%',
    aspectRatio: 1,
    borderRadius: 7,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#334155',
    backgroundColor: '#0b1224',
    marginBottom: 4,
  },
  lookPickerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lookPickerMetaTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  lookPickerMetaScore: {
    color: '#86efac',
    fontSize: 12,
    fontWeight: '800',
  },
  selectedLookSection: {
    marginBottom: 8,
  },
  selectedLookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  selectedLookGridCell: {
    width: '48.5%',
    aspectRatio: 0.9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    marginBottom: 8,
  },
  selectedLookGridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#020617',
  },
  selectedLookDescriptorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 10,
  },
  selectedLookDescriptorTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  selectedLookDescriptorLine: {
    color: '#cbd5e1',
    fontSize: 12,
    marginBottom: 4,
  },
  selectedLookMiniThumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  selectedLookMiniThumb: {
    width: 42,
    height: 42,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#020617',
  },
  selectedLookMiniThumbImage: {
    width: '100%',
    height: '100%',
  },
  tryOnPanel: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  tryOnTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  tryOnBody: {
    color: '#cbd5e1',
    fontSize: 12,
    marginBottom: 8,
  },
  tryOnActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tryOnActionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 8,
  },
  tryOnActionButtonDisabled: {
    opacity: 0.55,
  },
  tryOnActionButtonText: {
    color: '#082f49',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  subjectPickerRow: {
    paddingBottom: 6,
    paddingRight: 8,
  },
  subjectPickerItem: {
    width: 72,
    height: 90,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    marginRight: 8,
    backgroundColor: '#020617',
  },
  subjectPickerItemActive: {
    borderColor: '#22d3ee',
  },
  subjectPickerImage: {
    width: '100%',
    height: '100%',
  },
  tryOnHint: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 8,
  },
  tryOnStatusText: {
    color: '#fbbf24',
    fontSize: 12,
    marginTop: -2,
    marginBottom: 8,
    lineHeight: 17,
  },
  tryOnRunButton: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34d399',
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  tryOnRunButtonDisabled: {
    opacity: 0.5,
  },
  tryOnRunButtonText: {
    color: '#052e16',
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
  },
  tryOnResultCard: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 10,
    backgroundColor: '#0b1224',
    padding: 8,
    marginBottom: 8,
  },
  tryOnResultTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  tryOnResultImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#020617',
  },
  latestRenderCard: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    padding: 10,
    marginBottom: 10,
  },
  latestRenderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  latestRenderTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  renderFeedbackRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  renderFeedbackButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1224',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renderFeedbackButtonYayActive: {
    borderColor: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.25)',
  },
  renderFeedbackButtonNayActive: {
    borderColor: '#fb7185',
    backgroundColor: 'rgba(251, 113, 133, 0.2)',
  },
  renderFeedbackButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
  },
  renderFeedbackButtonTextActive: {
    color: '#f8fafc',
  },
  renderFeedbackHint: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
  },
  tryOnHistoryRow: {
    paddingBottom: 2,
    paddingRight: 8,
  },
  tryOnHistoryThumb: {
    width: 62,
    height: 62,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#020617',
    marginRight: 6,
  },
  lookbookReason: {
    color: '#cbd5e1',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  outfitScreenContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  outfitScreenHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  outfitScreenHeader: {
    flex: 1,
  },
  outfitScreenTitle: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  outfitScreenBody: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  outfitHeaderActions: {
    gap: 8,
  },
  outfitBackButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  outfitBackButtonText: {
    color: '#a5f3fc',
    fontSize: 12,
    fontWeight: '800',
  },
  savedOutfitRow: {
    paddingBottom: 8,
    paddingRight: 8,
  },
  savedOutfitChip: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginRight: 8,
  },
  savedOutfitChipActive: {
    borderColor: '#22d3ee',
    backgroundColor: '#082f49',
  },
  savedOutfitChipText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  savedOutfitChipTextActive: {
    color: '#e0f2fe',
  },
  outfitScrollContent: {
    paddingTop: 2,
    paddingBottom: 120,
  },
  outfitCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 10,
    marginBottom: 10,
  },
  // External inspiration styles are intentionally disabled while we focus on the
  // wardrobe-only flow.
  outfitCardTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  outfitCardMeta: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  outfitCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  saveOutfitButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22d3ee',
    paddingHorizontal: 10,
  },
  saveOutfitButtonDisabled: {
    opacity: 0.55,
  },
  saveOutfitButtonText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 13,
  },
  outfitTryOnButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34d399',
    paddingHorizontal: 10,
  },
  outfitTryOnButtonDisabled: {
    opacity: 0.5,
  },
  outfitTryOnButtonText: {
    color: '#052e16',
    fontWeight: '800',
    fontSize: 13,
  },
  outfitSubjectCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 10,
    marginBottom: 10,
  },
  outfitSubjectTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  outfitPartsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  outfitPartCard: {
    width: '48.5%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 6,
    marginBottom: 8,
  },
  outfitPartImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#020617',
  },
  outfitPartRole: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  outfitPartLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
  },
  emptyLookbook: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#0b1224',
  },
  emptyLookbookTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyLookbookBody: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  wardrobeSections: {
    paddingBottom: 120,
  },
  categorySection: {
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    backgroundColor: '#0b1224',
    marginBottom: 10,
    overflow: 'hidden',
  },
  categoryHeader: {
    minHeight: 50,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111a2e',
  },
  categoryTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  categoryChevron: {
    color: '#67e8f9',
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '500',
  },
  categoryGrid: {
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  wardrobeCard: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    marginBottom: 10,
  },
  wardrobeCardSelected: {
    borderColor: '#22d3ee',
    backgroundColor: '#082f49',
  },
  wardrobeImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#020617',
  },
  wardrobeBody: {
    padding: 10,
  },
  wardrobeTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  wardrobeLine: {
    color: '#cbd5e1',
    fontSize: 12,
    marginBottom: 4,
  },
  wardrobeRefLine: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  wardrobeConfidence: {
    color: '#67e8f9',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  wardrobeError: {
    color: '#fecdd3',
    fontSize: 11,
    marginTop: 5,
  },
  deleteButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#be123c',
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(190, 24, 93, 0.16)',
  },
  wardrobeActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  selectItemButton: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.16)',
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectItemButtonActive: {
    borderColor: '#67e8f9',
    backgroundColor: '#22d3ee',
  },
  selectItemButtonDisabled: {
    opacity: 0.5,
  },
  selectItemButtonText: {
    color: '#a5f3fc',
    fontSize: 12,
    fontWeight: '700',
  },
  selectItemButtonTextActive: {
    color: '#0f172a',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: '#fecdd3',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyWardrobe: {
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  emptyWardrobeText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  lookPickerMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lookPickerLiked: {
    color: '#fb7185',
    fontSize: 12,
    fontWeight: '800',
  },
  outfitBuilderCard: {
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  outfitBuilderTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    marginBottom: 4,
  },
  outfitBuilderBody: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 17,
  },
  selectionChecklistRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 6,
  },
  selectionChecklistChip: {
    flex: 1,
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1224',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  selectionChecklistChipComplete: {
    borderColor: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.22)',
  },
  selectionChecklistChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  selectionChecklistChipTextComplete: {
    color: '#d1fae5',
  },
  outfitBuilderActions: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  outfitBuilderButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#34d399',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  outfitBuilderButtonDisabled: {
    opacity: 0.5,
  },
  outfitBuilderButtonText: {
    color: '#052e16',
    fontSize: 12,
    fontWeight: '800',
  },
  outfitBuilderClearButton: {
    minWidth: 62,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#0b1224',
  },
  outfitBuilderClearButtonDisabled: {
    opacity: 0.5,
  },
  outfitBuilderClearButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  outfitBuilderOpenButton: {
    minWidth: 92,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  outfitBuilderOpenButtonText: {
    color: '#a5f3fc',
    fontSize: 12,
    fontWeight: '700',
  },
  selectedLookHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  likeLookButton: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fb7185',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
  },
  likeLookButtonActive: {
    backgroundColor: '#fb7185',
  },
  likeLookButtonText: {
    color: '#fecdd3',
    fontSize: 12,
    fontWeight: '700',
  },
  likeLookButtonTextActive: {
    color: '#4c0519',
  },
  tryOnResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  tryOnResultOpenButton: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryOnResultOpenButtonText: {
    color: '#a5f3fc',
    fontSize: 11,
    fontWeight: '700',
  },
  tryOnsContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  tryOnsHeaderRow: {
    marginBottom: 8,
  },
  tryOnsHeader: {
    flex: 1,
  },
  tryOnsHeaderTitle: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '700',
  },
  tryOnsHeaderBody: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
  },
  tryOnsScrollContent: {
    paddingTop: 8,
    paddingBottom: 120,
  },
  tryOnsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tryOnsGridCard: {
    width: '48.5%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    marginBottom: 10,
  },
  tryOnsGridCardActive: {
    borderColor: '#22d3ee',
  },
  tryOnsGridImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#020617',
  },
  tryOnsGridMeta: {
    color: '#cbd5e1',
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tryOnDetailCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
    padding: 10,
  },
  tryOnDetailHero: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#020617',
    marginBottom: 10,
  },
  tryOnDetailTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  tryOnGraphSummary: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 6,
  },
  tryOnDetailPartsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tryOnPartCard: {
    width: '48.5%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0b1224',
    padding: 6,
    marginBottom: 8,
  },
  tryOnPartImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#020617',
  },
  tryOnPartRole: {
    color: '#67e8f9',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  tryOnPartLabel: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
  },
  tryOnOpenLookButton: {
    minHeight: 42,
    borderRadius: 10,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22d3ee',
  },
  tryOnOpenLookButtonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#020617',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  tabButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    backgroundColor: '#0f172a',
  },
  tabButtonActive: {
    backgroundColor: '#22d3ee',
  },
  tabButtonText: {
    color: '#cbd5e1',
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#0f172a',
  },
  errorBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(190, 24, 93, 0.95)',
  },
  errorText: {
    color: '#fff1f2',
    fontSize: 13,
    fontWeight: '600',
  },
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 16,
  },
  imageViewerScroll: {
    flex: 1,
    width: '100%',
  },
  imageViewerScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerImage: {
    width: '100%',
    height: '88%',
    backgroundColor: '#020617',
  },
  imageViewerCloseButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginTop: 6,
  },
  imageViewerCloseButtonText: {
    color: '#a5f3fc',
    fontSize: 12,
    fontWeight: '700',
  },
  imageViewerHint: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 8,
  },

  // --- Visual Wardrobe Grid ---
  gridHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
  },
  gridHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  gridHeaderTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  gridHeaderSelection: {
    color: '#22d3ee',
    fontSize: 14,
    fontWeight: '600',
  },
  gridHeaderRight: {
    flexDirection: 'row',
    gap: 8,
  },
  gridHeaderButton: {
    minHeight: 36,
    minWidth: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  gridHeaderButtonDisabled: {
    opacity: 0.5,
  },
  gridHeaderButtonText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '700',
  },
  addMenuDropdown: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  addMenuOption: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#334155',
  },
  addMenuOptionDisabled: {
    opacity: 0.5,
  },
  addMenuOptionText: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '500',
  },
  zoomHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 6,
  },
  zoomButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  zoomHintText: {
    color: '#64748b',
    fontSize: 12,
  },
  gridScrollContent: {
    paddingBottom: 160,
  },
  gridCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  gridCategoryTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gridCategoryCount: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 1,
  },
  gridTile: {
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  gridTileImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#020617',
  },
  gridTileSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(34, 211, 238, 0.25)',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 4,
  },
  gridTileCheckmark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTileCheckmarkText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyWardrobeTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },

  // --- Floating Outfit Bar ---
  floatingOutfitBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(2, 6, 23, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  floatingOutfitChips: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  floatingOutfitChip: {
    flex: 1,
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1224',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingOutfitChipDone: {
    borderColor: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
  },
  floatingOutfitChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  floatingOutfitChipTextDone: {
    color: '#d1fae5',
  },
  floatingOutfitActions: {
    flexDirection: 'row',
    gap: 8,
  },
  floatingOutfitClearButton: {
    minWidth: 60,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1224',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  floatingOutfitClearText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
  },
  floatingOutfitGoButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#34d399',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingOutfitGoText: {
    color: '#052e16',
    fontSize: 13,
    fontWeight: '800',
  },
  floatingOutfitStudioButton: {
    minWidth: 70,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  floatingOutfitStudioText: {
    color: '#a5f3fc',
    fontSize: 13,
    fontWeight: '700',
  },

  // --- Detail Modal ---
  detailModalContainer: {
    flex: 1,
    backgroundColor: '#020617',
  },
  detailModalScroll: {
    flexGrow: 1,
  },
  detailModalImage: {
    width: '100%',
    aspectRatio: 0.85,
    backgroundColor: '#0f172a',
  },
  detailModalInfo: {
    padding: 16,
  },
  detailModalTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  detailModalRow: {
    marginBottom: 14,
  },
  detailModalLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailModalValue: {
    color: '#e2e8f0',
    fontSize: 15,
    lineHeight: 21,
  },
  detailModalColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  detailModalColorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1e293b',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  detailModalColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  detailModalColorName: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  detailModalHint: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  detailModalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailModalSelectButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#22d3ee',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  detailModalSelectButtonActive: {
    borderColor: '#67e8f9',
    backgroundColor: '#22d3ee',
  },
  detailModalSelectButtonText: {
    color: '#a5f3fc',
    fontSize: 14,
    fontWeight: '700',
  },
  detailModalSelectButtonTextActive: {
    color: '#0f172a',
  },
  detailModalDeleteButton: {
    minWidth: 80,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#be123c',
    backgroundColor: 'rgba(190, 24, 93, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  detailModalDeleteButtonDisabled: {
    opacity: 0.5,
  },
  detailModalDeleteButtonText: {
    color: '#fecdd3',
    fontSize: 14,
    fontWeight: '700',
  },
  detailModalCloseButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailModalCloseButtonText: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '700',
  },
});
