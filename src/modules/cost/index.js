import { calculate } from '../../core/engine.js';

/**
 * Compute all cost layers for a product.
 * Thin wrapper over engine.calculate() — kept here so other modules
 * import from the cost module, not from core directly.
 *
 * @param {object} product   - Product record (partial values default to 0/null in engine)
 * @param {object} campaign  - Active campaign record or null
 * @returns {{ costBase: number, transferPrice: number|null, effectivePrice: number|null }}
 */
export function computeCosts(product, campaign = null) {
  return calculate(product, campaign);
}

/**
 * Format a numeric cost value for display.
 * Returns '—' for null/undefined (cost layer not yet filled in).
 *
 * @param {number|null|undefined} value
 * @returns {string}  e.g. '$27.90' or '—'
 */
export function formatCost(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return `$${Number(value).toFixed(2)}`;
}
