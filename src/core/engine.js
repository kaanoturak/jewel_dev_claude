/**
 * Pure calculation engine — no DB calls, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * Formula source: Section 6 of the project spec.
 *
 * Note on the Section 14 example product JSON: the example shows transferPrice
 * of 27.14, but the Section 6 formula applied to its own input values yields
 * 27.90. The formula is authoritative; the example number appears to be a typo.
 */

// ─── Cost layer calculations (Section 6) ─────────────────────────────────────

/**
 * Manufacturer cost layer.
 * costBase = costMaterial + costLabor + costPackaging
 */
function calcCostBase(product) {
  const material  = Number(product.costMaterial)  || 0;
  const labor     = Number(product.costLabor)     || 0;
  const packaging = Number(product.costPackaging) || 0;
  return round2(material + labor + packaging);
}

/**
 * Admin cost layer.
 * Step 1: apply tax to costBase, then add flat costs.
 * Step 2: apply target margin to the step-1 subtotal.
 *
 * Returns null when adminMarginPct is not yet set (admin layer incomplete).
 */
function calcTransferPrice(product, costBase) {
  if (product.adminMarginPct === null || product.adminMarginPct === undefined) {
    return null;
  }

  const taxMultiplier  = 1 + (Number(product.adminTaxPct)          || 0) / 100;
  const logistics      = Number(product.adminLogisticsCost)          || 0;
  const marketing      = Number(product.adminMarketingCost)          || 0;
  const misc           = Number(product.adminMiscCost)               || 0;
  const marginMultiplier = 1 + Number(product.adminMarginPct) / 100;

  const afterTaxAndCosts = (costBase * taxMultiplier) + logistics + marketing + misc;
  return round2(afterTaxAndCosts * marginMultiplier);
}

/**
 * Effective price after applying an active campaign discount.
 * Always computed at runtime — never stored (Section 11).
 *
 * Returns null when sellingPrice is not yet set.
 */
function calcEffectivePrice(product, campaign) {
  const base = Number(product.sellingPrice);
  if (!base || base <= 0) return null;
  if (!campaign || !campaign.isActive) return base;

  const now = Date.now();
  if (campaign.startsAt > now) return base;
  if (campaign.endsAt && campaign.endsAt < now) return base;

  if (campaign.discountType === 'PERCENTAGE') {
    return round2(Math.max(0, base * (1 - Number(campaign.discountValue) / 100)));
  }
  if (campaign.discountType === 'FIXED') {
    return round2(Math.max(0, base - Number(campaign.discountValue)));
  }

  return base;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full cost calculation pipeline for a product.
 *
 * @param {object} product  - Product record (partial is fine; missing fields default to 0/null)
 * @param {object} campaign - Active campaign record, or null
 * @returns {{ costBase: number, transferPrice: number|null, effectivePrice: number|null }}
 */
export function calculate(product, campaign = null) {
  if (!product) return { costBase: 0, transferPrice: null, effectivePrice: null };

  const costBase      = calcCostBase(product);
  const transferPrice = calcTransferPrice(product, costBase);
  const effectivePrice = calcEffectivePrice(product, campaign);

  return { costBase, transferPrice, effectivePrice };
}

/**
 * Convenience: compute only the effective price (used by campaign module at render time).
 */
export function getEffectivePrice(product, campaign) {
  return calcEffectivePrice(product, campaign);
}
