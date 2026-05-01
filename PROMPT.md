# TuguJewelry PIM — Active Session Guide

## Read this first, every session
- Full spec: tugu-pim-project-v1_1.md
- This file tells you where we are and what to do next

## Current Phase
🔄 IN PROGRESS: Bug fixes — 3 known issues remain

## Completed
### Phase 0 — Core
- [x] src/core/db.js — IndexedDB schema, all 8 stores, atomicIncrement
- [x] src/core/engine.js — costBase, transferPrice, effectivePrice (pure functions)
- [x] src/core/logger.js — audit log writer, fire-and-forget, never throws
- [x] src/core/state.js — reactive store, role-gated writes, COST_FIELDS trigger recalc
- [x] src/core/validator.js — PRODUCT_SCHEMA, VARIANT_SCHEMA, MANUFACTURER_COST_SCHEMA, ADMIN_COST_SCHEMA
- [x] src/modules/product/sku.js — generateProductSKU, generateVariantSKU, parseSKU
- [x] src/modules/auth/index.js — full permission matrix, canEdit/canView/canTransition
- [x] src/modules/workflow/index.js — state machine, ALLOWED_TRANSITIONS, TERMINAL_STATUSES
- [x] src/modules/cost/index.js — computeCosts, formatCost
- [x] test/db.test.js — 40 passing checks

### Phase 1 — Manufacturer Panel
- [x] src/shared/utils/index.js — generateUUID, formatCurrency, formatDate, formatRelativeTime, truncate, statusBadge, el(), STATUS_META, constants
- [x] src/shared/styles/index.css — full design tokens, layout, badges, cards, tables, buttons, login screen
- [x] index.html — minimal app shell, links CSS, loads app.js module
- [x] src/app.js — boot, Auth.init, role-based panel routing, dev role selector
- [x] src/panels/manufacturer/index.js — panel shell, sidebar nav, internal router
- [x] src/panels/manufacturer/dashboard.js — stat cards, revision alerts, products table, empty state
- [x] src/panels/manufacturer/product-form.js — 6-tab form, all spec §5 fields, validate(), transition() on submit
- [x] src/panels/manufacturer/product-view.js — read-only detail, revision notes, Edit button for DRAFT/REVISION_REQUESTED

### Phase 2 — Admin Panel
- [x] src/panels/admin/index.js — panel shell, nav: Dashboard, Review Queue, All Products, Stock, Audit Log
- [x] src/panels/admin/dashboard.js — stat cards, recently submitted queue, out-of-stock alerts
- [x] src/panels/admin/product-queue.js — dual mode (queue/all), status+search filter, Review+View buttons
- [x] src/panels/admin/product-detail.js — read-only mfr summary + editable admin cost form + live transferPrice preview + Approve/Revision/Reject action bar
- [x] src/panels/admin/stock-view.js — all variants with stock counts, level filter, search
- [x] src/panels/admin/audit-log.js — full audit log viewer, action filter, search

### Phase 3 — Sales Panel
- [x] src/panels/sales/index.js — panel shell, nav: Dashboard, Incoming Queue, Active Products, New Campaign
- [x] src/panels/sales/dashboard.js — stat cards, incoming queue preview table
- [x] src/panels/sales/product-queue.js — dual mode (queue/active), PENDING_SALES + READY_FOR_ECOMMERCE lists
- [x] src/panels/sales/product-detail.js — admin price display + selling price + compareAtPrice + campaign selector + effectivePrice preview + Approve/Revision/Reject action bar
- [x] src/panels/sales/campaign-form.js — create/edit campaigns, PERCENTAGE/FIXED, date range, product scope selector

### Phase 4 — Super Admin Panel
- [x] src/panels/super-admin/index.js — panel shell, nav: Dashboard, Users, Override
- [x] src/panels/super-admin/dashboard.js — system stats, status breakdown, recent products
- [x] src/panels/super-admin/user-management.js — full user CRUD: create, edit, activate/deactivate
- [x] src/panels/super-admin/override.js — product search, force any status transition, notes, audit logged

### Phase 5 — Wire up
- [x] src/app.js — all 4 panels mounted via dynamic import: MANUFACTURER, ADMIN, SALES, SUPER_ADMIN
- [x] PROMPT.md — all phases marked complete

