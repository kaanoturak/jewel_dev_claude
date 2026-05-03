<!-- 
  FILE PURPOSE: SYSTEM SPECIFICATION (Single Source of Truth)
  - Defines what the system IS: data structures, workflows, roles, validation rules.
  - Updated only when architectural decisions change (rarely).
  - For active development guidance, see PROMPT.md
  - For code analysis reports, see Gemini Code Assist Report.md
-->

# TuguJewelry — Insider PIM System
## Complete Project Document & Architecture Guide
**Version:** 1.0  
**Scope:** Insider System Only (E-commerce Platform: Phase 2)  
**Language:** English (all menus, jargon, field names)  
**Last Updated:** 2026

---

## ⚠️ IMPORTANT: What This Document Is

This is the **single source of truth** for the Insider PIM. It defines every system boundary, data structure, workflow, and UI hierarchy before a single line of code is written. Every development decision should be validated against this document.

---

## TABLE OF CONTENTS

1. Project Overview & Philosophy
2. Development Roadmap (Phased)
3. System Architecture
4. User Roles & Permission Matrix
5. Product System Design
6. Cost Model
7. Product Lifecycle & State Machine
8. Database Schema
9. Variant & SKU System
10. Logging & Versioning
11. Campaign System
12. API Contract Design
13. UI Structure & Page Hierarchy
14. Example Product JSON
15. State Management Approach
16. Data Validation Rules
17. Integration Readiness
18. Pre-Designed Module Placeholders
19. Recommendations & Gap Analysis
20. Glossary

---

## 1. PROJECT OVERVIEW & PHILOSOPHY

### What Is This System?

The **TuguJewelry Insider PIM** (Product Information Management) is a private, internal tool used by three distinct user types — Manufacturer, Admin, and Sales — to manage the full lifecycle of handmade brass jewelry products from creation to final sales-readiness.

It is **not** an e-commerce platform. It is the **back-office engine** that will eventually feed one.

### Core Philosophy

| Principle | What It Means |
|-----------|--------------|
| **Lean but scalable** | No over-engineering today. Clean seams for future expansion. |
| **Structured, not rigid** | Clear workflows with room to adapt |
| **English-first** | All menus, field names, status labels in English — acquisition-ready |
| **Data integrity above all** | Stock, pricing, and approval states are sacred |
| **E-commerce-ready data** | Every field designed with future marketplace export in mind |

### Product Context

Products are **handmade brass jewelry** (rings, necklaces, earrings, bracelets). Material may expand to gold and silver. Visual quality is paramount — photography is a core product asset, not an afterthought.

