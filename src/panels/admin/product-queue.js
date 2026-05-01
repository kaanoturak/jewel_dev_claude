import DB                                                from '../../core/db.js';
import { statusBadge, formatRelativeTime, truncate, esc } from '../../shared/utils/index.js';

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function _fetchProducts(mode) {
  let products;
  if (mode === 'queue') {
    products = await DB.queryByIndex('products', 'status', 'PENDING_ADMIN');
  } else {
    products = await DB.getAll('products');
  }

  // Fetch primary image for each product
  for (const p of products) {
    if (p.images && p.images.length > 0) {
      const primaryIdx = p.primaryImageIndex ?? 0;
      const img = p.images[primaryIdx];
      if (img && img.id) {
        try {
          const blobRecord = await DB.get('mediaBlobs', img.id);
          if (blobRecord && blobRecord.blob) {
            p.primaryImageUrl = URL.createObjectURL(blobRecord.blob);
          }
        } catch (err) {
          console.warn(`Failed to load thumbnail for ${p.id}:`, err);
        }
      }
    }
  }
  return products;
}

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container, navigate, params = {}) {
  const mode      = params.mode ?? 'queue';
  const isQueue   = mode === 'queue';
  const emptyIcon = isQueue ? '✅' : '💎';
  const emptyMsg  = isQueue
    ? 'No products are waiting for review.'
    : 'No products have been created yet.';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let products;
  try {
    products = await _fetchProducts(mode);
  } catch (err) {
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load products</h2>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  // Sort: newest first
  products = [...(products || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  container.innerHTML = '';

  // ── Filter bar (all-products mode only) ──────────────────────────────────────
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
      opt.value       = s;
      opt.textContent = s || 'All statuses';
      select.appendChild(opt);
    });

    const searchInput = document.createElement('input');
    searchInput.type        = 'text';
    searchInput.className   = 'form-input';
    searchInput.placeholder = 'Search by name or SKU…';
    searchInput.style.cssText = 'flex:1;min-width:200px;max-width:340px';

    filterBar.append(select, searchInput);
    container.appendChild(filterBar);

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
      renderTable(tableWrap, filtered, navigate, mode);
    };

    select.addEventListener('change', applyFilter);
    searchInput.addEventListener('input', applyFilter);

    const tableWrap = document.createElement('div');
    container.appendChild(tableWrap);
    renderTable(tableWrap, products, navigate, mode);
    return;
  }

  // ── Queue mode: straight table, no filter bar ─────────────────────────────
  renderTable(container, products, navigate, mode);
}

function renderTable(container, products, navigate, mode) {
  const isQueue = mode === 'queue';

  // Remove existing card if re-rendering due to filter change
  container.querySelector('.card')?.remove();
  container.querySelector('.empty-state')?.remove();

  const card = document.createElement('div');
  card.className = 'card';

  if (products.length === 0) {
    const emptyIcon = isQueue ? '✅' : '💎';
    const emptyMsg  = isQueue
      ? 'No products are waiting for review.'
      : 'No products match this filter.';
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${emptyIcon}</div>
        <div class="empty-state__title">${isQueue ? 'Queue is clear' : 'No products'}</div>
        <div class="empty-state__desc">${emptyMsg}</div>
      </div>`;
    container.appendChild(card);
    return;
  }

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th>
        <th>Category</th>
        <th>Material</th>
        <th>Status</th>
        <th>Updated</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');

  for (const product of products) {
    const tr = document.createElement('tr');

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

    const catTd = document.createElement('td');
    catTd.textContent = product.category || '—';

    const matTd = document.createElement('td');
    matTd.textContent = product.material || '—';

    const statusTd = document.createElement('td');
    statusTd.appendChild(statusBadge(product.status));

    const updatedTd = document.createElement('td');
    updatedTd.style.color   = 'var(--text-muted)';
    updatedTd.textContent   = formatRelativeTime(product.updatedAt);

    const actionTd = document.createElement('td');
    actionTd.className = 'product-actions';

    if (product.status === 'PENDING_ADMIN') {
      const reviewBtn = document.createElement('button');
      reviewBtn.className   = 'btn btn--primary btn--sm';
      reviewBtn.textContent = 'Review';
      reviewBtn.addEventListener('click', () =>
        navigate('products/detail', { id: product.id, returnTo: mode === 'queue' ? 'products/queue' : 'products/all' })
      );
      actionTd.appendChild(reviewBtn);
    }

    const viewBtn = document.createElement('button');
    viewBtn.className   = 'btn btn--ghost btn--sm';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () =>
      navigate('products/detail', { id: product.id, returnTo: mode === 'queue' ? 'products/queue' : 'products/all' })
    );
    actionTd.appendChild(viewBtn);

    tr.append(nameTd, catTd, matTd, statusTd, updatedTd, actionTd);
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  container.appendChild(card);
}
