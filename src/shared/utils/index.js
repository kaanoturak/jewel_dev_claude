// ─── UUID ─────────────────────────────────────────────────────────────────────

export function generateUUID() {
  return crypto.randomUUID();
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatDate(timestamp) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(timestamp));
}

export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return '—';
  const diff = Date.now() - timestamp;
  if (diff < 60_000)          return 'Just now';
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000)  return `${Math.floor(diff / 86_400_000)}d ago`;
  return formatDate(timestamp);
}

export function truncate(str, maxLength = 60) {
  if (!str || typeof str !== 'string') return '';
  const t = str.trim();
  return t.length <= maxLength ? t : t.slice(0, maxLength - 1) + '…';
}

// ─── Domain constants ─────────────────────────────────────────────────────────

export const PRODUCT_STATUSES = Object.freeze([
  'DRAFT',
  'PENDING_ADMIN',
  'REVISION_REQUESTED_BY_ADMIN',
  'PENDING_SALES',
  'REVISION_REQUESTED_BY_SALES',
  'READY_FOR_ECOMMERCE',
  'REJECTED',
  'ARCHIVED',
]);

export const USER_ROLES = Object.freeze([
  'MANUFACTURER', 'ADMIN', 'SALES', 'SUPER_ADMIN',
]);

export const PRODUCT_CATEGORIES = Object.freeze([
  'Ring', 'Necklace', 'Earring', 'Bracelet', 'Brooch', 'Other',
]);

export const PRODUCT_MATERIALS = Object.freeze([
  'Brass', 'Gold', 'Silver', 'Mixed',
]);

// STATUS_META: human-readable label + CSS colour modifier for .badge--[color]
// Labels use the exact spec strings — no panel-specific renaming (spec §19 Rec 4).
export const STATUS_META = Object.freeze({
  DRAFT:                       { label: 'Draft',                color: 'gray'   },
  PENDING_ADMIN:               { label: 'Pending Admin',        color: 'blue'   },
  REVISION_REQUESTED_BY_ADMIN: { label: 'Revision Requested',   color: 'amber'  },
  PENDING_SALES:               { label: 'Pending Sales',        color: 'indigo' },
  REVISION_REQUESTED_BY_SALES: { label: 'Sales Revision',       color: 'amber'  },
  READY_FOR_ECOMMERCE:         { label: 'Ready for E-Commerce', color: 'green'  },
  REJECTED:                    { label: 'Rejected',             color: 'red'    },
  ARCHIVED:                    { label: 'Archived',             color: 'stone'  },
});

// ─── Lightweight DOM helpers ──────────────────────────────────────────────────

/**
 * Create and return a DOM element.
 *   el('button', { className: 'btn', onClick: handler }, 'Save')
 * Supports: className, dataset:{}, on[Event], and any HTML attribute string.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className')       node.className = v;
    else if (k === 'dataset')    Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else                         node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/**
 * Return a <span class="badge badge--[color]"> element for a product status.
 * Falls back to a gray badge for unknown statuses.
 */
export function statusBadge(status) {
  const meta  = STATUS_META[status] ?? { label: status, color: 'gray' };
  const span  = document.createElement('span');
  span.className   = `badge badge--${meta.color}`;
  span.textContent = meta.label;
  return span;
}

/**
 * Escape HTML special characters to prevent XSS when interpolating
 * into innerHTML (Section 19 Rec 1).
 */
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize user-supplied HTML for safe innerHTML rendering.
 * Strips <script> blocks, event-handler attributes, and javascript: URIs
 * while preserving basic formatting tags (p, b, ul, li, etc.).
 */
export function safeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/javascript\s*:/gi, 'nojs:');
}
