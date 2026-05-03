import DB                                                from '../../core/db.js';
import { getCurrentUser }                               from '../../modules/auth/index.js';
import { statusBadge, formatRelativeTime, esc }         from '../../shared/utils/index.js';

const QUEUE_STATUSES = new Set(['DRAFT', 'REVISION_REQUESTED_BY_ADMIN']);

async function _fetchProducts(mode, userId) {
  let products;
  if (mode === 'queue') {
    const [drafts, revisions] = await Promise.all([
      DB.queryByIndex('products', 'status', 'DRAFT'),
      DB.queryByIndex('products', 'status', 'REVISION_REQUESTED_BY_ADMIN'),
    ]);
    products = [...(drafts || []), ...(revisions || [])].filter(p => p.createdBy === userId);
  } else {
    const all = await DB.getAll('products') || [];
    products = all.filter(p => p.createdBy === userId);
  }

  // Resolve thumbnails
  const productIds = products.filter(p => p.images?.length).map(p => p.id);
  const blobsByProduct = {};
  await Promise.all(productIds.map(async id => {
    try {
      const blobs = await DB.queryByIndex('mediaBlobs', 'productId', id);
      blobsByProduct[id] = Object.fromEntries((blobs || []).map(b => [b.blobId, b]));
    } catch { /* skip */ }
  }));
  for (const p of products) {
    if (!p.images?.length) continue;
    const img = p.images[p.primaryImageIndex ?? 0];
    if (!img?.id) continue;
    const blob = blobsByProduct[p.id]?.[img.id];
    if (blob?.blob) p.primaryImageUrl = (typeof blob.blob === 'string' ? blob.blob : URL.createObjectURL(blob.blob));
  }
  return products;
}

export async function render(container, navigate, params = {}) {
  const mode    = params.mode ?? 'queue';
  const isQueue = mode === 'queue';
  const userId  = getCurrentUser()?.userId;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let products;
  try {
    products = await _fetchProducts(mode, userId);
  } catch (err) {
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load products</h2>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  products = [...products].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  container.innerHTML = '';

  if (!isQueue) {
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap';

    const STATUSES = [
      '', 'DRAFT', 'PENDING_ADMIN', 'REVISION_REQUESTED_BY_ADMIN',
      'PENDING_SALES', 'REVISION_REQUESTED_BY_SALES',
      'READY_FOR_ECOMMERCE', 'REJECTED', 'ARCHIVED',
    ];
    const select = document.createElement('select');
    select.className = 'form-select';
    select.style.cssText = 'width:auto;min-width:180px';
    STATUSES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s || 'All statuses';
      select.appendChild(opt);
    });

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'form-input';
    searchInput.placeholder = 'Search by name or SKU…';
    searchInput.style.cssText = 'flex:1;min-width:200px;max-width:340px';

    filterBar.append(select, searchInput);
    container.appendChild(filterBar);

    const tableWrap = document.createElement('div');
    container.appendChild(tableWrap);

    const applyFilter = () => {
      const statusFilter = select.value;
      const query        = searchInput.value.trim().toLowerCase();
      const filtered     = products.filter(p => {
        const matchStatus = !statusFilter || p.status === statusFilter;
        const matchSearch = !query
          || (p.name || '').toLowerCase().includes(query)
          || (p.sku  || '').toLowerCase().includes(query);
        return matchStatus && matchSearch;
      });
      _renderTable(tableWrap, filtered, navigate, mode);
    };
    select.addEventListener('change', applyFilter);
    searchInput.addEventListener('input', applyFilter);
    _renderTable(tableWrap, products, navigate, mode);
    return;
  }

  _renderTable(container, products, navigate, mode);
}

function _renderTable(container, products, navigate, mode) {
  const isQueue = mode === 'queue';
  container.querySelector('.card')?.remove();

  const card = document.createElement('div');
  card.className = 'card';

  if (products.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${isQueue ? '✅' : '💎'}</div>
        <div class="empty-state__title">${isQueue ? 'Nothing to action' : 'No products'}</div>
        <div class="empty-state__desc">${isQueue
          ? 'No products are in Draft or awaiting revision.'
          : 'No products match this filter.'}</div>
      </div>`;
    container.appendChild(card);
    return;
  }

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th><th>Category</th><th>Material</th>
        <th>Status</th><th>Updated</th><th></th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');
  for (const p of products) {
    const tr = document.createElement('tr');

    const thumbHTML = p.primaryImageUrl
      ? `<img src="${p.primaryImageUrl}" style="width:32px;height:32px;object-fit:cover;border-radius:4px">`
      : `<div style="width:32px;height:32px;background:var(--bg);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:0.3">💎</div>`;

    const nameTd = document.createElement('td');
    nameTd.innerHTML = `
      <div class="product-name" style="display:flex;align-items:center;gap:10px">
        ${thumbHTML}
        <div>${esc(p.name || 'Untitled')}<small>${esc(p.sku || '—')}</small></div>
      </div>`;

    const catTd = document.createElement('td'); catTd.textContent = p.category || '—';
    const matTd = document.createElement('td'); matTd.textContent = p.material || '—';
    const statusTd = document.createElement('td'); statusTd.appendChild(statusBadge(p.status));
    const updatedTd = document.createElement('td');
    updatedTd.style.color = 'var(--text-muted)';
    updatedTd.textContent = formatRelativeTime(p.updatedAt);

    const actionTd = document.createElement('td');
    actionTd.className = 'product-actions';

    const returnTo = mode === 'queue' ? 'products/queue' : 'products/all';
    if (QUEUE_STATUSES.has(p.status)) {
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn--primary btn--sm';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => navigate('products/edit', { id: p.id, returnTo }));
      actionTd.appendChild(editBtn);
    }
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn--ghost btn--sm';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => navigate('products/view', { id: p.id, returnTo }));
    actionTd.appendChild(viewBtn);

    tr.append(nameTd, catTd, matTd, statusTd, updatedTd, actionTd);
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  container.appendChild(card);
}
