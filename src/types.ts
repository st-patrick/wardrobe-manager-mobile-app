export type ClassificationStatus = 'unclassified' | 'classified' | 'error';

export type ClassificationColor = {
  name: string;
  hex: string;
  percentage: number;
};

export type GarmentClassification = {
  category: string;
  subcategory: string;
  itemType: string;
  dominantColors: ClassificationColor[];
  secondaryColors: ClassificationColor[];
  pattern: string;
  material: string[];
  estimatedSize: string;
  fit: string;
  collar: string;
  sleeveLength: string;
  closure: string;
  pockets: string;
  shoeType: string;
  heel: string;
  toeShape: string;
  features: string[];
  formality: string;
  season: string[];
  tags: string[];
  insulationIndex: number;
  confidence: number;
  notes: string;
};

export type WardrobeItem = {
  id: string;
  uri: string;
  createdAt: number;
  sourceUri: string | null;
  originalLocalUri: string | null;
  originalSha256: string | null;
  jpegSha256: string | null;
  classificationStatus: ClassificationStatus;
  classification: GarmentClassification | null;
  classifiedAt: number | null;
  classificationError: string | null;
};