### Post-Phase Bug Fixes Applied
- [x] workflow/index.js — `_validateProductReadiness` no longer blocks REVISION_REQUESTED_BY_SALES → PENDING_SALES
- [x] manufacturer/product-form.js — per-variant cost fields with shared/per-variant toggle
- [x] admin/product-detail.js — transfer price preview uses `body.querySelector()` (not `document.getElementById()`); `_collectAdminCosts` takes container param
- [ ] sales/product-detail.js — BUG B: `descDiv.textContent` must be `descDiv.innerHTML`
- [ ] admin/product-queue.js — BUG A: `_fetchProducts` function missing (crash)
- [ ] manufacturer/dashboard.js + admin/product-queue.js — BUG C: no image thumbnails in table rows

## Known Bugs — Fix in This Order

### BUG A — CRASH: `_fetchProducts` undefined in admin/product-queue.js
- **File:** `src/panels/admin/product-queue.js`
- **Problem:** `_fetchProducts(mode)` is called at line 23 but never defined. Causes
  `ReferenceError` — admin Review Queue and All Products views crash immediately.
- **Fix:** Add the function before `render()`:
  ```js
  async function _fetchProducts(mode) {
    if (mode === 'queue') return DB.queryByIndex('products', 'status', 'PENDING_ADMIN');
    return DB.getAll('products');
  }
  ```

### BUG B — WRONG: Sales panel productDescription still shows raw tags
- **File:** `src/panels/sales/product-detail.js`, line 113
- **Problem:** `descDiv.textContent = product.productDescription || '—'` — `textContent`
  escapes HTML, so `<p>Hello</p>` renders as literal `&lt;p&gt;Hello&lt;/p&gt;`.
- **Fix:** Change to `descDiv.innerHTML = product.productDescription || '—'` and remove
  `white-space:pre-wrap` from `descDiv.style.cssText` (rich HTML handles its own whitespace).

### BUG C — MISSING: No image thumbnails in product list tables
- **Files:** `src/panels/manufacturer/dashboard.js`, `src/panels/admin/product-queue.js`
- **Problem:** Product table rows show name + SKU only — no thumbnail image.
- **Fix:** In each row, create a 36×40 `<img>` element; async-load the primary blob via
  `DB.queryByIndex('mediaBlobs', 'productId', product.id)`, match `b.blobId === primaryImgMeta.id`,
  then set `thumb.src = URL.createObjectURL(blob.blob)`. Place thumb alongside the product-name div.
  Also add `esc` to `manufacturer/dashboard.js` imports.

## Next Task — Resume Here
Fix BUG A first (crash), then BUG B (wrong render), then BUG C (missing thumbnails).
After each fix: `git add -A && git commit -m "fix: ..." && git push origin main`

## Key Implementation Notes
- All workflow transitions: `import { transition } from '../../modules/workflow/index.js'`
- All validation: `import { validate, PRODUCT_SCHEMA, ... } from '../../core/validator.js'`
- Product queries: `DB.queryByIndex('products', 'status', 'PENDING_ADMIN')` — status is indexed
- Notes are REQUIRED for REVISION_REQUESTED_* and REJECTED transitions (workflow enforces this)
- Admin cost layer save: use `DB.patch('products', id, { adminTaxPct, adminMarginPct, ... })` before calling transition
- Sales selling price save: use `DB.patch('products', id, { sellingPrice, compareAtPrice })` before calling transition
- Super Admin override: call `transition()` with SUPER_ADMIN user — workflow bypasses ALLOWED_TRANSITIONS for that role
- Image blobs: store in mediaBlobs store with blobId; MediaObject on product holds metadata only
- campaign effectivePrice: never stored, always computed at render time via `getEffectivePrice(product, campaign)` from engine.js

## CSS Classes Already Available (src/shared/styles/index.css)
Layouts: .panel, .sidebar, .panel-main, .panel-header, .panel-content
Components: .btn, .btn--primary/secondary/danger/ghost/sm, .badge, .badge--[color]
Dashboard: .stat-cards, .stat-card, .stat-card--alert, .section, .section-header, .section-title
Tables: .card, .products-table, .product-name, .product-actions
Lists: .revision-list, .revision-item
Empty state: .empty-state, .empty-state__icon/title/desc
Sidebar: .sidebar-brand, .sidebar-nav, .nav-link (active), .nav-icon, .sidebar-footer
Alerts: (not yet added — add to CSS when building forms)
Forms: (not yet added — add to CSS when building forms)

## Rules
- No placeholder UI, no TODO comments, no mock data
- All workflow transitions must call workflow.transition()
- All forms must validate via validator.js before submitting
- End session with: ✅ ALL PHASES COMPLETE or 🔄 IN PROGRESS: [next file]
