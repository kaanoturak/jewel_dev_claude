import DB                              from '../../core/db.js';
import { getCurrentUser }              from '../../modules/auth/index.js';
import { statusBadge, formatRelativeTime, truncate, esc } from '../../shared/utils/index.js';

// Statuses that allow the manufacturer to edit the product
const EDITABLE_STATUSES = new Set(['DRAFT', 'REVISION_REQUESTED_BY_ADMIN', 'REVISION_REQUESTED_BY_SALES']);

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchMyProducts() {
  const user = getCurrentUser();
  if (!user) return [];
  const products = await DB.queryByIndex('products', 'createdBy', user.userId);

  // Fetch primary image for each product to show in the table
  for (const p of products) {
    const primaryIdx  = p.primaryImageIndex ?? 0;
    const primaryMeta = p.images?.[primaryIdx];
    if (!primaryMeta?.id) continue;
    try {
      const blobs = await DB.queryByIndex('mediaBlobs', 'productId', p.id);
      const rec   = (blobs || []).find(b => b.blobId === primaryMeta.id);
      if (rec?.blob) p.primaryImageUrl = URL.createObjectURL(rec.blob);
    } catch (err) {
      console.warn(`Failed to load thumbnail for ${p.id}:`, err);
    }
  }
  return products;
}

// ─── Stat cards ───────────────────────────────────────────────────────────────

function renderStatCards(container, products) {
  const total     = products.length;
  const revisions = products.filter((p) =>
    p.status === 'REVISION_REQUESTED_BY_ADMIN' || p.status === 'REVISION_REQUESTED_BY_SALES'
  ).length;
  const submitted = products.filter((p) => p.status === 'PENDING_ADMIN').length;

  const cards = [
    { value: total,     label: 'Total Products',    alert: false },
    { value: revisions, label: 'Pending Revisions', alert: revisions > 0 },
    { value: submitted, label: 'Awaiting Admin',    alert: false },
  ];

  const grid = document.createElement('div');
  grid.className = 'stat-cards';

  for (const { value, label, alert } of cards) {
    const card = document.createElement('div');
    card.className = `stat-card${alert ? ' stat-card--alert' : ''}`;
    card.innerHTML = `
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>
    `;
    grid.appendChild(card);
  }

  container.appendChild(grid);
}

// ─── Revision alerts ──────────────────────────────────────────────────────────

function renderRevisionSection(container, products, navigate) {
  const revisions = products.filter((p) =>
    p.status === 'REVISION_REQUESTED_BY_ADMIN' ||
    p.status === 'REVISION_REQUESTED_BY_SALES'
  );
  if (revisions.length === 0) return;

  const section = document.createElement('div');
  section.className = 'section';
  section.innerHTML = `
    <div class="section-header">
      <span class="section-title">⚠ Pending Revisions</span>
    </div>
    <div class="revision-list" id="revision-list"></div>
  `;

  const list = section.querySelector('#revision-list');
  for (const product of revisions) {
    const byLabel = product.status === 'REVISION_REQUESTED_BY_SALES' ? 'Sales' : 'Admin';
    const row = document.createElement('div');
    row.className = 'revision-item';
    row.innerHTML = `
      <span class="revision-item__name">${esc(product.name || 'Untitled')}</span>
      <span class="revision-item__sku">${esc(product.sku || '—')}</span>
      <span class="revision-item__notes">
        <strong style="font-size:11px;color:var(--text-muted)">${esc(byLabel)}:</strong>
        ${product.revisionNotes ? esc(truncate(product.revisionNotes, 80)) : 'No notes provided'}
      </span>
    `;

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn--secondary btn--sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => navigate('products/edit', { id: product.id }));
    row.appendChild(editBtn);

    list.appendChild(row);
  }

  container.appendChild(section);
}

// ─── Products table ───────────────────────────────────────────────────────────

function renderProductsTable(container, products, navigate) {
  const section = document.createElement('div');
  section.className = 'section';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-title">My Products</span>`;
  section.appendChild(header);

  const card = document.createElement('div');
  card.className = 'card';

  if (products.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">💎</div>
        <div class="empty-state__title">No products yet</div>
        <div class="empty-state__desc">Create your first product to get started.</div>
      </div>`;
    section.appendChild(card);
    container.appendChild(section);
    return;
  }

  // Sort: most recently updated first
  const sorted = [...products].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th>
        <th>Category</th>
        <th>Status</th>
        <th>Updated</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="products-tbody"></tbody>
  `;

  const tbody = table.querySelector('#products-tbody');

  for (const product of sorted) {
    const tr = document.createElement('tr');

    // Product name + SKU cell
    const nameTd = document.createElement('td');
    const thumbHTML = product.primaryImageUrl
      ? `<img src="${product.primaryImageUrl}" style="width:32px;height:32px;object-fit:cover;border-radius:4px">`
      : `<div style="width:32px;height:32px;background:var(--bg);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:0.3">💎</div>`;

    nameTd.innerHTML = `
      <div class="product-name" style="display:flex;align-items:center;gap:10px">
        ${thumbHTML}
        <div>
          ${esc(product.name || 'Untitled')}
          <small>${esc(product.sku || '—')}</small>
        </div>
      </div>`;

    // Category
    const catTd = document.createElement('td');
    catTd.textContent = product.category || '—';

    // Status badge
    const statusTd = document.createElement('td');
    statusTd.appendChild(statusBadge(product.status));

    // Updated
    const updatedTd = document.createElement('td');
    updatedTd.style.color = 'var(--text-muted)';
    updatedTd.textContent = formatRelativeTime(product.updatedAt);

    // Actions
    const actionsTd = document.createElement('td');
    actionsTd.className = 'product-actions';

    const canEdit = EDITABLE_STATUSES.has(product.status);

    if (canEdit) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn--secondary btn--sm';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => navigate('products/edit', { id: product.id }));
      actionsTd.appendChild(editBtn);
    }

    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn--ghost btn--sm';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => navigate('products/view', { id: product.id }));
    actionsTd.appendChild(viewBtn);

    tr.append(nameTd, catTd, statusTd, updatedTd, actionsTd);
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  section.appendChild(card);
  container.appendChild(section);
}

// ─── Public render ────────────────────────────────────────────────────────────

export async function render(container, navigate) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let products;
  try {
    products = await fetchMyProducts();
  } catch (err) {
    console.error('[Dashboard] Failed to load products:', err);
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load products</h2>
        <p>${err.message}</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  renderStatCards(container, products);
  renderRevisionSection(container, products, navigate);
  renderProductsTable(container, products, navigate);
}
