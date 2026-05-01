import DB                                        from '../../core/db.js';
import { statusBadge, formatRelativeTime, esc }  from '../../shared/utils/index.js';

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
    activitySection.appendChild(actCard);
    container.appendChild(activitySection);
    return;
  }

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
  activitySection.appendChild(actCard);
  container.appendChild(activitySection);
}
