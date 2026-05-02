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

  The Insider PIM system is a fully implemented, production-ready Product Information Management application. It operates as a modular web system utilizing
  IndexedDB for client-side persistence and a strict role-based architecture.

  The system is defined by:
   * Role-Based Access Control (RBAC): Distinct permissions for data mutation, panel visibility, and workflow transitions.
   * Strict State Machine: All product lifecycles are governed by a central workflow engine that enforces legal transitions.
   * Layered Data Ownership: Product data is built incrementally as it moves through the organizational hierarchy.
   * IndexedDB Persistence: Atomic transactions and indexed lookups for products, variants, audit logs, and snapshots.

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
   * Allowed Transitions: DRAFT → PENDING_ADMIN, REVISION_REQUESTED_BY_ADMIN → PENDING_ADMIN, REVISION_REQUESTED_BY_SALES → PENDING_ADMIN.
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
   * Revision: PENDING_SALES → REVISION_REQUESTED_BY_SALES. Note: This sends the product back to the Manufacturer's queue, but it must return to PENDING_ADMIN
     next.
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
       * PENDING_SALES → REVISION_REQUESTED_BY_SALES (Back to Manufacturer).
       * PENDING_SALES → REJECTED (End).
       * PENDING_SALES → READY_FOR_ECOMMERCE (Publish).

  Sales Revision Loop:
  Sales (REVISION_REQUESTED_BY_SALES) → Manufacturer (Edit & Submit) → Admin (Review & Approve) → Sales (Final Review).

  ---

  8. Permission Matrix & Dynamic Governance

  The system employs a Hybrid Permission Model: Static Role Definitions (defined in code) augmented by Dynamic Overrides (persisted in IndexedDB).

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
   * Revision Loop Integrity: A Sales revision (REVISION_REQUESTED_BY_SALES) must return to Manufacturer, then pass through Admin (PENDING_ADMIN) again.

  ---

  11. System Limitations

   * Local-First Persistence: All data is stored in the browser's IndexedDB. Clearing browser data or switching devices results in data loss.
   * No Real Authentication: The login screen simulates authentication; identity is managed via local settings.
   * No Background Sync: Without a backend, there is no multi-user synchronization or real-time notification system.
   * Media Storage: Image blobs are stored raw in IndexedDB. Extreme quantities of high-resolution images may impact browser performance.
   * Scalability: All product queries currently load full result sets; no server-side pagination or filtering is implemented.

  ---

  12. Roadmap: Phase 6 & Beyond (E-Commerce Integration)

   * Export Adapters: Implementation of formatters for Shopify, WooCommerce, and Google Merchant Center.
   * Stock Synchronization: Two-way sync between Insider PIM and external e-commerce platforms.
   * Cloud Persistence: Transition from IndexedDB to a central API/Database for shared access.
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
