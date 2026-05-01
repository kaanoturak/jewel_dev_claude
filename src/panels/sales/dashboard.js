import DB                                        from '../../core/db.js';
import { statusBadge, formatRelativeTime, esc }  from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Data ──────────────────────────────────────────────────────────────────────

async function _fetchData() {
  const [pendingSales, readyProducts, activeCampaigns] = await Promise.all([
    DB.queryByIndex('products', 'status', 'PENDING_SALES'),
    DB.queryByIndex('products', 'status', 'READY_FOR_ECOMMERCE'),
    DB.getAll('campaigns'),
  ]);

  const recentIncoming = [...(pendingSales || [])]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 8);

  const activeNow = (activeCampaigns || []).filter(c => {
    if (!c.isActive) return false;
    const now = Date.now();
    if (c.startsAt > now) return false;
    if (c.endsAt && c.endsAt < now) return false;
    return true;
  });

  return {
    pendingSalesCount:  (pendingSales  || []).length,
    readyCount:         (readyProducts || []).length,
    activeCampaignCount: activeNow.length,
    recentIncoming,
  };
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

  // ── Stat cards ────────────────────────────────────────────────────────────
  const statsGrid = document.createElement('div');
  statsGrid.className = 'stat-cards';

  const cards = [
    { value: data.pendingSalesCount,   label: 'Incoming Queue',     alert: data.pendingSalesCount > 0 },
    { value: data.readyCount,          label: 'Ready for E-Com',    alert: false },
    { value: data.activeCampaignCount, label: 'Active Campaigns',   alert: false },
  ];

  for (const { value, label, alert } of cards) {
    const card = document.createElement('div');
    card.className = `stat-card${alert ? ' stat-card--alert' : ''}`;
    card.innerHTML = `
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>`;
    statsGrid.appendChild(card);
  }
  container.appendChild(statsGrid);

  // ── Incoming queue section ────────────────────────────────────────────────
  const section = document.createElement('div');
  section.className = 'section';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-title">Incoming Queue</span>`;

  const allBtn = document.createElement('button');
  allBtn.className   = 'btn btn--ghost btn--sm';
  allBtn.textContent = 'View all →';
  allBtn.addEventListener('click', () => navigate('products/queue'));
  header.appendChild(allBtn);
  section.appendChild(header);

  const card = document.createElement('div');
  card.className = 'card';

  if (data.recentIncoming.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">✅</div>
        <div class="empty-state__title">Queue is clear</div>
        <div class="empty-state__desc">No products are waiting for sales review.</div>
      </div>`;
    section.appendChild(card);
    container.appendChild(section);
    return;
  }

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th>
        <th>Category</th>
        <th>Admin Price</th>
        <th>Submitted</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');

  for (const p of data.recentIncoming) {
    const tr = document.createElement('tr');

    const adminPrice = p.transferPrice != null
      ? `<span style="font-weight:600;color:var(--accent)">${esc(String(p.transferPrice))}</span>`
      : '<span style="color:var(--text-muted)">—</span>';

    tr.innerHTML = `
      <td>
        <div class="product-name">
          ${esc(p.name || 'Untitled')}
          <small>${esc(p.sku || '—')}</small>
        </div>
      </td>
      <td>${esc(p.category || '—')}</td>
      <td>${adminPrice}</td>
      <td style="color:var(--text-muted);font-size:12px">${formatRelativeTime(p.updatedAt)}</td>
      <td class="product-actions"></td>`;

    const reviewBtn = document.createElement('button');
    reviewBtn.className   = 'btn btn--primary btn--sm';
    reviewBtn.textContent = 'Review';
    reviewBtn.addEventListener('click', () =>
      navigate('products/detail', { id: p.id, returnTo: 'products/queue' })
    );
    tr.querySelector('.product-actions').appendChild(reviewBtn);

    tbody.appendChild(tr);
  }

  card.appendChild(table);
  section.appendChild(card);
  container.appendChild(section);
}
