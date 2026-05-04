import { getEffectivePrice } from '../../core/engine.js';

// ─── CSV helpers (RFC 4180) ───────────────────────────────────────────────────

function csvCell(value) {
  const str = value == null ? '' : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

function productHandle(product) {
  return (product.name || product.sku || product.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function variantsByProductId(variants) {
  const map = {};
  for (const v of (variants || [])) {
    if (!map[v.productId]) map[v.productId] = [];
    map[v.productId].push(v);
  }
  return map;
}

function exportPrice(product, variant = null, channel = null) {
  return getEffectivePrice(product, null, variant, channel);
}

function exportCompareAtPrice(product, variant = null) {
  if (product.variantPricingEnabled === true && variant?.compareAtPrice != null) {
    return variant.compareAtPrice;
  }
  return product.compareAtPrice ?? null;
}

// ─── Shopify CSV ──────────────────────────────────────────────────────────────

const SHOPIFY_HEADERS = [
  'Handle', 'Title', 'Body HTML', 'Vendor', 'Type', 'Tags',
  'Variant SKU', 'Variant Price', 'Variant Compare At Price', 'Variant Inventory Qty',
];

/**
 * Convert READY_FOR_ECOMMERCE products to a Shopify-compatible CSV string.
 * RFC 4180 compliant: fields with commas/quotes/newlines are double-quoted;
 * embedded quotes are doubled.
 *
 * Multi-variant products: first variant row carries all product fields;
 * additional variant rows carry only Handle + variant columns.
 *
 * @param {object[]} products - Full product records from DB
 * @param {object[]} variants - Full variant records from DB
 * @returns {string} CSV string (CRLF line endings)
 */
export function toShopifyCSV(products, variants) {
  const ready   = (products || []).filter(p => p.status === 'READY_FOR_ECOMMERCE' || p.status === 'PUBLISHED');
  const vByProd = variantsByProductId(variants);

  const rows = [csvRow(SHOPIFY_HEADERS)];

  for (const product of ready) {
    const handle    = productHandle(product);
    const title     = product.seoTitle || product.name || '';
    const bodyHtml  = product.productDescription || '';
    const vendor    = product.vendorId || 'TuguJewelry';
    const type      = product.category || '';
    const tags      = Array.isArray(product.searchTags) ? product.searchTags.join(', ') : '';
    const pvs = vByProd[product.id] || [];

    if (pvs.length === 0) {
      const price     = exportPrice(product);
      const compareAt = exportCompareAtPrice(product);
      rows.push(csvRow([
        handle, title, bodyHtml, vendor, type, tags,
        product.sku || '', price, compareAt, '0',
      ]));
    } else {
      const [first, ...rest] = pvs;
      const firstPrice     = exportPrice(product, first);
      const firstCompareAt = exportCompareAtPrice(product, first);
      rows.push(csvRow([
        handle, title, bodyHtml, vendor, type, tags,
        first.sku || '', firstPrice, firstCompareAt, String(first.stockCount ?? 0),
      ]));
      for (const v of rest) {
        const variantPrice     = exportPrice(product, v);
        const variantCompareAt = exportCompareAtPrice(product, v);
        rows.push(csvRow([
          handle, '', '', '', '', '',
          v.sku || '', variantPrice, variantCompareAt, String(v.stockCount ?? 0),
        ]));
      }
    }
  }

  return rows.join('\r\n');
}

// ─── JSON feed ────────────────────────────────────────────────────────────────

/**
 * Convert READY_FOR_ECOMMERCE products to the e-commerce feed JSON array.
 * Follows the toEcommerceFormat pattern from spec §12.
 * effectivePrice is computed at export time (no active campaign context here).
 *
 * @param {object[]} products
 * @param {object[]} variants
 * @returns {object[]} Array of e-commerce product objects
 */
export function toJSONFeed(products, variants) {
  const ready   = (products || []).filter(p => p.status === 'READY_FOR_ECOMMERCE' || p.status === 'PUBLISHED');
  const vByProd = variantsByProductId(variants);

  return ready.map(product => ({
    externalId:   product.sku,
    title:        product.seoTitle || product.name,
    bodyHtml:     product.productDescription,
    vendor:       product.vendorId || 'TuguJewelry',
    productType:  product.category,
    tags:         product.searchTags || [],
    images:       (product.images || []).map(img => ({
      src: img.url || null,
      alt: img.altText || '',
    })),
    variants: (vByProd[product.id] || []).map(v => ({
      sku:               v.sku,
      price:             exportPrice(product, v),
      compareAtPrice:    exportCompareAtPrice(product, v),
      inventoryQuantity: v.stockCount ?? 0,
      option1:           v.size  ?? null,
      option2:           v.color ?? null,
    })),
    metafields: {
      seo_title:       product.seoTitle       ?? null,
      seo_description: product.seoDescription ?? null,
      material:        product.material       ?? null,
      care:            product.careInstructions ?? null,
    },
    exportedAt: Date.now(),
  }));
}

// ─── Browser download helpers ─────────────────────────────────────────────────

/**
 * Trigger a browser file download for a CSV string.
 */
export function downloadCSV(filename, csvString) {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  _triggerDownload(filename, blob);
}

/**
 * Trigger a browser file download for a JSON-serialisable value.
 */
export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  _triggerDownload(filename, blob);
}

/**
 * Convert products to JSON-LD (Schema.org) Product objects.
 * 
 * @param {object[]} products
 * @param {object[]} variants
 * @param {string} [channel] - Optional channel context for pricing
 * @returns {object[]} Array of JSON-LD Product objects
 */
export function toJsonLD(products, variants, channel = null) {
  const ready   = (products || []).filter(p => p.status === 'READY_FOR_ECOMMERCE' || p.status === 'PUBLISHED');
  const vByProd = variantsByProductId(variants);

  return ready.flatMap(product => {
    const pvs = vByProd[product.id] || [];
    
    // If no variants, create one top-level product LD
    if (pvs.length === 0) {
      return [_buildSingleJsonLD(product, null, channel)];
    }

    // Map each variant to a Product LD (standard for marketplace feeds)
    return pvs.map(v => _buildSingleJsonLD(product, v, channel));
  });
}

function _buildSingleJsonLD(product, variant, channel) {
  const price = exportPrice(product, variant, channel);
  
  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "image": (product.images || []).map(img => img.url),
    "description": product.productDescription,
    "sku": variant?.sku ?? product.sku,
    "brand": {
      "@type": "Brand",
      "name": product.vendorId || "TuguJewelry"
    },
    "offers": {
      "@type": "Offer",
      "url": channel ? `https://marketplace.tugu.dev/p/${product.sku}?channel=${channel}` : undefined,
      "priceCurrency": "USD",
      "price": price,
      "availability": (variant?.stockCount ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "seller": {
        "@type": "Organization",
        "name": product.vendorId || "TuguJewelry"
      }
    }
  };
}

function _triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
