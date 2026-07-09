export const PRODUCT_UNITS = [
  { value: 'piece', label: 'Piece', shortLabel: 'pc' },
  { value: 'kg', label: 'Kg', shortLabel: 'kg' },
  { value: 'gram', label: 'Gram', shortLabel: 'g' },
  { value: 'metric_ton', label: 'Metric Ton', shortLabel: 'MT' },
  { value: 'litre', label: 'Litre', shortLabel: 'L' },
  { value: 'millilitre', label: 'Millilitre', shortLabel: 'ml' },
  { value: 'meter', label: 'Meter', shortLabel: 'm' },
  { value: 'centimeter', label: 'Centimeter', shortLabel: 'cm' },
  { value: 'roll', label: 'Roll', shortLabel: 'roll' },
  { value: 'pack', label: 'Pack', shortLabel: 'pack' },
  { value: 'box', label: 'Box', shortLabel: 'box' },
  { value: 'bottle', label: 'Bottle', shortLabel: 'bottle' },
  { value: 'carton', label: 'Carton', shortLabel: 'carton' },
  { value: 'bag', label: 'Bag', shortLabel: 'bag' },
  { value: 'set', label: 'Set', shortLabel: 'set' },
];

const LEGACY_UNIT_MAP = {
  unit: 'piece',
  units: 'piece',
  pcs: 'piece',
  pc: 'piece',
  pieces: 'piece',
  tonne: 'metric_ton',
  ton: 'metric_ton',
  tons: 'metric_ton',
  litre: 'litre',
  liter: 'litre',
  liters: 'litre',
  litres: 'litre',
  boxes: 'box',
  rolls: 'roll',
  packs: 'pack',
};

export function normalizeProductUnit(unit) {
  const raw = String(unit || '').trim().toLowerCase().replace(/\s+/g, '_');
  const mapped = LEGACY_UNIT_MAP[raw] || raw;
  return PRODUCT_UNITS.some((item) => item.value === mapped) ? mapped : 'piece';
}

export function getProductUnitLabel(unit, { short = false } = {}) {
  const normalized = normalizeProductUnit(unit);
  const match = PRODUCT_UNITS.find((item) => item.value === normalized);
  return short ? match?.shortLabel || normalized : match?.label || normalized;
}