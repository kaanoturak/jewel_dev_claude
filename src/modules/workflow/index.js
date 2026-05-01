import DB                                          from '../../core/db.js';
import { logAction }                               from '../../core/logger.js';
import { validate }                                from '../../core/validator.js';
import { PRODUCT_SCHEMA, MANUFACTURER_COST_SCHEMA,
         ADMIN_COST_SCHEMA }                       from '../../core/validator.js';
import { getCurrentUser, canTransition }           from '../auth/index.js';

// ─── State machine definition (Section 7) ────────────────────────────────────

/**
 * Legal transitions for non-SUPER_ADMIN roles.
 * SUPER_ADMIN bypasses this map entirely (all transitions allowed).
 */
export const ALLOWED_TRANSITIONS = {
  DRAFT:                       ['PENDING_ADMIN'],
  PENDING_ADMIN:               ['PENDING_SALES', 'REVISION_REQUESTED_BY_ADMIN', 'REJECTED', 'ARCHIVED'],
  REVISION_REQUESTED_BY_ADMIN: ['PENDING_ADMIN', 'ARCHIVED'],
  PENDING_SALES:               ['READY_FOR_ECOMMERCE', 'REVISION_REQUESTED_BY_SALES', 'REJECTED', 'ARCHIVED'],
  REVISION_REQUESTED_BY_SALES: ['PENDING_ADMIN', 'ARCHIVED'],
  READY_FOR_ECOMMERCE:         ['ARCHIVED'],
  REJECTED:                    [],  // Terminal for non-SUPER_ADMIN
  ARCHIVED:                    [],  // Soft-delete; recoverable only by SUPER_ADMIN override
};

/**
 * Statuses from which non-SUPER_ADMIN roles cannot initiate any transition.
 */
export const TERMINAL_STATUSES = new Set(['REJECTED', 'ARCHIVED']);

// ─── Snapshot triggers (Section 10) ──────────────────────────────────────────
// Full product snapshots are written on these specific transitions.

const SNAPSHOT_TRIGGERS = new Set([
  'DRAFT:PENDING_ADMIN',
  'PENDING_ADMIN:PENDING_SALES',
  'PENDING_ADMIN:REVISION_REQUESTED_BY_ADMIN',
  'PENDING_SALES:READY_FOR_ECOMMERCE',
  'PENDING_SALES:REVISION_REQUESTED_BY_SALES',
]);
// Archiving always triggers a snapshot regardless of fromStatus.

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _requireNotes(toStatus, notes) {
  const needsNotes = [
    'REVISION_REQUESTED_BY_ADMIN',
    'REVISION_REQUESTED_BY_SALES',
    'REJECTED',
  ];
  if (needsNotes.includes(toStatus) && (!notes || !notes.trim())) {
    throw new Error(`A reason is required when transitioning to "${toStatus}"`);
  }
}

function _validateProductReadiness(product, toStatus) {
  if (toStatus === 'PENDING_ADMIN') {
    const r1 = validate(PRODUCT_SCHEMA, product);
    const r2 = validate(MANUFACTURER_COST_SCHEMA, product);
    const allErrors = { ...r1.errors, ...r2.errors };
    if (Object.keys(allErrors).length > 0) {
      throw new Error(
        `Product cannot be submitted — validation errors on: ${Object.keys(allErrors).join(', ')}`
      );
    }
    return;
  }

  if (toStatus === 'PENDING_SALES') {
    const { valid, errors } = validate(ADMIN_COST_SCHEMA, product);
    if (!valid) {
      throw new Error(
        `Admin cost layer is incomplete — errors on: ${Object.keys(errors).join(', ')}`
      );
    }
    return;
  }

  if (toStatus === 'READY_FOR_ECOMMERCE') {
    if (!product.sellingPrice || Number(product.sellingPrice) <= 0) {
      throw new Error('Selling price must be set before marking product as ready for e-commerce');
    }
    return;
  }

  // All other transitions (REVISION_REQUESTED_BY_*, REJECTED, ARCHIVED, etc.) — no readiness checks.
}

