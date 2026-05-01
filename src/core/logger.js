import DB from './db.js';

/**
 * Write an audit log entry to the auditLog store.
 *
 * Intentionally fire-and-forget: this function returns nothing and never throws.
 * All write failures are reported to console.warn only, so a logging failure can
 * never crash or block a user action.
 *
 * The auditLog store uses autoIncrement, so callers must NOT provide a logId —
 * the database assigns it. All other fields from Section 10 should be supplied
 * by the caller; timestamp defaults to now if omitted.
 *
 * Expected entry shape (all optional except productId, userId, action):
 * {
 *   productId:     string,
 *   variantId:     string | null,
 *   userId:        string,
 *   userRole:      string,
 *   action:        string,          // e.g. 'FIELD_UPDATE', 'STATUS_CHANGE', 'IMAGE_UPLOAD'
 *   fromStatus:    string | null,
 *   toStatus:      string | null,
 *   changedFields: { field, oldValue, newValue }[],
 *   notes:         string | null,
 *   sessionId:     string,
 *   timestamp:     number,          // Date.now() — defaults to now if omitted
 * }
 */
export function logAction(entry) {
  const record = {
    variantId:     null,
    userRole:      null,
    fromStatus:    null,
    toStatus:      null,
    changedFields: [],
    notes:         null,
    sessionId:     null,
    ...entry,
    timestamp: entry.timestamp ?? Date.now(),
    // logId is intentionally omitted — autoIncrement handles it
  };

  DB.add('auditLog', record).catch((err) => {
    console.warn('[Logger] Failed to write audit log entry:', err.message ?? err, {
      action:    record.action,
      productId: record.productId,
      userId:    record.userId,
    });
  });
}
