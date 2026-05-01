import DB from '../../core/db.js';

// ─── Lookup tables (Section 9) ────────────────────────────────────────────────

export const CATEGORY_CODES = {
  Ring:      'RNG',
  Necklace:  'NCK',
  Earring:   'ERR',
  Bracelet:  'BRC',
  Brooch:    'BRS',
  Other:     'OTH',
};

export const MATERIAL_CODES = {
  Brass:  'BRS',
  Gold:   'GLD',
  Silver: 'SLV',
  Mixed:  'MIX',
};

const SEQUENCE_SETTING_ID  = 'skuSequence';
const PREFIX_SETTING_ID    = 'skuPrefix';
const DEFAULT_PREFIX       = 'TGJ';
const SEQUENCE_PAD_LENGTH  = 5;
const VARIANT_SUFFIX_MAX   = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _resolvePrefix() {
  const setting = await DB.get('settings', PREFIX_SETTING_ID);
  return (setting && setting.value) ? setting.value : DEFAULT_PREFIX;
}

function _padSequence(n) {
  return String(n).padStart(SEQUENCE_PAD_LENGTH, '0');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a new parent-product SKU.
 *
 *   generateProductSKU('Ring', 'Brass')  → 'TGJ-RNG-BRS-00001'
 *   generateProductSKU('Necklace', 'Gold') → 'TGJ-NCK-GLD-00002'
 *
 * The sequence is read and incremented atomically inside a single IndexedDB
 * readwrite transaction, so concurrent calls can never receive the same number.
 *
 * The prefix is read from the 'settings' store (key: 'skuPrefix') and falls back
 * to 'TGJ'. Once a SKU is generated it is never regenerated — callers must store
 * it immediately on the product record.
 */
export async function generateProductSKU(category, material) {
  const categoryCode = CATEGORY_CODES[category];
  if (!categoryCode) throw new Error(`generateProductSKU: unknown category "${category}"`);

  const materialCode = MATERIAL_CODES[material];
  if (!materialCode) throw new Error(`generateProductSKU: unknown material "${material}"`);

  // Increment first so that sequence 1 is the first SKU ever issued (not 0).
  const sequence = await DB.atomicIncrement(SEQUENCE_SETTING_ID);

  // Prefix is stable per session; read it after the sequence is already locked.
  const prefix = await _resolvePrefix();

  return `${prefix}-${categoryCode}-${materialCode}-${_padSequence(sequence)}`;
}

/**
 * Derive a variant SKU from its parent product SKU.
 *
 *   generateVariantSKU('TGJ-RNG-BRS-00001', 'S925') → 'TGJ-RNG-BRS-00001-S925'
 *   generateVariantSKU('TGJ-RNG-BRS-00001', 'CGD')  → 'TGJ-RNG-BRS-00001-CGD'
 *
 * The suffix is uppercased and whitespace-stripped before appending.
 * Throws if the suffix exceeds 6 characters (Section 9 limit).
 *
 * Variant SKUs share the parent's sequence number so the family relationship
 * is visible in the SKU itself without any lookup.
 */
export function generateVariantSKU(parentSku, suffix) {
  if (!parentSku || typeof parentSku !== 'string') {
    throw new Error('generateVariantSKU: parentSku is required');
  }
  if (!suffix || typeof suffix !== 'string') {
    throw new Error('generateVariantSKU: suffix is required');
  }

  const normalized = suffix.trim().toUpperCase().replace(/\s+/g, '');

  if (normalized.length === 0) {
    throw new Error('generateVariantSKU: suffix must not be empty after normalization');
  }
  if (normalized.length > VARIANT_SUFFIX_MAX) {
    throw new Error(
      `generateVariantSKU: suffix "${normalized}" is ${normalized.length} chars — max is ${VARIANT_SUFFIX_MAX}`
    );
  }

  return `${parentSku}-${normalized}`;
}

/**
 * Parse a product SKU back into its components for display or validation.
 * Returns null if the string does not match the expected format.
 *
 *   parseSKU('TGJ-RNG-BRS-00001') → { prefix:'TGJ', category:'RNG', material:'BRS', sequence:1 }
 */
export function parseSKU(sku) {
  if (typeof sku !== 'string') return null;
  const match = sku.match(/^([A-Z]+)-([A-Z]+)-([A-Z]+)-(\d{5})$/);
  if (!match) return null;
  return {
    prefix:   match[1],
    category: match[2],
    material: match[3],
    sequence: parseInt(match[4], 10),
  };
}
