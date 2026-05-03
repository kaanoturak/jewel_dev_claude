import * as Auth   from './modules/auth/index.js';
import { registerAuth } from './core/state.js';
import DB from './core/db.js';
import { calculateVariantTransferPrice } from './core/engine.js';

// Dev-only stub users — each represents a role with a realistic internal ID.
const DEV_USERS = {
  MANUFACTURER: {
    userId: 'dev-mfr-001',
    email: 'manufacturer@tugu.dev',
    displayName: 'Dev Manufacturer',
    role: 'MANUFACTURER',
    isActive: true,
    createdAt: Date.now(),
  },
  ADMIN: {
    userId: 'dev-admin-001',
    email: 'admin@tugu.dev',
    displayName: 'Dev Admin',
    role: 'ADMIN',
    isActive: true,
    createdAt: Date.now(),
  },
  SALES: {
    userId: 'dev-sales-001',
    email: 'sales@tugu.dev',
    displayName: 'Dev Sales',
    role: 'SALES',
    isActive: true,
    createdAt: Date.now(),
  },
  SUPER_ADMIN: {
    userId: 'dev-super-001',
    email: 'super@tugu.dev',
    displayName: 'Dev Super Admin',
    role: 'SUPER_ADMIN',
    isActive: true,
    createdAt: Date.now(),
  },
};

// ─── Role selector (dev stub login) ──────────────────────────────────────────

function showRoleSelector(appEl) {
  const roleLabels = {
    MANUFACTURER: 'Manufacturer',
    ADMIN:        'Admin',
    SALES:        'Sales',
    SUPER_ADMIN:  'Super Admin',
  };

  appEl.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <span class="login-logo">TuguJewelry</span>
        <span class="login-sub">Insider PIM</span>
        <p class="login-label">Select your role to continue</p>
        <div class="login-roles" id="role-list"></div>
        <p class="login-dev-note">Development environment — no authentication required</p>
      </div>
    </div>
  `;

  const list = appEl.querySelector('#role-list');
  for (const [role, label] of Object.entries(roleLabels)) {
    const btn = document.createElement('button');
    btn.className = 'login-role-btn';
    btn.innerHTML = `<span class="role-dot"></span>${label}`;
    btn.addEventListener('click', async () => {
      const user = { ...DEV_USERS[role], lastLoginAt: Date.now() };
      await Auth.setCurrentUser(user);
      window.location.reload();
    });
    list.appendChild(btn);
  }
}

// ─── Panel mounting ───────────────────────────────────────────────────────────

async function mountPanel(role, container) {
  switch (role) {
    case 'MANUFACTURER': {
      const { mount } = await import('./panels/manufacturer/index.js');
      mount(container);
      break;
    }
    case 'ADMIN': {
      const { mount } = await import('./panels/admin/index.js');
      mount(container);
      break;
    }
    case 'SALES': {
      const { mount } = await import('./panels/sales/index.js');
      mount(container);
      break;
    }
    case 'SUPER_ADMIN': {
      const { mount } = await import('./panels/super-admin/index.js');
      mount(container);
      break;
    }
    default:
      showRoleSelector(container);
  }
}

// ─── Boot-time variant cost migration ────────────────────────────────────────

async function _runVariantMigrationIfNeeded() {
  const flag = await DB.get('settings', 'variant_migration_complete');
  if (flag?.value === true) return;

  const products = await DB.getAll('products') || [];
  for (const product of products) {
    const variants = await DB.queryByIndex('variants', 'productId', product.id) || [];
    for (const v of variants) {
      const patch = {};
      if (v.costMaterial  == null) patch.costMaterial  = Number(product.costMaterial)  || 0;
      if (v.costLabor     == null) patch.costLabor     = Number(product.costLabor)     || 0;
      if (v.costPackaging == null) patch.costPackaging = Number(product.costPackaging) || 0;
      const hydrated = { ...v, ...patch };
      const tp = calculateVariantTransferPrice(hydrated, product);
      if (tp !== null) patch.transferPrice = tp;
      if (Object.keys(patch).length > 0) {
        await DB.patch('variants', v.variantId, patch).catch(() => {});
      }
    }
  }

  await DB.put('settings', { settingId: 'variant_migration_complete', value: true, migratedAt: Date.now() });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  const appEl = document.getElementById('app');

  await Auth.init();
  registerAuth(Auth);
  await _runVariantMigrationIfNeeded();

  const user = Auth.getCurrentUser();

  if (!user) {
    showRoleSelector(appEl);
    return;
  }

  await mountPanel(user.role, appEl);
}

boot().catch((err) => {
  console.error('[App] Boot failed:', err);
  document.getElementById('app').innerHTML =
    `<div class="view-placeholder" style="min-height:100vh;">
       <h2>Failed to start</h2>
       <p>${err.message}</p>
     </div>`;
});