Reference brand: [tugujewelry on Instagram](https://www.instagram.com/tugujewelry/)

---

## 2. DEVELOPMENT ROADMAP (Phased)

### Phase 0 — Foundation (Before Any UI)
- [ ] Define and lock database schema
- [ ] Define all data types, enums, and validation rules
- [ ] Define API contract structure
- [ ] Set up IndexedDB stores and schema versioning
- [ ] Build state management core module

**Gate:** Schema must be reviewed and signed off before Phase 1 begins.

### Phase 1 — Manufacturer Panel
**Goal:** A manufacturer can create a complete, submission-ready product.

- [ ] Product creation form (all fields)
- [ ] Multi-image upload with ordering
- [ ] Optional video upload
- [ ] SEO content entry
- [ ] Cost entry (material, labor, packaging)
- [ ] Variant system (size, color, custom attributes)
- [ ] Product list view (own products only)
- [ ] Submit product for approval (DRAFT → PENDING_ADMIN)
- [ ] Receive revision requests (status: REVISION_REQUESTED)
- [ ] View revision notes

**Gate:** End-to-end product creation and submission must work completely before Phase 2.

### Phase 2 — Admin Panel
**Goal:** Admin can monitor, enrich, and route products.

- [ ] View all manufacturer products
- [ ] Dashboard: stock overview, submission queue
- [ ] Apply admin cost layers (tax, margin, logistics, marketing)
- [ ] Review and approve → PENDING_SALES
- [ ] Send revision requests to manufacturer
- [ ] Reject products (with reason)
- [ ] Basic cash flow view
- [ ] Access full audit logs
- [ ] View version history per product

**Gate:** Full approval chain (Manufacturer → Admin → Sales) must work.

### Phase 3 — Sales Panel
**Goal:** Sales can decide, price, campaign, and mark products ready.

- [ ] Review products from Admin
- [ ] Approve → READY_FOR_ECOMMERCE
- [ ] Reject → back to Admin (with reason)
- [ ] Request revision from Admin
- [ ] Set final selling price
- [ ] Create campaigns (discount %, fixed, time-based)
- [ ] Mark product as active/paused/archived

### Phase 4 — Super Admin Layer
- [ ] Unrestricted access to all panels
- [ ] Override any field without approval
- [ ] Force state transitions
- [ ] Impersonate any role (read-only view)

### Phase 5 — E-Commerce Integration *(OUT OF SCOPE NOW)*
- Export product feed to e-commerce platform
- Webhook triggers on READY_FOR_ECOMMERCE status
- Sync stock back from e-commerce to Insider

---

## 3. SYSTEM ARCHITECTURE

### High-Level Structure

```
┌─────────────────────────────────────────────────────┐
│                   INSIDER PIM                        │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ Manufacturer│  │    Admin    │  │    Sales    │  │
│  │   Panel     │  │   Panel     │  │   Panel     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │          │
│  ┌──────▼────────────────▼────────────────▼──────┐   │
│  │              Core State Layer                 │   │
│  │    (Reactive state, business logic engine)    │   │
│  └───────────────────────┬───────────────────────┘   │
│                          │                           │
│  ┌───────────────────────▼───────────────────────┐   │
│  │            Data Persistence Layer             │   │
│  │     IndexedDB (offline-first + blob storage)  │   │
│  └───────────────────────┬───────────────────────┘   │
│                          │                           │
│  ┌───────────────────────▼───────────────────────┐   │
│  │            API Adapter Layer                  │   │
│  │    (Pluggable backend connector - future)     │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                          │
                          │ (Phase 5 — future)
                          ▼
              ┌───────────────────────┐
              │   E-Commerce Platform │
              └───────────────────────┘
```

### Module Structure

```
/src
  /core
    state.js          — Central state management
    engine.js         — Business logic (pricing, validation, workflows)
    db.js             — IndexedDB adapter
    api.js            — API contract layer (future backend connector)
    logger.js         — Audit log engine
    validator.js      — Field validation rules

  /modules
    /product          — Product CRUD logic
    /media            — Image/video/model upload + compression
    /cost             — Cost calculation engine
    /workflow         — State machine (lifecycle transitions)
    /campaign         — Discount/campaign engine
    /export           — CSV, JSON-LD, API export formatters
    /auth             — Role resolution and permission checks

  /panels
    /manufacturer     — Manufacturer UI pages
    /admin            — Admin UI pages
    /sales            — Sales UI pages
    /super-admin      — Super admin override UI

  /shared
    /components       — Reusable UI components
    /styles           — Design tokens and base styles
    /utils            — Formatters, helpers, constants
```

---

## 4. USER ROLES & PERMISSION MATRIX

### Role Overview

| Role | Code | Panel Access | Can Override Workflow? |
|------|------|-------------|----------------------|
| Manufacturer | `MANUFACTURER` | Manufacturer only | No |
| Admin | `ADMIN` | Admin (read-only view of manufacturer data) | Partially |
| Sales | `SALES` | Sales only | No |
| Super Admin | `SUPER_ADMIN` | All panels | Yes — everything |

### Permission Matrix

| Action | Manufacturer | Admin | Sales | Super Admin |
|--------|:-----------:|:-----:|:-----:|:-----------:|
| Create product | ✅ | ❌ | ❌ | ✅ |
| Edit own draft | ✅ | ❌ | ❌ | ✅ |
| Submit for approval | ✅ | ❌ | ❌ | ✅ |
| View own products | ✅ | ❌ | ❌ | ✅ |
| View all products | ❌ | ✅ | ❌ | ✅ |
| View sales products | ❌ | ❌ | ✅ | ✅ |
| Apply admin cost layers | ❌ | ✅ | ❌ | ✅ |
| Approve to PENDING_SALES | ❌ | ✅ | ❌ | ✅ |
| Reject product | ❌ | ✅ | ✅ | ✅ |
| Request revision | ❌ | ✅ | ✅ | ✅ |
| Set final selling price | ❌ | ❌ | ✅ | ✅ |
| Create campaigns | ❌ | ❌ | ✅ | ✅ |
| Mark READY_FOR_ECOMMERCE | ❌ | ❌ | ✅ | ✅ |
| Override any state | ❌ | ❌ | ❌ | ✅ |
| View audit logs | ❌ | ✅ | ❌ | ✅ |
| View version history | ❌ | ✅ | ✅ | ✅ |
| Manage users | ❌ | ❌ | ❌ | ✅ |
| See other panel's UI | ❌ | ❌ | ❌ | ✅ |
| See final pricing | ❌ | ✅ | ✅ | ✅ |
| See manufacturer cost | ✅ | ✅ | ❌ | ✅ |

> **Critical:** Manufacturer sees ONLY their own products and ONLY manufacturer-level cost fields. Sales sees ONLY the transfer price from Admin, never the raw cost breakdown.

---

## 5. PRODUCT SYSTEM DESIGN

### 5.1 Core Product Fields

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `id` | UUID | ✅ | Auto-generated |
| `sku` | String | ✅ | Auto-generated, unique |
| `name` | String | ✅ | Product display name |
| `category` | Enum | ✅ | Ring, Necklace, Earring, Bracelet, Brooch, Other |
| `material` | Enum | ✅ | Brass (default), Gold, Silver, Mixed |
| `collection` | String | ❌ | Optional grouping |
| `status` | Enum | ✅ | Product lifecycle status |
| `createdBy` | UserID | ✅ | Manufacturer who created it |
| `createdAt` | Timestamp | ✅ | Auto |
| `updatedBy` | UserID | ✅ | Last editor |
| `updatedAt` | Timestamp | ✅ | Auto |
| `archivedAt` | Timestamp | ❌ | Soft delete timestamp |
| `version` | Integer | ✅ | Increments on every save |

### 5.2 Content Fields

| Field | Type | Required | Visible To | Notes |
|-------|------|:--------:|------------|-------|
| `seoTitle` | String (max 70 chars) | ✅ | All | Google-optimized title |
| `seoDescription` | String (max 160 chars) | ✅ | All | Meta description |
| `marketingDescription` | Text | ✅ | All | Ad copy (Google/Meta ready) |
| `productDescription` | Text | ✅ | All | Full product description |
| `materials` | Text | ❌ | All | Materials detail |
| `careInstructions` | Text | ❌ | All | Cleaning, storage |
| `searchTags` | String[] | ❌ | All | For internal search |

### 5.3 Media Fields

| Field | Type | Required | Notes |
|-------|------|:--------:|-------|
| `images` | MediaObject[] | ✅ | Min 1, recommended 4-8 |
| `primaryImageIndex` | Integer | ✅ | Index of hero image in images array |
| `video` | MediaObject | ❌ | Max 50MB, MP4/MOV |

**MediaObject structure:**
```json
{
  "id": "uuid",
  "url": "blob-url-or-cdn-url",
  "blob": "<Blob — stored in IDB>",
  "format": "webp",
  "originalFilename": "ring_front.jpg",
  "width": 1200,
  "height": 1200,
  "sizeBytes": 245000,
  "uploadedAt": "2026-01-15T10:00:00Z",
  "altText": "Brass signet ring, front view"
}
```

**Recommendation:** Always compress and convert hero images to WebP via Web Worker. Store blobs in IndexedDB. For video, validate file size before accepting.

### 5.4 Variants

Products can have one or more variants. Variants share the parent product's content and media but have independent SKUs and stock.

**Variant fields:**

| Field | Type | Required |
|-------|------|:--------:|
| `variantId` | UUID | ✅ |
| `sku` | String | ✅ Auto |
| `size` | String | ❌ |
| `color` | String | ❌ |
| `weight` | Number (grams) | ❌ |
| `customAttributes` | Key-Value[] | ❌ |
| `stockCount` | Integer ≥ 0 | ✅ |
| `isActive` | Boolean | ✅ |

If a product has no variants defined, a **default variant** is auto-created.

---

## 6. COST MODEL

### Philosophy
This is a **workshop cost calculator**, not an accounting system. Keep it practical.

### 6.1 Manufacturer Cost Layer
Entered by the Manufacturer. Visible to Manufacturer and Admin only.

| Cost Item | Field | Type | Required |
|-----------|-------|------|:--------:|
| Material cost | `costMaterial` | Number (USD) | ✅ |
| Labor cost | `costLabor` | Number (USD) | ✅ |
| Packaging cost | `costPackaging` | Number (USD) | ❌ |
| **Total Base Cost** | `costBase` | Calculated | — |

`costBase = costMaterial + costLabor + costPackaging`

### 6.2 Admin Cost Layer
Added by Admin on top of manufacturer base. Visible to Admin and Sales only (as a transfer price, not itemized breakdown).

| Cost Item | Field | Type | Required |
|-----------|-------|------|:--------:|
| Tax (%) | `adminTaxPct` | Number | ❌ |
| Target margin (%) | `adminMarginPct` | Number | ✅ |
| Logistics (flat) | `adminLogisticsCost` | Number | ❌ |
| Marketing allocation | `adminMarketingCost` | Number | ❌ |
| Miscellaneous | `adminMiscCost` | Number | ❌ |
| **Transfer Price** | `transferPrice` | Calculated | — |

`transferPrice = (costBase × (1 + taxPct/100)) + logisticsCost + marketingCost + miscCost`  
`transferPrice = transferPrice × (1 + marginPct/100)`

### 6.3 Sales Pricing Layer
Set by Sales. Final price visible to all.

| Field | Type | Notes |
|-------|------|-------|
| `sellingPrice` | Number | Base selling price set by Sales |
| `compareAtPrice` | Number | Optional "was" price |
| `activeCampaignId` | UUID | If a campaign is active |
| `effectivePrice` | Calculated | Final price after any campaign discount |

### 6.4 Pricing Visibility Rules

| Who Sees | costBase | transferPrice | sellingPrice |
|----------|:--------:|:-------------:|:------------:|
| Manufacturer | ✅ (own) | ❌ | ❌ |
| Admin | ✅ (all) | ✅ | ✅ |
| Sales | ❌ | ✅ (as "Admin Price") | ✅ |
| Super Admin | ✅ | ✅ | ✅ |

---

## 7. PRODUCT LIFECYCLE & STATE MACHINE

### Status Enum
```
DRAFT
PENDING_ADMIN
REVISION_REQUESTED_BY_ADMIN
PENDING_SALES
REVISION_REQUESTED_BY_SALES
READY_FOR_ECOMMERCE
REJECTED
ARCHIVED
```

### State Machine Diagram

```
[Manufacturer]
     │
     ▼
  DRAFT ──────────────────────────────────┐
     │                                    │
  (Submit)                          (Edit & re-submit)
     │                                    │
     ▼                                    │
PENDING_ADMIN                             │
     │                                    │
  ┌──┴────────────────┐                   │
  │                   │                   │
(Approve)        (Request Revision)   (Reject)
  │                   │                   │
  ▼                   ▼                   ▼
PENDING_SALES   REVISION_REQUESTED   REJECTED (terminal)
                _BY_ADMIN                  
     │               │
     │           [Manufacturer edits → re-submits]
  ┌──┴────────────────┐
  │                   │
(Approve)       (Request Revision / Reject)
  │                   │              │
  ▼                   ▼              ▼
READY_FOR_    REVISION_REQUESTED  REJECTED
ECOMMERCE     _BY_SALES

[Sales → back to Admin if revision needed]
```

### Transition Rules

| From | To | Triggered By | Notes |
|------|----|-------------|-------|
| DRAFT | PENDING_ADMIN | Manufacturer | All required fields must be valid |
| PENDING_ADMIN | PENDING_SALES | Admin | Admin cost layer must be complete |
| PENDING_ADMIN | REVISION_REQUESTED_BY_ADMIN | Admin | Must include revision notes |
| PENDING_ADMIN | REJECTED | Admin | Must include rejection reason |
| REVISION_REQUESTED_BY_ADMIN | PENDING_ADMIN | Manufacturer | After edits |
| PENDING_SALES | READY_FOR_ECOMMERCE | Sales | Selling price must be set |
| PENDING_SALES | REVISION_REQUESTED_BY_SALES | Sales | Must include notes |
| PENDING_SALES | REJECTED | Sales | Must include reason |
| REVISION_REQUESTED_BY_SALES | PENDING_SALES | Admin | After corrections |
| Any | ARCHIVED | Admin or Super Admin | Soft delete |
| Any | Any | Super Admin | Override — no restrictions |

**Rules:**
- No stage can be skipped (except Super Admin)
- Every transition creates a version snapshot
- Every transition is logged with who, what, and when
- REJECTED is terminal — product cannot be re-submitted from REJECTED (must be duplicated as new DRAFT)
- ARCHIVED products are hidden by default but recoverable

---

## 8. DATABASE SCHEMA

### IndexedDB Store Design

#### Store: `products`
Primary key: `id` (UUID)
```
products {
  id:                 UUID (keyPath)
  sku:                String (unique index)
  parentProductId:    UUID | null        — future: for product families
  name:               String
  category:           Enum
  material:           Enum
  collection:         String | null
  status:             Enum
  version:            Integer
  createdBy:          UserID
  createdAt:          Timestamp
  updatedBy:          UserID
  updatedAt:          Timestamp
  archivedAt:         Timestamp | null
  
  — Content —
  seoTitle:           String
  seoDescription:     String
  marketingDescription: Text
  productDescription: Text
  materials:          String | null
  careInstructions:   String | null
  searchTags:         String[]
  
  — Media —
  images:             MediaObject[]
  primaryImageIndex:  Integer
  video:              MediaObject | null
  
  — Manufacturer Cost —
  costMaterial:       Number
  costLabor:          Number
  costPackaging:      Number
  costBase:           Number (calculated)
  
  — Admin Cost —
  adminTaxPct:        Number | null
  adminMarginPct:     Number | null
  adminLogisticsCost: Number | null
  adminMarketingCost: Number | null
  adminMiscCost:      Number | null
  transferPrice:      Number | null (calculated)
  
  — Sales Pricing —
  sellingPrice:       Number | null
  compareAtPrice:     Number | null
  activeCampaignId:   UUID | null
  
  — Workflow —
  revisionNotes:      String | null       — latest revision request notes
  rejectionReason:    String | null
  adminReviewedBy:    UserID | null
  adminReviewedAt:    Timestamp | null
  salesReviewedBy:    UserID | null
  salesReviewedAt:    Timestamp | null
}
```

#### Store: `variants`
Primary key: `variantId`
Index: `productId` (for querying all variants of a product)
```
variants {
  variantId:          UUID (keyPath)
  productId:          UUID (index)
  sku:                String (unique index)
  size:               String | null
  color:              String | null
  weight:             Number | null
  customAttributes:   { key: String, value: String }[]
  stockCount:         Integer >= 0
  isActive:           Boolean
  costMaterial:       Number | null   — per-variant override; hydrated from product on first boot
  costLabor:          Number | null
  costPackaging:      Number | null
  transferPrice:      Number | null   — computed by calculateVariantTransferPrice(); updated when Admin saves costs
  sellingPrice:       Number | null   — per-variant override; falls back to product.sellingPrice
  compareAtPrice:     Number | null
  createdAt:          Timestamp
  updatedAt:          Timestamp
}
```

#### Store: `auditLog`
Primary key: `logId` (auto-increment)
Indexes: `productId`, `userId`, `timestamp`
```
auditLog {
  logId:              Integer (keyPath, auto-increment)
  productId:          UUID
  variantId:          UUID | null
  userId:             UserID
  userRole:           Enum
  action:             String            — e.g. "STATUS_CHANGE", "FIELD_UPDATE", "IMAGE_UPLOAD"
  fromStatus:         Enum | null
  toStatus:           Enum | null
  changedFields:      { field: String, oldValue: Any, newValue: Any }[]
  notes:              String | null      — revision/rejection notes
  timestamp:          Timestamp
  sessionId:          String             — for grouping bulk edits
}
```

#### Store: `productVersions`
Primary key: `versionId`
Index: `productId`
```
productVersions {
  versionId:          UUID (keyPath)
  productId:          UUID (index)
  versionNumber:      Integer
  snapshotData:       Object            — full product snapshot (deep copy)
  triggeredByAction:  String
  triggeredBy:        UserID
  triggeredAt:        Timestamp
}
```

#### Store: `campaigns`
Primary key: `campaignId`
Index: `productId`
```
campaigns {
  campaignId:         UUID (keyPath)
  name:               String
  discountType:       Enum             — PERCENTAGE | FIXED
  discountValue:      Number
  appliesTo:          Enum             — PRODUCT | VARIANT
  productId:          UUID | null
  variantId:          UUID | null
  startsAt:           Timestamp
  endsAt:             Timestamp | null
  isActive:           Boolean
  createdBy:          UserID
  createdAt:          Timestamp
}
```

#### Store: `users`
Primary key: `userId`
```
users {
  userId:             UUID (keyPath)
  email:              String (unique)
  displayName:        String
  role:               Enum             — MANUFACTURER | ADMIN | SALES | SUPER_ADMIN
  isActive:           Boolean
  createdAt:          Timestamp
  lastLoginAt:        Timestamp | null
}
```

#### Store: `settings`
Primary key: `settingId` (key string)
```
settings {
  settingId:          String (keyPath)  — e.g. "skuPrefix", "currentUser"
  value:              Any
  updatedAt:          Timestamp
}
```

#### Store: `mediaBlobs`
Primary key: `blobId` (UUID)
Index: `productId`
```
mediaBlobs {
  blobId:             UUID (keyPath)
  productId:          UUID (index)
  blob:               Blob              — actual binary data
  format:             String
  sizeBytes:          Integer
  createdAt:          Timestamp
}
```
> **Note:** MediaObject in `products` store holds metadata only. Actual blobs live here to keep the products store lean.

---

## 9. VARIANT & SKU SYSTEM

### SKU Format
```
[PREFIX]-[CATEGORY]-[MATERIAL]-[SEQUENCE]-[VARIANT]

Examples:
TGJ-RNG-BRS-00001       — Parent product (brass ring, sequence 1)
TGJ-RNG-BRS-00001-S925  — Variant: size 9.25
TGJ-RNG-BRS-00001-CGD   — Variant: color gold
TGJ-NCK-BRS-00042       — Necklace #42

PREFIX:   TGJ (configurable — "Tugu Jewelry")
CATEGORY: RNG | NCK | ERR | BRC | BRS | OTH
MATERIAL: BRS | GLD | SLV | MIX
SEQUENCE: Zero-padded 5-digit auto-increment
VARIANT:  Free-form suffix, max 6 chars
```

### SKU Rules
- SKU is auto-generated and non-editable after creation
- Each variant gets its own unique SKU derived from the parent
- SKU is never reused even after archiving
- SKU sequence is stored in `settings` store and atomically incremented

---

## 10. LOGGING & VERSIONING SYSTEM

### Audit Log — What Gets Logged

| Action | Logged |
|--------|--------|
| Product created | ✅ |
| Any field updated | ✅ (field name, old value, new value) |
| Status transition | ✅ (from, to, by whom, notes) |
| Image uploaded/deleted | ✅ |
| Variant added/modified | ✅ |
| Campaign created/modified | ✅ |
| Cost layer applied | ✅ |
| Super admin override | ✅ (flagged separately) |

### Version Snapshots
A full deep-copy snapshot of the product is saved to `productVersions` on every **status transition**. Field-level edits within a status are captured by the audit log but do not create new snapshots (to prevent bloat).

**Snapshot triggers:**
- DRAFT → PENDING_ADMIN
- PENDING_ADMIN → PENDING_SALES
- PENDING_ADMIN → REVISION_REQUESTED_BY_ADMIN
- PENDING_SALES → READY_FOR_ECOMMERCE
- PENDING_SALES → REVISION_REQUESTED_BY_SALES
- Any → ARCHIVED

### Rollback
Logical rollback is supported: Super Admin can load any previous version snapshot and overwrite the current product data. This creates a new audit log entry tagged as `ROLLBACK`.

---

## 11. CAMPAIGN SYSTEM

### Campaign Types
| Type | How It Works | Example |
|------|-------------|---------|
| PERCENTAGE | Subtract X% from selling price | "15% off" |
| FIXED | Subtract fixed amount from selling price | "$10 off" |

### Campaign Rules
- Only Sales and Super Admin can create campaigns
- A campaign can target a whole product or a specific variant
- Time-based: `startsAt` and `endsAt` define active window. `null` endsAt = open-ended
- Only one active campaign per product/variant at a time
- Effective price is always calculated at render time, never stored (to avoid stale data)
- `effectivePrice = max(0, sellingPrice - discount)`
- Campaign must not bring price below zero

### Effective Price Formula
```javascript
function getEffectivePrice(product, campaign) {
  if (!campaign || !campaign.isActive) return product.sellingPrice;
  const now = Date.now();
  if (campaign.startsAt > now) return product.sellingPrice;
  if (campaign.endsAt && campaign.endsAt < now) return product.sellingPrice;
  
  if (campaign.discountType === 'PERCENTAGE') {
    return Math.max(0, product.sellingPrice * (1 - campaign.discountValue / 100));
  }
  if (campaign.discountType === 'FIXED') {
    return Math.max(0, product.sellingPrice - campaign.discountValue);
  }
  return product.sellingPrice;
}
```

---

## 12. API CONTRACT DESIGN

Even though there is no backend yet, all data operations should go through a consistent API adapter layer. This allows plugging in a real backend later with zero UI changes.

### API Adapter Pattern
```javascript
// src/core/api.js
const API = {
  // Products
  getProduct:       (id) => DB.get('products', id),
  getAllProducts:    (filters) => DB.query('products', filters),
  saveProduct:      (product) => DB.put('products', product),
  archiveProduct:   (id) => DB.patch('products', id, { archivedAt: Date.now() }),
  
  // Variants
  getVariants:      (productId) => DB.queryByIndex('variants', 'productId', productId),
  saveVariant:      (variant) => DB.put('variants', variant),
  
  // Audit
  logAction:        (entry) => DB.add('auditLog', entry),
  getAuditLog:      (productId) => DB.queryByIndex('auditLog', 'productId', productId),
  
  // Versions
  saveVersion:      (snapshot) => DB.put('productVersions', snapshot),
  getVersions:      (productId) => DB.queryByIndex('productVersions', 'productId', productId),
  
  // Campaigns
  saveCampaign:     (campaign) => DB.put('campaigns', campaign),
  getCampaigns:     (productId) => DB.queryByIndex('campaigns', 'productId', productId),
};
```

### Export Schema (E-Commerce Ready Format)
```javascript
// Used when exporting to e-commerce platform in Phase 5
function toEcommerceFormat(product, variants, campaign) {
  return {
    externalId:    product.sku,
    title:         product.seoTitle,
    bodyHtml:      product.productDescription,
    vendor:        "TuguJewelry",
    productType:   product.category,
    tags:          product.searchTags,
    images:        product.images.map(img => ({ src: img.url, alt: img.altText })),
    variants:      variants.map(v => ({
      sku:         v.sku,
      price:       getEffectivePrice(product, campaign),
      compareAtPrice: product.compareAtPrice,
      inventoryQuantity: v.stockCount,
      option1:     v.size,
      option2:     v.color,
    })),
    metafields: {
      seo_title:        product.seoTitle,
      seo_description:  product.seoDescription,
      material:         product.material,
      care:             product.careInstructions,
    }
  };
}
```

---

## 13. UI STRUCTURE & PAGE HIERARCHY

### Manufacturer Panel

```
/manufacturer
  /dashboard              — Product list, submission queue, revision alerts
  /products
    /new                  — New product form
    /:id/edit             — Edit product (only DRAFT or REVISION_REQUESTED)
    /:id                  — View product detail (read-only if submitted)
  /account                — Basic profile settings
```

**Dashboard widgets:**
- My Products (list with status badges)
- Pending Revisions (count + list)
- Recently Submitted

**Product Form — Tab Structure:**
1. **Basic Info** — Name, category, material, collection
2. **Media** — Image upload (drag & drop, order by drag), video
3. **Description** — SEO title, SEO desc, marketing desc, product desc
4. **Variants** — Size, color, stock, weight (add multiple)
5. **Costs** — Material, labor, packaging
6. **Review & Submit** — Summary before submission

---

### Admin Panel

```
/admin
  /dashboard              — Overview: queue counts, stock alerts, cash flow summary
  /products
    /queue                — PENDING_ADMIN list (action required)
    /all                  — All products, all statuses
    /:id                  — Product detail + admin cost layer form
    /:id/history          — Version history
    /:id/log              — Audit log
  /stock                  — Stock overview across all products/variants
  /cashflow               — Basic cash flow view
  /users                  — User management (view only, super admin edits)
```

**Product Detail (Admin view) — sections:**
1. Product summary (manufacturer data, read-only)
2. Admin cost layer form (editable)
3. Calculated transfer price preview
4. Action bar: Approve → Sales | Request Revision | Reject

---

### Sales Panel

```
/sales
  /dashboard              — Incoming from Admin, active products, campaign status
  /products
    /incoming             — PENDING_SALES queue
    /active               — READY_FOR_ECOMMERCE products
    /all                  — Full list
    /:id                  — Product detail + pricing + campaign
  /campaigns
    /new                  — Create campaign
    /:campaignId/edit     — Edit campaign
    /active               — Active campaigns
```

**Product Detail (Sales view) — sections:**
1. Product summary (admin transfer price visible, raw costs hidden)
2. Selling price setting
3. Campaign assignment
4. Action bar: Approve | Reject | Request Revision from Admin

---

### Super Admin Panel

```
/super-admin
  /dashboard              — System-wide overview
  /users                  — Full user management (CRUD)
  /products               — All products, all statuses, override access
  /logs                   — Full audit log across all products and users
  /settings               — SKU prefix, system config
```

---

## 14. EXAMPLE PRODUCT JSON

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "sku": "TGJ-RNG-BRS-00001",
  "name": "Signet Ring No.1",
  "category": "Ring",
  "material": "Brass",
  "collection": "Archetype Series",
  "status": "PENDING_SALES",
  "version": 4,

  "seoTitle": "Handmade Brass Signet Ring | TuguJewelry Archetype Series",
  "seoDescription": "Hand-crafted brass signet ring from TuguJewelry's Archetype Series. Unique, durable, and timeless. Ships worldwide.",
  "marketingDescription": "Wearable sculpture for everyday life. Each piece cast by hand in solid brass — no two are exactly alike.",
  "productDescription": "The Signet Ring No.1 is the cornerstone of the Archetype Series...",
  "materials": "Solid brass, hand-polished. May be plated on request.",
  "careInstructions": "Polish with a soft cloth. Avoid prolonged contact with water.",
  "searchTags": ["brass", "signet", "ring", "handmade", "archetype"],

  "images": [
    {
      "id": "img-001",
      "url": "blob:...",
      "format": "webp",
      "originalFilename": "signet_front.jpg",
      "width": 1200,
      "height": 1200,
      "sizeBytes": 183000,
      "altText": "Brass signet ring, front view",
      "uploadedAt": "2026-01-10T09:00:00Z"
    }
  ],
  "primaryImageIndex": 0,
  "video": null,

  "costMaterial": 4.50,
  "costLabor": 8.00,
  "costPackaging": 1.00,
  "costBase": 13.50,

  "adminTaxPct": 18,
  "adminMarginPct": 40,
  "adminLogisticsCost": 2.50,
  "adminMarketingCost": 1.50,
  "adminMiscCost": 0,
  "transferPrice": 27.14,

  "sellingPrice": 49.00,
  "compareAtPrice": 59.00,
  "activeCampaignId": null,

  "revisionNotes": null,
  "rejectionReason": null,
  "adminReviewedBy": "user-admin-001",
  "adminReviewedAt": "2026-01-12T14:00:00Z",
  "salesReviewedBy": null,
  "salesReviewedAt": null,

  "createdBy": "user-mfr-001",
  "createdAt": "2026-01-10T09:00:00Z",
  "updatedBy": "user-admin-001",
  "updatedAt": "2026-01-12T14:00:00Z",
  "archivedAt": null
}
```

**Variant example:**
```json
{
  "variantId": "var-001",
  "productId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "sku": "TGJ-RNG-BRS-00001-S900",
  "size": "9.00",
  "color": null,
  "weight": 8.2,
  "customAttributes": [],
  "stockCount": 3,
  "isActive": true,
  "createdAt": "2026-01-10T09:00:00Z",
  "updatedAt": "2026-01-10T09:00:00Z"
}
```

---

## 15. STATE MANAGEMENT APPROACH

### Pattern: Centralized Reactive Store with Selective Recalculation

```
User Action
    │
    ▼
