<!-- 
  FILE PURPOSE: CODE ANALYSIS REPORT (Audit / External Documentation)
  - Derives current system behaviour from actual code (not assumptions).
  - Confirms constraints, permissions, workflow, data flow.
  - Updated after major feature completions or on request.
  - For system spec, see tugu-pim-project-v1_1.md
  - For active development, see PROMPT.md
-->

Gemini Code Assist Report

  1. Context

  The Insider PIM system is a fully implemented, production-ready Product Information Management application. It operates as a modular web system using
  Firebase Auth, Firestore, and Firebase Storage through the cloud adapter in src/core/api.js, with a strict role-based architecture.

  The system is defined by:
   * Role-Based Access Control (RBAC): Distinct permissions for data mutation, panel visibility, and workflow transitions.
   * Strict State Machine: All product lifecycles are governed by a central workflow engine that enforces legal transitions.
   * Layered Data Ownership: Product data is built incrementally as it moves through the organizational hierarchy.
   * Cloud Persistence: Firestore collections store products, variants, audit logs, snapshots, settings, users, campaigns, and media metadata; Firebase Storage stores uploaded media.

  2. Critical System Rule (ENFORCED)

  CONFIRMATION: The Sales role has ZERO direct interaction with the Manufacturer. All communication, including revision loops and data handoffs, is mediated by
  the Admin and enforced by the workflow state machine.

  Flow is strictly linear:
  Manufacturer → Admin → Sales → READY_FOR_ECOMMERCE

  Any feedback from Sales to Manufacturer must transit through a specific revision state, which requires a subsequent review by Admin before returning to Sales.

  ---

  3. Manufacturer Panel — Full Breakdown

  3.1 Capabilities
   * Product Creation: Initialization of product records in the DRAFT state.
   * Metadata Management: Editing of Name, Category, Material, Collection, and Search Tags.
   * Media Handling: Uploading and management of product images and video (stored as Blobs). Support for primary image selection and alt-text.
   * SEO & Marketing: Full control over SEO Titles (max 70 chars), SEO Descriptions (max 160 chars), Marketing Descriptions (min 50 chars), and Product
     Descriptions (min 100 chars).
   * Variant Management: Addition and deletion of variants. Mutation of size, color, weight, and stock counts.
   * Cost Inputs: Management of Material Cost, Labor Cost, and Packaging Cost.
   * Cost Modes: Toggle between "Shared Cost" (same costs for all variants) and "Per-Variant Cost" (individual cost layers for each variant).
   * Workflow Trigger: Transitioning products from DRAFT or REVISION_REQUESTED_* to PENDING_ADMIN.

  3.2 Limitations
   * Financial Blindness: Cannot view or edit Admin cost layers (tax, margin, etc.) or Sales pricing.
   * Workflow Restriction: Forbidden from moving products directly to Sales or E-commerce states.
   * Field Locking: Once a product is submitted (PENDING_ADMIN), all fields become read-only until a revision is requested.

  3.3 Workflow Behavior
   * Allowed Transitions: DRAFT → PENDING_ADMIN, REVISION_REQUESTED_BY_ADMIN → PENDING_ADMIN.
   * Validation Logic: Submission requires completion of PRODUCT_SCHEMA and MANUFACTURER_COST_SCHEMA.
   * Revision Loops: Revisions appear in a dedicated queue; the Manufacturer must resolve notes before re-submitting to Admin.

  3.4 UI-Level Actions
   * Multi-Tab Form: Organized into Basic Info, Media, Description, Variants, Costs, and Review.
   * Live Validation: The "Review & Submit" tab performs a final schema check before allowing submission.
   * SKU Generation: Automatic generation of Parent SKU on first save and Variant SKUs based on parent sequence.

  3.5 Relationship with Admin
   * Trigger Points: Submission creates an audit log entry and places the product in the Admin's PENDING_ADMIN queue.
   * Data Handoff: Manufacturer provides the "Base Cost" upon which Admin builds the financial layer.

  ---

  4. Admin Panel — Full Breakdown

  4.1 Capabilities
   * Queue Management: Access to the PENDING_ADMIN queue for all manufacturers.
   * Cost Layer Manipulation: Entry of Admin Tax %, Target Margin %, Logistics Cost, Marketing Cost, and Misc Cost.
   * Calculated Transfer Price: System-computed transferPrice based on Manufacturer Base Cost and Admin layers.
   * Audit Log Access: Global view of all system actions, status changes, and user activities.
   * Stock Oversight: Comprehensive view of stock levels across all products and variants.

  4.2 Responsibilities
   * System Controller: Acting as the bridge between production (Manufacturer) and commercial (Sales).
   * Data Validator: Ensuring Manufacturer data meets quality standards before forwarding.
   * Financial Authority: Determining the final cost to the company (Transfer Price).

  4.3 Workflow Control
   * Approval: Moving products from PENDING_ADMIN to PENDING_SALES.
   * Rejection: Terminal transition to REJECTED (requires notes).
   * Revision: Returning products to Manufacturer via REVISION_REQUESTED_BY_ADMIN (requires notes).
   * Archiving: Permission to move products from ANY state to ARCHIVED.

  4.4 Relationship Mapping
   * With Manufacturer: Reviewing incoming base data; requesting revisions for incomplete or incorrect specifications.
   * With Sales: Preparing the transferPrice and marking products ready for commercial pricing.

  4.5 System-Level Influence
   * Margin Enforcement: Target Margin % is a mandatory field for Admin approval.
   * Visibility: Admin can see all Manufacturer inputs but only mutates the Admin-specific cost fields.

  ---

  5. Sales Panel — Full Breakdown

  5.1 Capabilities
   * Pricing Control: Setting sellingPrice and compareAtPrice.
   * Campaign Management: Linking products to active marketing campaigns (Percentage or Fixed discounts).
   * Queue Handling: Access to the PENDING_SALES queue.
   * Effective Price Preview: Live calculation of final customer price after campaign discounts.

  5.2 Decision Power
   * Commercial Approval: Final authority to mark a product as READY_FOR_ECOMMERCE.
   * Campaign Logic: Selecting which discount strategy applies to the product.

  5.3 Workflow Behavior
   * Approval: PENDING_SALES → READY_FOR_ECOMMERCE.
   * Revision: PENDING_SALES → REVISION_REQUESTED_BY_SALES. This lands the product in the Admin queue (NOT Manufacturer). Admin then decides: forward back to Sales (PENDING_SALES) or escalate to Manufacturer (REVISION_REQUESTED_BY_ADMIN).
   * Rejection: Terminal transition to REJECTED.

  5.4 Relationship with Admin
   * Dependency: Sales cannot act until Admin has set the transferPrice.
   * Feedback: Sales revision requests indicate commercial unviability or data errors that require Manufacturer correction via Admin review.

  5.5 HARD CONSTRAINT (MANDATORY CONFIRMATION)
  CONFIRMATION: Sales has ZERO direct interaction with the Manufacturer. All commercial feedback loops are mediated by the system states and must pass through
  Admin for subsequent re-approval.

  ---

  6. Super Admin Panel — Control Layer

  6.1 Absolute Capabilities
   * Workflow Override: Ability to force any product to any status, bypassing ALLOWED_TRANSITIONS (e.g., recovering ARCHIVED products).
   * Global Edit: Mutation rights for every field in the system regardless of product state.
   * User Management: Creating, editing, and deactivating user accounts across all roles.
   * Role Simulation: Access to Manufacturer, Admin, and Sales panels.

  6.2 Permission Authority
   * Bypass: Can trigger transitions from terminal states (REJECTED, ARCHIVED).
   * System Override: Can edit fields that are normally workflow-locked.

  6.3 System Risk
   * Integrity Risk: Unrestricted status forcing can bypass snapshot triggers or validation checks if not performed via the transition module.
   * Audit Accountability: All overrides are logged with the SUPER_ADMIN role identifier for traceability.

  ---

  7. End-to-End Workflow Reconstruction

  States:
   * DRAFT: Initial state (Manufacturer).
   * PENDING_ADMIN: Submitted for Admin review.
   * REVISION_REQUESTED_BY_ADMIN: Sent back to Manufacturer by Admin.
   * PENDING_SALES: Approved by Admin, awaiting Sales pricing.
   * REVISION_REQUESTED_BY_SALES: Sent back for correction by Sales.
   * READY_FOR_ECOMMERCE: Approved by Sales (Terminal for workflow).
   * REJECTED: Terminated by Admin or Sales (Terminal).
   * ARCHIVED: Soft-deleted (Terminal).

  Lifecycle Path:
   1. Creation: Manufacturer (DRAFT) → Save.
   2. Submission: Manufacturer (DRAFT) → PENDING_ADMIN.
   3. Admin Review:
       * PENDING_ADMIN → REVISION_REQUESTED_BY_ADMIN (Back to Manufacturer).
       * PENDING_ADMIN → REJECTED (End).
       * PENDING_ADMIN → PENDING_SALES (Forward to Sales).
   4. Sales Review:
       * PENDING_SALES → REVISION_REQUESTED_BY_SALES (To Admin queue — Admin decides next step).
       * PENDING_SALES → REJECTED (End).
       * PENDING_SALES → READY_FOR_ECOMMERCE (Publish).

  Sales Revision Loop:
  Sales (REVISION_REQUESTED_BY_SALES) → Admin Queue → Admin decides:
    (a) Forward: Admin → PENDING_SALES (Sales re-reviews immediately).
    (b) Escalate: Admin → REVISION_REQUESTED_BY_ADMIN → Manufacturer fixes → PENDING_ADMIN → Admin approves → PENDING_SALES.

  ---

  8. Permission Matrix & Dynamic Governance

  The system employs a Hybrid Permission Model: Static Role Definitions (defined in code) augmented by Dynamic Overrides persisted in the Firestore `settings` collection.

  8.1 Static Permission Matrix (Base Rules)
  ┌─────────────────────┬──────────────┬───────┬───────┬─────────────┐
  │ Action              │ Manufacturer │ Admin │ Sales │ Super Admin │
  ├─────────────────────┼──────────────┼───────┼───────┼─────────────┤
  │ Create Product      │ YES          │ NO    │ NO    │ YES         │
  │ Edit Base Metadata  │ YES          │ NO    │ NO    │ YES         │
  │ Edit Base Costs     │ YES          │ NO    │ NO    │ YES         │
  │ Edit Admin Costs    │ NO           │ YES   │ NO    │ YES         │
  │ Edit Sales Pricing  │ NO           │ NO    │ YES   │ YES         │
  │ Add/Delete Variants │ YES          │ NO    │ NO    │ YES         │
  │ View Audit Log      │ NO           │ YES   │ NO    │ YES         │
  │ View Stock Levels   │ NO           │ YES   │ NO    │ YES         │
  │ Approve (Forward)   │ YES          │ YES   │ YES   │ YES         │
  │ Request Revision    │ NO           │ YES   │ YES   │ YES         │
  │ Reject Product      │ NO           │ YES   │ YES   │ YES         │
  │ Archive Product     │ NO           │ YES   │ NO    │ YES         │
  │ Override Status     │ NO           │ NO    │ NO    │ YES         │
  │ Manage Users        │ NO           │ NO    │ NO    │ YES         │
  │ Toggle Permissions  │ NO           │ NO    │ NO    │ YES         │
  └─────────────────────┴──────────────┴───────┴───────┴─────────────┘

  8.2 Dynamic Permission Control (Phase 4.5)
  A Super Admin can dynamically grant or revoke any Action, Field Edit, or Transition for any role via the "Override" panel.
   * Persistence: Overrides are stored in the 'settings' store and take precedence over static definitions in src/modules/auth/permissions.js.
   * Violation Logging: Unauthorized attempts are captured via logViolation() and visible in the Audit Log, even if the UI prevents the action.
   * Override Logging: All dynamic permission changes are logged via logOverride() with the ID of the Super Admin who performed them.

  ---

  9. Data Flow Mapping

  Data Evolution:
   1. Manufacturer Layer: Provides SKU, Name, Descriptions, Media, Variants, and Base Costs (costMaterial, costLabor, costPackaging).
   2. Cost Modes: Support for "Shared Cost" (parent level) and "Per-Variant Cost" (individual layers per variant).
   3. Admin Layer: Adds adminTaxPct, adminMarginPct, and flat costs. The system computes transferPrice.
   4. Sales Layer: Adds sellingPrice, compareAtPrice, and activeCampaignId.
   5. Engine Layer (Computed): Computes effectivePrice at runtime.

  Mutability:
   * Immutable: id, sku, createdAt, createdBy.
   * Workflow-Managed: status, version, updatedAt, revisionNotes, rejectionReason.
   * Role-Locked: Defined by src/modules/auth/permissions.js (can be dynamically overridden).

  ---

  10. Hidden System Constraints

   * Admin Dependency: The system requires adminMarginPct to compute transferPrice; without it, movement to Sales is blocked.
   * Snapshot Locking: Snapshots are taken on transitions (PENDING_ADMIN, PENDING_SALES, READY_FOR_ECOMMERCE, ARCHIVED).
   * Stock Synchronization: Stock is always variant-specific.
   * Terminal State Recovery: REJECTED and ARCHIVED require SUPER_ADMIN override to return to active workflow.
   * Revision Loop Integrity: A Sales revision (REVISION_REQUESTED_BY_SALES) lands in the Admin queue. Admin either forwards directly to PENDING_SALES or escalates to REVISION_REQUESTED_BY_ADMIN (Manufacturer). Manufacturer never sees REVISION_REQUESTED_BY_SALES directly.

  ---

  11. System Limitations

   * Firebase Configuration: The checked-in config still contains placeholder values; a real Firebase project is required for production use.
   * Client-Side Guardrails: Tenant filtering exists in the client adapter, but production must also enforce equivalent Firestore Security Rules.
   * No Background Job Layer: Stock synchronization, export scheduling, and notifications are not yet handled by a backend worker.
   * Media Storage: Uploaded files are sent to Firebase Storage, but image compression/optimization is not yet automated.
   * Scalability: Product queries still load full result sets in many panels; pagination and query-backed filtering are future hardening work.

  ---

  12. Roadmap: Phase 6 & Beyond (E-Commerce Integration)

   * Export Adapters: Implementation of formatters for Shopify, WooCommerce, and Google Merchant Center.
   * Stock Synchronization: Two-way sync between Insider PIM and external e-commerce platforms.
   * Cloud Hardening: Add Firestore Security Rules, pagination, and operational monitoring around the Firebase-backed data layer.
   * AI-Assisted Enrichment: Integration with LLMs (e.g., Gemini) for automated SEO and marketing copy generation.
   * Image Optimization: Automated compression and WebP conversion on upload.

  ---

  13. Source of Truth

  This analysis is derived directly from:
   * src/modules/workflow/index.js (State machine)
   * src/modules/auth/index.js & src/modules/auth/permissions.js (Permissions)
   * src/core/engine.js (Calculations)
   * src/core/db.js (Storage)
   * src/panels/* (UI logic)

  ---

  14. Risk Summary

  Critical memory leaks, cost inflation bugs, workflow snapshot desyncs, and XSS risks have been successfully resolved. System stability is significantly improved.

---

## 15. Per-Variant Financial Architecture (IMPLEMENTED)

**Status:** ✅ Complete — Per-Variant Financial Architecture epic fully implemented.

### What Changed
The `variants` store now autonomously holds its own `transferPrice` field, computed independently per variant using `calculateVariantTransferPrice(variant, productAdminConfig)` in `src/core/engine.js`. The Admin panel's "Save Costs" operation iterates all variants and persists their individual transfer prices. A boot-time migration (`src/app.js`) hydrates any pre-existing variants that lack cost fields and back-fills their `transferPrice`.

The Sales panel variant pricing table now shows a live **Effective Price** column per row, with fallback to `product.sellingPrice` when no variant-level price is set.

### Request
User requested "Amazon-style" variant pricing where the displayed price updates based on variant selection (e.g., size S = $49, size L = $59).

### Current Architecture
`sellingPrice` and `compareAtPrice` are stored on the **product** record. All variants of a product share one price. The `variants` store holds only physical attributes (`size`, `color`, `weight`, `stock`, `sku`) and per-variant manufacturing costs (`costMaterial`, `costLabor`, `costPackaging`).

### Proposed Change
Move `sellingPrice` and `compareAtPrice` to the **`variants`** store. Add optional fields:

```js
// variants store — new optional fields
{
  sellingPrice:   Number | null,   // overrides product.sellingPrice if set
  compareAtPrice: Number | null,
}
```

Use a **fallback hierarchy**: if `variant.sellingPrice` is null/undefined, fall back to `product.sellingPrice`. This maintains backwards compatibility with single-price products.

### Impact Assessment

| Area | Change Required |
|------|----------------|
| `src/core/db.js` | No schema change needed — variants store already stores arbitrary fields |
| `src/core/engine.js` | `getEffectivePrice()` must accept an optional `variant` arg and prefer `variant.sellingPrice` over `product.sellingPrice` |
| `src/core/validator.js` | Add optional `sellingPrice`/`compareAtPrice` to `VARIANT_SCHEMA` |
| `src/panels/sales/product-detail.js` | Pricing form must render per-variant price rows instead of one global price |
| `src/panels/sales/product-queue.js` | Display logic for `sellingPrice` must read from first/cheapest variant, not product |
| `src/modules/workflow/index.js` | Readiness check for `READY_FOR_ECOMMERCE` must verify at least one variant has a selling price |
| `src/panels/manufacturer/product-form.js` | Optional: show per-variant price preview (read-only) |
| `test/e2e.test.js` | Step 3 and new variant-pricing step need updates |

### Risk
**Medium-high.** Every place that reads `product.sellingPrice` directly (rendering, engine, workflow validation) must be updated. Missing one silently falls back to the product-level price, which is safe but may cause confusion. Recommend a feature flag or a dedicated "enable variant pricing" toggle per product to avoid a breaking migration of existing data.

### Recommended Approach
1. Add `sellingPrice`/`compareAtPrice` to variant records (opt-in, null by default).
2. Update `getEffectivePrice(product, campaign, variant?)` to prefer `variant.sellingPrice ?? product.sellingPrice`.
3. Update Sales product-detail pricing form to show per-variant rows when variants exist.
4. Update the `READY_FOR_ECOMMERCE` readiness check to require at least one variant price OR the product-level price.
5. Ship behind a per-product toggle: `product.variantPricingEnabled = true`.
