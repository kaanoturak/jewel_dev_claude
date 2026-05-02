/**
 * Centralized Permission Definitions
 * This module defines the static permission structure of the system.
 * It is used by the Auth module to enforce role-based access control.
 */

export const ACTIONS = {
  CREATE_PRODUCT:      'CREATE_PRODUCT',
  EDIT_PRODUCT:        'EDIT_PRODUCT',
  DELETE_PRODUCT:      'DELETE_PRODUCT',
  APPROVE_PRODUCT:     'APPROVE_PRODUCT',
  REJECT_PRODUCT:      'REJECT_PRODUCT',
  REQUEST_REVISION:    'REQUEST_REVISION',
  VIEW_AUDIT_LOG:      'VIEW_AUDIT_LOG',
  VIEW_STOCK:          'VIEW_STOCK',
  MANAGE_USERS:        'MANAGE_USERS',
  OVERRIDE_WORKFLOW:   'OVERRIDE_WORKFLOW',
  MANAGE_PERMISSIONS:  'MANAGE_PERMISSIONS',
};

export const FIELD_GROUPS = {
  MANUFACTURER: [
    'name', 'category', 'material', 'collection',
    'seoTitle', 'seoDescription', 'marketingDescription', 'productDescription',
    'materials', 'careInstructions', 'searchTags',
    'images', 'primaryImageIndex', 'video',
    'costMaterial', 'costLabor', 'costPackaging',
  ],
  ADMIN: [
    'adminTaxPct', 'adminMarginPct', 'adminLogisticsCost',
    'adminMarketingCost', 'adminMiscCost',
  ],
  SALES: [
    'sellingPrice', 'compareAtPrice', 'activeCampaignId',
  ],
};

export const ROLE_PERMISSIONS = {
  MANUFACTURER: {
    actions: [
      ACTIONS.CREATE_PRODUCT,
      ACTIONS.EDIT_PRODUCT,
    ],
    fields: FIELD_GROUPS.MANUFACTURER,
    transitions: [
      'DRAFT:PENDING_ADMIN',
      'REVISION_REQUESTED_BY_ADMIN:PENDING_ADMIN',
    ],
    panels: ['manufacturer'],
  },
  ADMIN: {
    actions: [
      ACTIONS.EDIT_PRODUCT,
      ACTIONS.APPROVE_PRODUCT,
      ACTIONS.REJECT_PRODUCT,
      ACTIONS.REQUEST_REVISION,
      ACTIONS.VIEW_AUDIT_LOG,
      ACTIONS.VIEW_STOCK,
    ],
    fields: FIELD_GROUPS.ADMIN,
    transitions: [
      'PENDING_ADMIN:PENDING_SALES',
      'PENDING_ADMIN:REVISION_REQUESTED_BY_ADMIN',
      'PENDING_ADMIN:REJECTED',
      'REVISION_REQUESTED_BY_SALES:PENDING_SALES',
      'REVISION_REQUESTED_BY_SALES:REVISION_REQUESTED_BY_ADMIN',
      'REVISION_REQUESTED_BY_SALES:REJECTED',
      '*:ARCHIVED', // Wildcard handled in canTransition
    ],
    panels: ['admin'],
  },
  SALES: {
    actions: [
      ACTIONS.EDIT_PRODUCT,
      ACTIONS.APPROVE_PRODUCT,
      ACTIONS.REJECT_PRODUCT,
      ACTIONS.REQUEST_REVISION,
    ],
    fields: FIELD_GROUPS.SALES,
    transitions: [
      'PENDING_SALES:READY_FOR_ECOMMERCE',
      'PENDING_SALES:REVISION_REQUESTED_BY_SALES',
      'PENDING_SALES:REJECTED',
    ],
    panels: ['sales'],
  },
  SUPER_ADMIN: {
    actions: Object.values(ACTIONS),
    fields: [
      ...FIELD_GROUPS.MANUFACTURER,
      ...FIELD_GROUPS.ADMIN,
      ...FIELD_GROUPS.SALES,
    ],
    transitions: ['*:*'], // Full bypass
    panels: ['manufacturer', 'admin', 'sales', 'super-admin'],
  },
};