Action Handler (role-validated)
    │
    ├─ Validate input
    ├─ Apply business logic
    │
    ▼
State.set(key, value)
    │
    ├─ Is this a COST_FIELD? → Trigger Engine.calculate()
    ├─ Is this a UI_ONLY_FIELD? → Skip recalculation
    │
    ▼
State.notify(changedKey)
    │
    ├─ Render.update(changedKey) — targeted DOM update
    └─ Logger.record(action, diff) — async, non-blocking
```

### Key Design Principles

**Input Protection Layer:**
Before updating any input element, always check:
```javascript
if (document.activeElement === inputElement) return; // user is typing
if (inputElement.value === newFormattedValue) return; // no change
```

**Cost Fields vs UI Fields:**
```javascript
const COST_FIELDS = new Set([
  'costMaterial','costLabor','costPackaging',
  'adminTaxPct','adminMarginPct','adminLogisticsCost',
  'adminMarketingCost','adminMiscCost',
  'sellingPrice','compareAtPrice'
]);
// Only these fields trigger Engine.calculate()
```

**Role Enforcement in State:**
```javascript
State.set(key, value, userId) {
  const user = Auth.getCurrentUser();
  if (!Auth.canEdit(user.role, key)) {
    Logger.warn(`${user.role} attempted to set ${key} — denied`);
    return;
  }
  // ... proceed
}
```

---

## 16. DATA VALIDATION RULES

### Product Form Validation

| Field | Rule | Error Message |
|-------|------|--------------|
| `name` | Required, 2–120 chars | "Product name is required" |
| `category` | Must be valid enum value | "Please select a category" |
| `material` | Must be valid enum value | "Please select a material" |
| `seoTitle` | Required, max 70 chars | "SEO title is required (max 70 chars)" |
| `seoDescription` | Required, max 160 chars | "SEO description required (max 160 chars)" |
| `marketingDescription` | Required, min 50 chars | "Marketing description required (min 50 chars)" |
| `productDescription` | Required, min 100 chars | "Product description required (min 100 chars)" |
| `images` | Min 1 image required | "At least one product image is required" |
| `costMaterial` | Required, > 0 | "Material cost must be greater than 0" |
| `costLabor` | Required, ≥ 0 | "Labor cost is required" |
| `costPackaging` | Optional, ≥ 0 | — |

### Variant Validation

| Field | Rule |
|-------|------|
| `stockCount` | Required, integer ≥ 0 |
| `size` | Optional, max 20 chars |
| `color` | Optional, max 30 chars |
| At least one variant | Must exist |

### Cost Validation

| Field | Rule |
|-------|------|
| `adminMarginPct` | Required for admin layer, 0–1000 |
| `adminTaxPct` | Optional, 0–100 |
| `sellingPrice` | Required for sales layer, > 0 |
| `sellingPrice` | Must be ≥ transferPrice (warn if below — not block) |

### Global Rules
- No negative stock
- SKU uniqueness enforced at save time
- All status transitions must be logged or they are rejected
- Image upload: max 20MB per image (before compression), min 600px on shortest side
- Video upload: max 50MB, MP4 or MOV only

---

## 17. INTEGRATION READINESS

### E-Commerce Export Format

Every product is designed to produce a valid Shopify-compatible + Google Merchant-compatible export without transformation:

| Insider Field | Shopify Field | Google Merchant |
|--------------|---------------|-----------------|
| `seoTitle` | Title | title |
| `seoDescription` | Body (truncated) | description |
| `sku` | Variant SKU | id |
| `sellingPrice` | Variant Price | price |
| `compareAtPrice` | Variant Compare At | — |
| `stockCount` | Inventory Quantity | availability |
| `category` | Product Type | product_type |
| `searchTags` | Tags | custom_label_0 |
| `images[0].url` | Image Src | image_link |
| `material` | Metafield | material |

### JSON-LD Schema (auto-generated)
Every product auto-generates a `schema.org/Product` JSON-LD block ready to be embedded in any e-commerce product page.

### API Endpoints (Design Only — No Backend Yet)
```
GET    /api/products             — List (with filters)
GET    /api/products/:id         — Single product
POST   /api/products             — Create
PATCH  /api/products/:id         — Update fields
POST   /api/products/:id/submit  — Status transition
GET    /api/products/:id/versions — Version history
GET    /api/products/:id/log      — Audit log
POST   /api/campaigns            — Create campaign
GET    /api/export/shopify        — Bulk Shopify CSV
GET    /api/export/feed           — Product feed JSON
```

---

## 18. PRE-DESIGNED MODULE PLACEHOLDERS

これらのモジュールは、フェーズ1-4では**設計されていますが実装されていません**。UIプレースホルダーは存在すべきですが、「近日公開」とマークされるべきです。

### A. サプライヤー管理
- 原材料サプライヤー（真鍮ソース、パッケージング）の追跡
- サプライヤーを製品材料コストにリンク
- サプライヤーの連絡先 + リードタイムフィールド

### B. AI支援記述ジェネレーター
- 入力：製品名、材料、寸法、タグ
- 出力：推奨SEOタイトル、SEO記述、マーケティングコピー
- 構造化プロンプトを介してAnthropic API (Claude)を使用
- 製造業者は提案を採用、編集、または拒否できる

### C. バルク編集ツール
- 複数の製品を選択 → ステータス変更を適用
- 選択範囲全体で一括価格調整（%または固定）
- バルクキャンペーン割り当て

### D. 分析ダッシュボード (Admin)
- 売れ筋製品（eコマース接続後）
- 承認サイクルタイムの追跡
- 在庫回転率

---

## 19. 勧告とギャップ分析

### ✅ あなたの概要から確認済み（すでに含まれています）

- 厳格な役割の分離を備えた3パネルアーキテクチャ
- シンプルなワークショップコストモデル（財務会計ではない）
- 初日からeコマース対応のデータ構造
- ステージスキップのない製品ライフサイクルステートマシン
- ソフトデリート / アーカイブのみ
- すべてのUI言語は英語
- オフラインファースト運用のためのIndexedDB
- 画像処理のためのWebワーカー

### 🔧 見つかった問題と修正済み

**問題1 — 修正フローの明確化**
元の概要では、管理者が「製造業者」に修正リクエストを返しますが、販売も「管理者」に修正を返し、製造業者には返さないようになっています。これは現在ステートマシンで明確化されています：販売 → 管理者（製造業者ではない）への修正。管理者はさらに製造業者にプッシュするかどうかを決定します。

**問題2 — 在庫の一貫性**
在庫は製品レベルではなく、バリアントレベルで存在します。これは、「サイズ7のリング」に5ユニットあっても、「サイズ9」には0ユニットである可能性があるため重要です。システムはこれを強制します。在庫の変更はアトミックにロックされる必要があります（部分的な更新なし）。

**問題3 — メディアBlobの分離**
IndexedDBの製品オブジェクトに画像blobを直接保存すると、製品を一覧表示する際に深刻なパフォーマンスの問題が発生します。MediaObjectメタデータは製品に残りますが、実際のblobはIDによって参照される専用の`mediaBlobs`ストアに配置されます。

**問題4 — 価格の可視性の漏洩**
元の仕様では、販売パネルに何が表示されるかが定義されていませんでした。現在は、明示的に`transferPrice`（「管理者価格」とラベル付け）のみを表示し、生のコスト内訳（材料、労務など）は表示しません。

### 💡 新しい勧告

**勧告1 — 修正ノートフィールド**
修正をリクエストしたり拒否したりするときは、常に書面による理由を要求してください。理由がない場合はアクションなし。これにより、コンテキストのないやり取りを防ぎます。

**勧告2 — 画像の代替テキスト**
すべての画像には編集可能な`altText`フィールドが必要です。これは、製品がeコマースに送られる際のアクセシビリティとSEOにとって重要です。

**勧告3 — compareAtPrice (以前の価格)**
これを販売価格レイヤーに追加します。これはeコマースのコンバージョンとShopifyの互換性のための重要なフィールドです。

**勧告4 — ステータスバッジの一貫性**
すべてのパネルで正確なステータス文字列をバッジとして使用してください（PENDING_ADMIN、READY_FOR_ECOMMERCEなど）。パネルごとに名前を変更しないでください。サポート中に混乱を招きます。

**勧告5 — 最小画像仕様**
アップロード時に最小解像度チェックを追加してください（最短辺で600px以上）。低品質の画像はeコマースプラットフォームのパフォーマンスを低下させます。

**勧告6 — デフォルトバリアント**
製造業者が明示的なバリアント（「フリーサイズ、1色」など）なしで製品を作成した場合、システムは`DEFAULT`バリアントを自動作成する必要があります。これにより、下流でのヌルポインタの問題が防止されます。

**勧告7 — コレクションフィールド**
製品をシリーズ（例：「Archetype Series」、「Minimal Series」）にグループ化するためのオプションの`collection`フィールドを追加します。eコマースカタログのナビゲーションに便利で、実装も複雑ではありません。

**勧告8 — キャンペーン終了日Null = 無期限**
終了日のない時間ベースのキャンペーンは、手動で停止されるまで無期限に実行されるべきです。常に終了日を要求するよりもシンプルです。

---

## 20. 用語集

| 用語 | 定義 |
|------|-----------|
| **Insider PIM** | このドキュメントで説明されているプライベートな内部システム |
| **E-Commerce Platform** | 将来の顧客向けストア — フェーズ2、範囲外 |
| **Manufacturer** | 製品を作るワークショップ/職人 |
| **Transfer Price** | 管理者が計算して販売に送信する価格（すべての管理者コストレイヤーを含む） |
| **Effective Price** | 顧客が実際に目にする最終価格（キャンペーン後） |
| **State Machine** | 製品ステータスの厳格なワークフロー — ステージスキップなし |
| **Soft Delete** | レコードを完全に削除するのではなく、アーカイブすること |
| **Variant** | 製品の特定のバージョン（例：異なるサイズや色） |
| **Version Snapshot** | 各ステータス遷移時に保存される製品データの完全なコピー |
| **Audit Log** | システムで行われたすべてのアクションの記録 |
| **READY_FOR_ECOMMERCE** | 承認済みの最終状態 — 製品を公開する準備ができている |
| **SUPER_ADMIN** | 制限のない役割 — あらゆるワークフローをオーバーライドできる |

---

*TuguJewelry Insider PIM v1.0用に作成されたドキュメント*  
*すべてのeコマース機能はフェーズ5に明示的に延期されました。*  
*開発シーケンス：フェーズ0（スキーマ）→ フェーズ1（製造業者）→ フェーズ2（管理者）→ フェーズ3（販売）→ フェーズ4（スーパー管理者）*
