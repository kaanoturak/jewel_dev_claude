import DB                                        from '../../core/db.js';
import { statusBadge, formatRelativeTime, esc }  from '../../shared/utils/index.js';
import { toShopifyCSV, toJSONFeed,
         downloadCSV, downloadJSON }             from '../../modules/export/index.js';
import { ROLE_PERMISSIONS, ACTIONS }             from '../../modules/auth/permissions.js';
import { getOverrides, getCurrentUser }          from '../../modules/auth/index.js';
import { logOverride }                           from '../../core/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_ORDER = [
  'DRAFT', 'PENDING_ADMIN', 'REVISION_REQUESTED_BY_ADMIN',
  'PENDING_SALES', 'REVISION_REQUESTED_BY_SALES',
  'READY_FOR_ECOMMERCE', 'REJECTED', 'ARCHIVED',
];

// ─── Data ──────────────────────────────────────────────────────────────────────

async function _fetchData() {
  const [allProducts, allUsers, allVariants, allCampaigns] = await Promise.all([
    DB.getAll('products'),
    DB.getAll('users'),
    DB.getAll('variants'),
    DB.getAll('campaigns'),
  ]);

  const products = allProducts || [];
  const byStatus = {};
  for (const s of STATUS_ORDER) byStatus[s] = 0;
  for (const p of products) {
    if (byStatus[p.status] !== undefined) byStatus[p.status]++;
    else byStatus[p.status] = 1;
  }

  const outOfStock = (allVariants || []).filter(v => (v.stockCount ?? 0) === 0 && v.isActive !== false).length;
  const activeUsers = (allUsers || []).filter(u => u.isActive !== false).length;
  const activeCampaigns = (allCampaigns || []).filter(c => {
    if (!c.isActive) return false;
    const now = Date.now();
    return c.startsAt <= now && (!c.endsAt || c.endsAt >= now);
  }).length;

  const recentProducts = [...products]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 15);

  return { products, byStatus, outOfStock, activeUsers, activeCampaigns, recentProducts };
}

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container, navigate) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let data;
  try {
    data = await _fetchData();
  } catch (err) {
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load dashboard</h2>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  // ── System stat cards ─────────────────────────────────────────────────────
  const statsGrid = document.createElement('div');
  statsGrid.className = 'stat-cards';

  const systemCards = [
    { value: data.products.length,     label: 'Total Products',    alert: false },
    { value: data.activeUsers,         label: 'Active Users',      alert: false },
    { value: data.activeCampaigns,     label: 'Active Campaigns',  alert: false },
    { value: data.outOfStock,          label: 'Out-of-Stock Vars', alert: data.outOfStock > 0 },
  ];

  for (const { value, label, alert } of systemCards) {
    const card = document.createElement('div');
    card.className = `stat-card${alert ? ' stat-card--alert' : ''}`;
    card.innerHTML = `
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>`;
    statsGrid.appendChild(card);
  }
  container.appendChild(statsGrid);

  // ── Marketplace Settings ──────────────────────────────────────────────────
  const settingsSection = document.createElement('div');
  settingsSection.className = 'section';

  const sHdr = document.createElement('div');
  sHdr.className = 'section-header';
  sHdr.innerHTML = `<span class="section-title">Marketplace Settings</span>`;
  settingsSection.appendChild(sHdr);

  const settingsCard = document.createElement('div');
  settingsCard.className = 'card';
  settingsCard.style.cssText = 'padding:20px 24px';

  const mConfig = await DB.get('settings', 'marketplace_config');
  const currentComm = mConfig?.marketplaceCommissionPct ?? 15;

  settingsCard.innerHTML = `
    <div style="max-width:480px">
      <label class="form-label" for="comm-pct">Global Marketplace Commission (%)</label>
      <div style="display:flex;gap:10px;align-items:center;margin-top:8px">
        <input id="comm-pct" type="number" class="form-input" style="width:100px" 
               value="${currentComm}" min="0" max="100" step="0.5">
        <button id="save-comm" class="btn btn--secondary btn--sm">Update Rate</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-top:8px">
        Commission is applied to the gross margin. For example, at 15%, the marketplace keeps $15 for every $100 of margin earned.
      </p>
    </div>
  `;

  settingsSection.appendChild(settingsCard);
  container.appendChild(settingsSection);

  const saveCommBtn = settingsCard.querySelector('#save-comm');
  const commInput = settingsCard.querySelector('#comm-pct');
  
  saveCommBtn.addEventListener('click', async () => {
    const val = parseFloat(commInput.value);
    if (isNaN(val) || val < 0 || val > 100) { alert('Invalid percentage.'); return; }
    
    saveCommBtn.disabled = true;
    saveCommBtn.textContent = 'Updating…';
    
    try {
      const user = getCurrentUser();
      await DB.put('settings', {
        settingId: 'marketplace_config',
        marketplaceCommissionPct: val,
        updatedAt: Date.now(),
        updatedBy: user?.userId
      });
      logOverride(user?.userId, 'GLOBAL', 'COMMISSION_RATE', val);
      saveCommBtn.textContent = 'Updated ✓';
      setTimeout(() => { saveCommBtn.textContent = 'Update Rate'; saveCommBtn.disabled = false; }, 2000);
    } catch (err) {
      alert(`Update failed: ${err.message}`);
      saveCommBtn.disabled = false;
      saveCommBtn.textContent = 'Update Rate';
    }
  });

  // ── Status breakdown ──────────────────────────────────────────────────────
  const breakdownSection = document.createElement('div');
  breakdownSection.className = 'section';

  const bHdr = document.createElement('div');
  bHdr.className = 'section-header';
  bHdr.innerHTML = `<span class="section-title">Products by Status</span>`;
  breakdownSection.appendChild(bHdr);

  const breakdownCard = document.createElement('div');
  breakdownCard.className = 'card';
  breakdownCard.style.cssText = 'padding:12px 20px;display:flex;flex-wrap:wrap;gap:12px';

  for (const status of STATUS_ORDER) {
    const count = data.byStatus[status] ?? 0;
    const chip = document.createElement('div');
    chip.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px';
    chip.innerHTML = `${statusBadge(status).outerHTML} <span style="color:var(--text-muted)">${count}</span>`;
    breakdownCard.appendChild(chip);
  }

  breakdownSection.appendChild(breakdownCard);
  container.appendChild(breakdownSection);

  // ── Permission Matrix ─────────────────────────────────────────────────────
  const permSection = document.createElement('div');
  permSection.className = 'section';

  const pHdr = document.createElement('div');
  pHdr.className = 'section-header';
  pHdr.innerHTML = `<span class="section-title">Permission Matrix</span>`;
  const mBtn = document.createElement('button');
  mBtn.className = 'btn btn--ghost btn--sm';
  mBtn.textContent = 'Manage Overrides →';
  mBtn.addEventListener('click', () => navigate('override'));
  pHdr.appendChild(mBtn);
  permSection.appendChild(pHdr);

  const permCard = document.createElement('div');
  permCard.className = 'card';
  permCard.style.overflowX = 'auto';

  const overrides = getOverrides();
  const roles = ['MANUFACTURER', 'ADMIN', 'SALES', 'SUPER_ADMIN'];
  const allActions = Object.values(ACTIONS);

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Action</th>
        ${roles.map(r => `<th>${r}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${allActions.map(action => `
        <tr>
          <td style="font-size:12px;font-weight:600">${action}</td>
          ${roles.map(role => {
            if (role === 'SUPER_ADMIN') return '<td style="text-align:center">✅</td>';
            const base = ROLE_PERMISSIONS[role]?.actions.includes(action);
            const ovr  = overrides.actions[`${role}:${action}`];
            const allowed = ovr !== undefined ? ovr : base;
            const isModified = ovr !== undefined;
            return `<td style="text-align:center;${isModified ? 'background:var(--surface-alt)' : ''}">
              ${allowed ? '✅' : '❌'}${isModified ? ' <sup>*</sup>' : ''}
            </td>`;
          }).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;
  permCard.appendChild(table);
  permSection.appendChild(permCard);
  container.appendChild(permSection);

  // ── Recent activity table ─────────────────────────────────────────────────
  const activitySection = document.createElement('div');
  activitySection.className = 'section';

  const aHdr = document.createElement('div');
  aHdr.className = 'section-header';
  aHdr.innerHTML = `<span class="section-title">Recent Products</span>`;

  const overrideBtn = document.createElement('button');
  overrideBtn.className   = 'btn btn--ghost btn--sm';
  overrideBtn.textContent = 'Override →';
  overrideBtn.addEventListener('click', () => navigate('override'));
  aHdr.appendChild(overrideBtn);

  activitySection.appendChild(aHdr);

  const actCard = document.createElement('div');
  actCard.className = 'card';

  if (data.recentProducts.length === 0) {
    actCard.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">💎</div>
        <div class="empty-state__title">No products yet</div>
        <div class="empty-state__desc">Products will appear here once created.</div>
      </div>`;
  } else {
    const table = document.createElement('table');
    table.className = 'products-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Product</th>
          <th>Category</th>
          <th>Status</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody></tbody>`;

    const tbody = table.querySelector('tbody');

    for (const p of data.recentProducts) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="product-name">
            ${esc(p.name || 'Untitled')}
            <small>${esc(p.sku || '—')}</small>
          </div>
        </td>
        <td>${esc(p.category || '—')}</td>
        <td></td>
        <td style="color:var(--text-muted);font-size:12px">${formatRelativeTime(p.updatedAt)}</td>`;
      tr.querySelector('td:nth-child(3)').appendChild(statusBadge(p.status));
      tbody.appendChild(tr);
    }

    actCard.appendChild(table);
  }

  activitySection.appendChild(actCard);
  container.appendChild(activitySection);

  // ── Export section ────────────────────────────────────────────────────────
  const exportCount = data.byStatus['READY_FOR_ECOMMERCE'] ?? 0;

  const exportSection = document.createElement('div');
  exportSection.className = 'section';

  const eHdr = document.createElement('div');
  eHdr.className = 'section-header';
  eHdr.innerHTML = `<span class="section-title">Export</span>`;
  exportSection.appendChild(eHdr);

  const exportCard = document.createElement('div');
  exportCard.className = 'card';
  exportCard.style.cssText = 'padding:20px 24px;display:flex;align-items:center;gap:16px;flex-wrap:wrap';

  const countLabel = document.createElement('span');
  countLabel.style.cssText = 'font-size:13px;color:var(--text-muted);flex:1;min-width:200px';
  countLabel.textContent = `${exportCount} product${exportCount !== 1 ? 's' : ''} ready for export (READY_FOR_ECOMMERCE)`;
  exportCard.appendChild(countLabel);

  const csvBtn = document.createElement('button');
  csvBtn.className   = 'btn btn--primary btn--sm';
  csvBtn.textContent = 'Export Shopify CSV';
  csvBtn.addEventListener('click', async () => {
    csvBtn.disabled    = true;
    csvBtn.textContent = 'Exporting…';
    try {
      const [products, variants] = await Promise.all([
        DB.getAll('products'),
        DB.getAll('variants'),
      ]);
      const csv = toShopifyCSV(products || [], variants || []);
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(`tugu-shopify-${date}.csv`, csv);
    } finally {
      csvBtn.disabled    = false;
      csvBtn.textContent = 'Export Shopify CSV';
    }
  });
  exportCard.appendChild(csvBtn);

  const jsonBtn = document.createElement('button');
  jsonBtn.className   = 'btn btn--secondary btn--sm';
  jsonBtn.textContent = 'Export JSON Feed';
  jsonBtn.addEventListener('click', async () => {
    jsonBtn.disabled    = true;
    jsonBtn.textContent = 'Exporting…';
    try {
      const [products, variants] = await Promise.all([
        DB.getAll('products'),
        DB.getAll('variants'),
      ]);
      const feed = toJSONFeed(products || [], variants || []);
      const date = new Date().toISOString().slice(0, 10);
      downloadJSON(`tugu-feed-${date}.json`, feed);
    } finally {
      jsonBtn.disabled    = false;
      jsonBtn.textContent = 'Export JSON Feed';
    }
  });
  exportCard.appendChild(jsonBtn);

  exportSection.appendChild(exportCard);
  container.appendChild(exportSection);
}
