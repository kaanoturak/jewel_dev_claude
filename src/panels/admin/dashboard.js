import DB                                        from '../../core/db.js';
import { statusBadge, formatRelativeTime, truncate } from '../../shared/utils/index.js';

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function _fetchData() {
  const [allProducts, pendingAdmin, salesRevision, pendingSales, ready, allVariants] = await Promise.all([
    DB.getAll('products'),
    DB.queryByIndex('products', 'status', 'PENDING_ADMIN'),
    DB.queryByIndex('products', 'status', 'REVISION_REQUESTED_BY_SALES'),
    DB.queryByIndex('products', 'status', 'PENDING_SALES'),
    DB.queryByIndex('products', 'status', 'READY_FOR_ECOMMERCE'),
    DB.getAll('variants'),
  ]);

  // Out-of-stock variants joined with product name
  const productMap   = Object.fromEntries((allProducts || []).map(p => [p.id, p]));
  const outOfStock   = (allVariants || [])
    .filter(v => (v.stockCount ?? 0) === 0 && v.isActive !== false)
    .map(v => ({ ...v, productName: productMap[v.productId]?.name || '—' }));

  // Recently submitted = PENDING_ADMIN sorted newest first
  const recentQueue  = [...(pendingAdmin || [])]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);

  return {
    totalProducts:     (allProducts    || []).length,
    pendingAdminCount: (pendingAdmin   || []).length + (salesRevision || []).length,
    pendingSalesCount: (pendingSales   || []).length,
    readyCount:        (ready          || []).length,
    recentQueue,
    outOfStock,
  };
}

// ─── Stat cards ────────────────────────────────────────────────────────────────

function _renderStats(container, data) {
  const cards = [
    { value: data.pendingAdminCount, label: 'Pending Review',    alert: data.pendingAdminCount > 0 },
    { value: data.pendingSalesCount, label: 'Pending Sales',     alert: false },
    { value: data.readyCount,        label: 'Ready for E-Com',   alert: false },
    { value: data.totalProducts,     label: 'Total Products',    alert: false },
  ];

  const grid = document.createElement('div');
  grid.className = 'stat-cards';

  for (const { value, label, alert } of cards) {
    const card = document.createElement('div');
    card.className = `stat-card${alert ? ' stat-card--alert' : ''}`;
    card.innerHTML = `
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>`;
    grid.appendChild(card);
  }

  container.appendChild(grid);
}

// ─── Review queue section ──────────────────────────────────────────────────────

function _renderReviewQueue(container, products, navigate) {
  const section = document.createElement('div');
  section.className = 'section';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-title">Pending Review</span>`;

  const allBtn = document.createElement('button');
  allBtn.className = 'btn btn--ghost btn--sm';
  allBtn.textContent = 'View all →';
  allBtn.addEventListener('click', () => navigate('products/queue'));
  header.appendChild(allBtn);
  section.appendChild(header);

  const card = document.createElement('div');
  card.className = 'card';

  if (products.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">✅</div>
        <div class="empty-state__title">Queue is clear</div>
        <div class="empty-state__desc">No products are waiting for admin review.</div>
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
        <th>Submitted</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');

  for (const product of products) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.innerHTML = `
      <div class="product-name">
        ${escHtml(product.name || 'Untitled')}
        <small>${escHtml(product.sku || '—')}</small>
      </div>`;

    const catTd = document.createElement('td');
    catTd.textContent = product.category || '—';

    const timeTd = document.createElement('td');
    timeTd.style.color = 'var(--text-muted)';
    timeTd.textContent = formatRelativeTime(product.updatedAt);

    const actionTd = document.createElement('td');
    actionTd.className = 'product-actions';
    const reviewBtn = document.createElement('button');
    reviewBtn.className = 'btn btn--primary btn--sm';
    reviewBtn.textContent = 'Review';
    reviewBtn.addEventListener('click', () =>
      navigate('products/detail', { id: product.id, returnTo: 'products/queue' })
    );
    actionTd.appendChild(reviewBtn);

    tr.append(nameTd, catTd, timeTd, actionTd);
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  section.appendChild(card);
  container.appendChild(section);
}

// ─── Stock alerts section ──────────────────────────────────────────────────────

function _renderStockAlerts(container, outOfStock) {
  const section = document.createElement('div');
  section.className = 'section';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-title">Out-of-Stock Variants</span>`;

  const allBtn = document.createElement('button');
  allBtn.className = 'btn btn--ghost btn--sm';
  allBtn.textContent = 'View all stock →';
  allBtn.addEventListener('click', () => container._navigate?.('stock'));
  header.appendChild(allBtn);
  section.appendChild(header);

  const card = document.createElement('div');
  card.className = 'card';

  if (outOfStock.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📦</div>
        <div class="empty-state__title">All variants in stock</div>
        <div class="empty-state__desc">No active variants have zero stock.</div>
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
        <th>SKU</th>
        <th>Size</th>
        <th>Color</th>
        <th>Stock</th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');

  for (const v of outOfStock.slice(0, 15)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="product-name">${escHtml(v.productName)}</div>
      </td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">
        ${escHtml(v.sku || '—')}
      </td>
      <td>${escHtml(v.size  || '—')}</td>
      <td>${escHtml(v.color || '—')}</td>
      <td>
        <span class="badge badge--red">0</span>
      </td>`;
    tbody.appendChild(tr);
  }

  if (outOfStock.length > 15) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="5" style="text-align:center;color:var(--text-muted);font-size:12px;padding:10px">
        … and ${outOfStock.length - 15} more. <a href="#" style="color:var(--accent)">View all stock</a>
      </td>`;
    tr.querySelector('a').addEventListener('click', e => {
      e.preventDefault();
      container._navigate?.('stock');
    });
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  section.appendChild(card);
  container.appendChild(section);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Public render ─────────────────────────────────────────────────────────────

export async function render(container, navigate) {
  // Stash navigate on the container so nested helpers can call it
  container._navigate = navigate;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let data;
  try {
    data = await _fetchData();
  } catch (err) {
    console.error('[AdminDashboard] Failed to load:', err);
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load dashboard</h2>
        <p>${escHtml(err.message)}</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  _renderStats(container, data);
  _renderReviewQueue(container, data.recentQueue, navigate);
  _renderStockAlerts(container, data.outOfStock);
}