function _buildProductUpdates(product, toStatus, userId, notes, now) {
  const updates = {
    status:    toStatus,
    updatedBy: userId,
    updatedAt: now,
    version:   (product.version || 0) + 1,
  };

  if (toStatus === 'ARCHIVED') {
    updates.archivedAt = now;
  }

  if (toStatus === 'REJECTED') {
    updates.rejectionReason = notes?.trim() || null;
  }

  if (toStatus === 'REVISION_REQUESTED_BY_ADMIN' || toStatus === 'REVISION_REQUESTED_BY_SALES') {
    updates.revisionNotes = notes?.trim() || null;
  }

  if (toStatus === 'PENDING_SALES') {
    // Clear previous revision notes; record admin review timestamp.
    updates.revisionNotes    = null;
    updates.adminReviewedBy  = userId;
    updates.adminReviewedAt  = now;
  }

  if (toStatus === 'READY_FOR_ECOMMERCE') {
    updates.revisionNotes   = null;
    updates.salesReviewedBy = userId;
    updates.salesReviewedAt = now;
  }

  // Re-submitting after revision — clear outstanding notes.
  if (toStatus === 'PENDING_ADMIN') {
    updates.revisionNotes = null;
  }

  return updates;
}

async function _saveVersionSnapshot(product, toStatus, userId, now) {
  const snapshot = {
    versionId:         crypto.randomUUID(),
    productId:         product.id,
    versionNumber:     (product.version || 0) + 1,
    snapshotData:      { ...product },
    triggeredByAction: `${product.status}:${toStatus}`,
    triggeredBy:       userId,
    triggeredAt:       now,
  };
  // Non-blocking — a snapshot failure must never abort the transition.
  DB.put('productVersions', snapshot).catch((err) => {
    console.warn('[Workflow] Version snapshot failed — transition still committed:', err.message ?? err);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Transition a product from its current status to `toStatus`.
 *
 * Validation order (all happen before any write):
 *   1. Product exists
 *   2. Current user is authenticated
 *   3. Role is allowed to make this specific transition (canTransition)
 *   4. Transition is legal per ALLOWED_TRANSITIONS (SUPER_ADMIN bypasses)
 *   5. Notes/reason are present where required
 *   6. Business-rule readiness checks (cost layer complete, selling price set, etc.)
 *
 * On success: product is updated in DB, version snapshot saved, audit log written.
 * On failure: throws a descriptive Error — nothing is written to the DB.
 *
 * @param {string} productId  - UUID of the product to transition
 * @param {string} toStatus   - Target status string
 * @param {string} userId     - ID of the user performing the transition (for audit log)
 * @param {string} [notes]    - Revision/rejection notes (required for some transitions)
 */
export async function transition(productId, toStatus, userId, notes = null) {
  // ── 1. Load product ────────────────────────────────────────────────────────
  const product = await DB.get('products', productId);
  if (!product) {
    throw new Error(`transition: product "${productId}" not found`);
  }

  const fromStatus = product.status;

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  const user = getCurrentUser();
  if (!user) {
    throw new Error('transition: no authenticated user — call Auth.init() before workflow operations');
  }

  const role = user.role;

  // ── 3. Role permission ─────────────────────────────────────────────────────
  if (!canTransition(role, fromStatus, toStatus)) {
    throw new Error(
      `transition: role "${role}" is not permitted to move a product from "${fromStatus}" to "${toStatus}"`
    );
  }

  // ── 4. Legal transition ────────────────────────────────────────────────────
  // SUPER_ADMIN can force any transition; everyone else must follow the map.
  if (role !== 'SUPER_ADMIN') {
    const allowed = ALLOWED_TRANSITIONS[fromStatus];
    if (!allowed || !allowed.includes(toStatus)) {
      throw new Error(
        `transition: "${fromStatus}" → "${toStatus}" is not a legal transition`
      );
    }
  }

  // ── 5. Notes validation ────────────────────────────────────────────────────
  _requireNotes(toStatus, notes);

  // ── 6. Business-rule readiness ─────────────────────────────────────────────
  _validateProductReadiness(product, toStatus);

  // ── All checks passed — begin writes ──────────────────────────────────────
  const now     = Date.now();
  const updates = _buildProductUpdates(product, toStatus, userId, notes, now);

  // Save snapshot before updating the product so snapshotData reflects the
  // state at the point the transition was triggered, not after.
  const snapshotKey = `${fromStatus}:${toStatus}`;
  if (SNAPSHOT_TRIGGERS.has(snapshotKey) || toStatus === 'ARCHIVED') {
    await _saveVersionSnapshot(product, toStatus, userId, now);
  }

  await DB.patch('products', productId, updates);

  // Audit log is fire-and-forget.
  logAction({
    productId,
    userId,
    userRole:   role,
    action:     'STATUS_CHANGE',
    fromStatus,
    toStatus,
    notes:      notes ?? null,
    sessionId:  null,
  });

  return { ...product, ...updates };
}
