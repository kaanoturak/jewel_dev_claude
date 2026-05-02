<!-- 
  FILE PURPOSE: ACTIVE SESSION GUIDE (LLM & Developer)
  - Tells you where we are, what to do next, implementation status.
  - Updated after every development task (commits, new features, fixes).
  - For system specification, see tugu-pim-project-v1_1.md
  - For code analysis snapshot, see Gemini Code Assist Report.md
-->

# TuguJewelry PIM — Active Session Guide

## Read this first, every session
- Full spec: tugu-pim-project-v1_1.md
- This file tells you where we are and what to do next

## Current Phase
✅ ALL PHASES COMPLETE — production-ready for internal use

## System State (as of last session)
- Full 4-role lifecycle working: MANUFACTURER → ADMIN → SALES → SUPER_ADMIN
- All workflow transitions enforced by both auth (canTransition) and state machine (ALLOWED_TRANSITIONS)
- All role panels fully implemented with read/write views, forms, and action bars
- Test suite: db.test.js (40 checks), e2e.test.js (6 test groups, full lifecycle)
- No known bugs

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
- [x] src/panels/manufacturer/dashboard.js — stat cards, revision alerts, products table, onboarding empty state
- [x] src/panels/manufacturer/product-form.js — 6-tab form, all spec §5 fields, validate(), transition() on submit
- [x] src/panels/manufacturer/product-view.js — read-only detail, revision notes, Edit + Resubmit buttons

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
- [x] src/panels/super-admin/dashboard.js — system stats, status breakdown, recent products, live permission matrix
- [x] src/panels/super-admin/user-management.js — full user CRUD: create, edit, activate/deactivate
- [x] src/panels/super-admin/override.js — product search, force any status transition, notes, audit logged, dynamic permission toggles

### Phase 4.5 — Dynamic Permission Control
- [x] src/modules/auth/permissions.js — centralized action/field/transition definitions
- [x] src/modules/auth/index.js — dynamic override support, `canDo` action guard, persistent setting store
- [x] src/core/logger.js — `logViolation` and `logOverride` support for audit trail
- [x] test/e2e.test.js — new test blocks (7, 8, 9) for permission enforcement, dynamic toggles, and violation logging

### Phase 5 — Wire up
- [x] src/app.js — all 4 panels mounted via dynamic import: MANUFACTURER, ADMIN, SALES, SUPER_ADMIN
- [x] PROMPT.md — all phases marked complete

### Post-Phase Fixes & Improvements
- [x] workflow/index.js — `_validateProductReadiness` no longer blocks REVISION_REQUESTED_BY_SALES → PENDING_ADMIN
- [x] manufacturer/product-form.js — per-variant cost fields with shared/per-variant toggle
- [x] admin/product-detail.js — transfer price preview uses `body.querySelector()` (not `document.getElementById()`)
- [x] sales/product-detail.js — `descDiv.innerHTML` renders rich HTML; `white-space:pre-wrap` removed
- [x] admin/product-queue.js — `_fetchProducts` defined, loads PENDING_ADMIN for queue / all products for all-mode
- [x] manufacturer/dashboard.js + admin/product-queue.js — async blob thumbnails per row; `esc()` XSS protection
- [x] manufacturer/product-view.js — REVISION_REQUESTED_BY_SALES in EDITABLE_STATUSES; Sales revision alert; "Resubmit to Admin" button
- [x] manufacturer/dashboard.js — onboarding empty state for first-time users; N+1 thumbnail replaced with queryByIndex
- [x] modules/auth/index.js — MANUFACTURER_TRANSITIONS: `REVISION_REQUESTED_BY_SALES:PENDING_ADMIN` added; dead ADMIN_TRANSITIONS entry removed
- [x] modules/workflow/index.js — REVISION_REQUESTED_BY_SALES routes to `['PENDING_ADMIN', 'ARCHIVED']`
- [x] test/e2e.test.js — testStep6 covers full Sales revision loop through PENDING_ADMIN

## Next Task — Resume Here
Nothing remaining. All phases complete and all known issues resolved.

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

## Known Limitations (Phase 6 scope)
- No real authentication — login screen accepts any credentials; user identity is stored in IndexedDB settings
- No server-side persistence — all data is in browser IndexedDB, lost on clear/different browser
- No e-commerce export — READY_FOR_ECOMMERCE status is terminal; no Shopify/WooCommerce push yet
- No image compression — blobs stored raw; large images may stress IndexedDB on some browsers
- No pagination — all product queries load full result sets into memory
- No stock update UI — stock counts visible in Admin Stock view but only editable via direct DB writes
- No notification system — revision requests are visible only when user actively opens the panel

## What Phase 6 (E-Commerce Integration) Will Need
- Export adapter: read READY_FOR_ECOMMERCE products + campaigns, format for target platform (Shopify/WooCommerce)
- Webhook or polling to sync stock levels back from the platform into IndexedDB
- A new `PUBLISHED` status after READY_FOR_ECOMMERCE (optional — depends on platform integration)
- Real auth: JWT or session token, server-side user store
- Optionally: backend API replacing IndexedDB for multi-device / multi-user shared state

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
