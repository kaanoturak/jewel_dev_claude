// ─── Enum constants ───────────────────────────────────────────────────────────
// Mirror of CATEGORY_CODES / MATERIAL_CODES keys in sku.js.
// Kept here as plain arrays to avoid importing from a non-core module.

const VALID_CATEGORIES = ['Ring', 'Necklace', 'Earring', 'Bracelet', 'Brooch', 'Other'];
const VALID_MATERIALS  = ['Brass', 'Gold', 'Silver', 'Mixed'];

// ─── Rule checkers ────────────────────────────────────────────────────────────

const CHECKERS = {
  required:  (v)       => v !== null && v !== undefined && v !== '',
  minLength: (v, n)    => typeof v === 'string' && v.trim().length >= n,
  maxLength: (v, n)    => typeof v === 'string' && v.trim().length <= n,
  min:       (v, n)    => { const num = Number(v); return !Number.isNaN(num) && num >= n; },
  max:       (v, n)    => { const num = Number(v); return !Number.isNaN(num) && num <= n; },
  gt:        (v, n)    => { const num = Number(v); return !Number.isNaN(num) && num > n;  },
  integer:   (v)       => Number.isInteger(v),
  enum:      (v, list) => list.includes(v),
  minItems:  (v, n)    => Array.isArray(v) && v.length >= n,
};

// ─── Schemas (Section 16) ─────────────────────────────────────────────────────

export const PRODUCT_SCHEMA = {
  name: [
    { rule: 'required',  message: 'Product name is required' },
    { rule: 'minLength', value: 2,   message: 'Product name must be at least 2 characters' },
    { rule: 'maxLength', value: 120, message: 'Product name must be 120 characters or fewer' },
  ],
  category: [
    { rule: 'required', message: 'Please select a category' },
    { rule: 'enum', value: VALID_CATEGORIES, message: 'Please select a category' },
  ],
  material: [
    { rule: 'required', message: 'Please select a material' },
    { rule: 'enum', value: VALID_MATERIALS, message: 'Please select a material' },
  ],
  seoTitle: [
    { rule: 'required',  message: 'SEO title is required (max 70 chars)' },
    { rule: 'maxLength', value: 70, message: 'SEO title is required (max 70 chars)' },
  ],
  seoDescription: [
    { rule: 'required',  message: 'SEO description required (max 160 chars)' },
    { rule: 'maxLength', value: 160, message: 'SEO description required (max 160 chars)' },
  ],
  marketingDescription: [
    { rule: 'required',  message: 'Marketing description required (min 50 chars)' },
    { rule: 'minLength', value: 50, message: 'Marketing description required (min 50 chars)' },
  ],
  productDescription: [
    { rule: 'required',  message: 'Product description required (min 100 chars)' },
    { rule: 'minLength', value: 100, message: 'Product description required (min 100 chars)' },
  ],
  images: [
    { rule: 'minItems', value: 1, message: 'At least one product image is required' },
  ],
};

export const VARIANT_SCHEMA = {
  stockCount: [
    { rule: 'required', message: 'Stock count is required' },
    { rule: 'integer',  message: 'Stock count must be a whole number' },
    { rule: 'min', value: 0, message: 'Stock count cannot be negative' },
  ],
  size: [
    { rule: 'maxLength', value: 20, message: 'Size must be 20 characters or fewer' },
  ],
  color: [
    { rule: 'maxLength', value: 30, message: 'Color must be 30 characters or fewer' },
  ],
  // Optional per-variant price overrides — validated only when a value is present
  sellingPrice: [
    { rule: 'min', value: 0, message: 'Variant selling price cannot be negative' },
  ],
  compareAtPrice: [
    { rule: 'min', value: 0, message: 'Variant compare-at price cannot be negative' },
  ],
  // Optional per-variant cost overrides — validated only when a value is present
  costMaterial: [
    { rule: 'min', value: 0, message: 'Variant material cost cannot be negative' },
  ],
  costLabor: [
    { rule: 'min', value: 0, message: 'Variant labor cost cannot be negative' },
  ],
  costPackaging: [
    { rule: 'min', value: 0, message: 'Variant packaging cost cannot be negative' },
  ],
};

export const MANUFACTURER_COST_SCHEMA = {
  costMaterial: [
    { rule: 'required', message: 'Material cost is required' },
    { rule: 'min', value: 0, message: 'Material cost cannot be negative' },
  ],
  costLabor: [
    { rule: 'required', message: 'Labor cost is required' },
    { rule: 'min', value: 0, message: 'Labor cost cannot be negative' },
  ],
  // Optional — only validated when a value is present
  costPackaging: [
    { rule: 'min', value: 0, message: 'Packaging cost cannot be negative' },
  ],
};

export const ADMIN_COST_SCHEMA = {
  adminMarginPct: [
    { rule: 'required', message: 'Target margin is required' },
    { rule: 'min', value: 0,   message: 'Margin must be between 0 and 500' },
    { rule: 'max', value: 500, message: 'Margin must be between 0 and 500' },
  ],
  // All remaining fields are optional — validated only when present
  adminTaxPct: [
    { rule: 'min', value: 0,   message: 'Tax must be between 0 and 100' },
    { rule: 'max', value: 100, message: 'Tax must be between 0 and 100' },
  ],
  adminLogisticsCost: [
    { rule: 'min', value: 0, message: 'Logistics cost cannot be negative' },
  ],
  adminMarketingCost: [
    { rule: 'min', value: 0, message: 'Marketing cost cannot be negative' },
  ],
  adminMiscCost: [
    { rule: 'min', value: 0, message: 'Misc cost cannot be negative' },
  ],
};

export const SALES_PRICING_SCHEMA = {
  sellingPrice: [
    { rule: 'required', message: 'Selling price is required' },
    { rule: 'min', value: 0, message: 'Selling price cannot be negative' },
  ],
  // Optional — only validated when a value is present
  compareAtPrice: [
    { rule: 'min', value: 0, message: 'Compare-at price cannot be negative' },
  ],
};

// ─── Core validate function ───────────────────────────────────────────────────

/**
 * Validate `data` against `schema`.
 *
 * Returns { valid: boolean, errors: { [field]: string[] } }
 *
 * Rules are processed in declaration order. If a `required` rule fails
 * for a field, subsequent rules for that field are skipped — there is no
 * point reporting length or range errors on a missing value.
 *
 * Optional fields (no `required` rule) whose value is null, undefined, or ''
 * are skipped entirely, so only actually-supplied values are validated.
 */
export function validate(schema, data) {
  const errors = {};

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const requiredRule = rules.find((r) => r.rule === 'required');
    const hasValue = value !== null && value !== undefined && value !== '';

    if (requiredRule && !hasValue) {
      // Required field is absent — report only the required message, skip the rest.
      errors[field] = [requiredRule.message];
      continue;
    }

    if (!requiredRule && !hasValue) {
      // Optional field is absent — nothing to validate.
      continue;
    }

    // Field is present — run all non-required rules.
    const fieldErrors = [];
    for (const { rule, value: ruleValue, message } of rules) {
      if (rule === 'required') continue;

      const checker = CHECKERS[rule];
      if (!checker) {
        console.warn(`validator: unknown rule "${rule}" on field "${field}" — skipped`);
        continue;
      }
      if (!checker(value, ruleValue)) {
        fieldErrors.push(message);
      }
    }

    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
