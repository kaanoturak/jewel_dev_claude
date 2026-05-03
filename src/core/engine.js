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

import CloudDB from './db.js';

// ─── Marketplace Financial Formulas ──────────────────────────────────────────

/**
 * Manufacturer cost layer (unchanged).
 */
function calcCostBase(product) {
  const material  = Number(product.costMaterial)  || 0;
  const labor     = Number(product.costLabor)     || 0;
  const packaging = Number(product.costPackaging) || 0;
  return round2(material + labor + packaging);
}

/**
 * Marketplace Commission-Based Payout.
 * 
 * grossMargin = sellingPrice - costBase
 * commission = grossMargin * (marketplaceCommissionPct / 100)
 * vendorPayout = sellingPrice - commission
 */
async function calcMarketplacePayout(product, effectivePrice) {
  const costBase = calcCostBase(product);
  if (!effectivePrice || effectivePrice <= 0) return null;

  // Retrieve commission rate from settings (global default)
  const settings = await CloudDB.get('settings', 'marketplace_config');
  const commissionPct = settings?.marketplaceCommissionPct ?? 15; // Default 15%

  const grossMargin  = round2(effectivePrice - costBase);
  // commission is only applied to positive margin
  const commission   = round2(Math.max(0, grossMargin) * (commissionPct / 100));
  const vendorPayout = round2(effectivePrice - commission);

  return { grossMargin, commission, vendorPayout, commissionPct };
}

/**
 * Step 1: apply tax to costBase, then add flat costs.
 * Step 2: apply target margin to the step-1 subtotal.
 * 
 * @deprecated Legacy internal transfer price logic. Maintained for read-only compatibility.
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
 * @param {object} variant - Optional variant record; its sellingPrice takes
 *   priority over product.sellingPrice when present (per-variant pricing).
 *
 * Returns null when sellingPrice is not yet set.
 */
function calcEffectivePrice(product, campaign, variant = null, channel = null) {
  let base = Number(variant?.sellingPrice ?? product.sellingPrice);
  
  // Apply channel-specific override if present
  if (channel && variant?.channelConfig?.[channel]?.sellingPrice != null) {
    base = Number(variant.channelConfig[channel].sellingPrice);
  }

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
 * @param {object} product  - Product record
 * @param {object} campaign - Active campaign record, or null
 * @param {object} variant  - Optional variant record
 * @param {string} channel  - Optional sales channel
 * @returns {Promise<{ costBase: number, transferPrice: number|null, effectivePrice: number|null, grossMargin: number|null, commission: number|null, vendorPayout: number|null }>}
 */
export async function calculate(product, campaign = null, variant = null, channel = null) {
  if (!product) return { 
    costBase: 0, transferPrice: null, effectivePrice: null, 
    grossMargin: null, commission: null, vendorPayout: null 
  };

  const costBase       = calcCostBase(product);
  const transferPrice  = calcTransferPrice(product, costBase);
  const effectivePrice = calcEffectivePrice(product, campaign, variant, channel);
  
  const marketplace = await calcMarketplacePayout(product, effectivePrice);

  return { 
    costBase, 
    transferPrice, 
    effectivePrice,
    grossMargin:  marketplace?.grossMargin ?? null,
    commission:   marketplace?.commission ?? null,
    vendorPayout: marketplace?.vendorPayout ?? null,
    commissionPct: marketplace?.commissionPct ?? null
  };
}

/**
 * Convenience: compute only the effective price.
 */
export function getEffectivePrice(product, campaign, variant = null, channel = null) {
  return calcEffectivePrice(product, campaign, variant, channel);
}

/**
 * Compute transfer price for a single variant using its own cost fields
 * and the admin-level config from the parent product.
 * Does NOT use or modify product-level costBase.
 */
export function calculateVariantTransferPrice(variant, productAdminConfig) {
  const base = round2(
    (Number(variant.costMaterial)  || 0) +
    (Number(variant.costLabor)     || 0) +
    (Number(variant.costPackaging) || 0)
  );
  return calcTransferPrice(productAdminConfig, base);
}
