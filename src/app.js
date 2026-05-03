import * as Auth   from './modules/auth/index.js';
import { registerAuth } from './core/state.js';
import DB from './core/db.js';
import { calculateVariantTransferPrice } from './core/engine.js';
import { CLOUD_ENABLED } from './core/firebase-config.js';

// ─── Cloud login form ────────────────────────────────────────────────────────

function showLoginForm(appEl) {
  appEl.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <span class="login-logo">TuguJewelry</span>
        <span class="login-sub">Insider PIM</span>
        <div id="login-error" class="alert alert--error" style="display:none;margin-bottom:12px"></div>
        <div style="display:flex;flex-direction:column;gap:12px;width:100%">
          <input id="login-email"    type="email"    class="form-input" placeholder="Email address" autocomplete="username" />
          <input id="login-password" type="password" class="form-input" placeholder="Password"      autocomplete="current-password" />
          <button id="login-submit" class="btn btn--primary" style="width:100%">Sign in</button>
        </div>
      </div>
    </div>
  `;

  const emailEl    = appEl.querySelector('#login-email');
  const passwordEl = appEl.querySelector('#login-password');
  const submitBtn  = appEl.querySelector('#login-submit');
  const errorEl    = appEl.querySelector('#login-error');

  async function attemptLogin() {
    const email    = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) { errorEl.textContent = 'Email and password are required.'; errorEl.style.display = 'block'; return; }
    submitBtn.disabled = true; submitBtn.textContent = 'Signing in…';
    errorEl.style.display = 'none';
    try {
      const user = await Auth.login(email, password);
      await mountPanel(user.role, appEl);
    } catch (err) {
      errorEl.textContent = err.message || 'Sign-in failed. Check your credentials.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false; submitBtn.textContent = 'Sign in';
    }
  }

  submitBtn.addEventListener('click', attemptLogin);
  passwordEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
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
      showLoginForm(container);
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

  // Initialize Firebase and the cloud adapter before Auth.init()
  const { initFirebase, registerUserGetter } = await import('./core/api.js');
  await initFirebase();

  await Auth.init();
  registerUserGetter(Auth.getCurrentUser);
  registerAuth(Auth);
  await _runVariantMigrationIfNeeded();

  const user = Auth.getCurrentUser();

  if (!user) {
    showLoginForm(appEl);
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
