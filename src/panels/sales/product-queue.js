import DB                                              from '../../core/db.js';
import { statusBadge, formatRelativeTime, formatCurrency, esc } from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container, navigate, params = {}) {
  const mode    = params.mode ?? 'queue';
  const isQueue = mode === 'queue';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let products;
  try {
    if (isQueue) {
      products = await DB.queryByIndex('products', 'status', 'PENDING_SALES');
    } else if (mode === 'active') {
      products = await DB.queryByIndex('products', 'status', 'READY_FOR_ECOMMERCE');
    } else {
      const [pending, ready] = await Promise.all([
        DB.queryByIndex('products', 'status', 'PENDING_SALES'),
        DB.queryByIndex('products', 'status', 'READY_FOR_ECOMMERCE'),
      ]);
      products = [...(pending || []), ...(ready || [])];
    }
  } catch (err) {
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load products</h2>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  products = [...(products || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  container.innerHTML = '';

  // Filter bar for active products view
  if (!isQueue) {
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap';

    const searchInput = document.createElement('input');
    searchInput.type        = 'text';
    searchInput.className   = 'form-input';
    searchInput.placeholder = 'Search by name or SKU…';
    searchInput.style.cssText = 'flex:1;min-width:200px;max-width:340px';

    filterBar.appendChild(searchInput);
    container.appendChild(filterBar);

    const tableWrap = document.createElement('div');
    container.appendChild(tableWrap);

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      const filtered = products.filter(p =>
        !q
        || (p.name || '').toLowerCase().includes(q)
        || (p.sku  || '').toLowerCase().includes(q)
      );
      renderTable(tableWrap, filtered, navigate, mode);
    });

    renderTable(tableWrap, products, navigate, mode);
    return;
  }

  renderTable(container, products, navigate, mode);
}

function renderTable(container, products, navigate, mode) {
  const isQueue = mode === 'queue';

  container.querySelector('.card')?.remove();

  const card = document.createElement('div');
  card.className = 'card';

  if (products.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">${isQueue ? '✅' : '💎'}</div>
        <div class="empty-state__title">${isQueue ? 'Queue is clear' : 'No active products'}</div>
        <div class="empty-state__desc">${isQueue
          ? 'No products are waiting for sales review.'
          : 'No products are ready for e-commerce yet.'}</div>
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
        <th>Admin Price</th>
        <th>Selling Price</th>
        <th>Status</th>
        <th>Updated</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');

  for (const p of products) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.innerHTML = `
      <div class="product-name">
        ${esc(p.name || 'Untitled')}
        <small>${esc(p.sku || '—')}</small>
      </div>`;

    const catTd = document.createElement('td');
    catTd.textContent = p.category || '—';

    const adminTd = document.createElement('td');
    adminTd.style.fontWeight = '600';
    adminTd.style.color      = 'var(--accent)';
    adminTd.textContent = p.transferPrice != null ? formatCurrency(p.transferPrice) : '—';

    const sellingTd = document.createElement('td');
    sellingTd.textContent = p.sellingPrice != null ? formatCurrency(p.sellingPrice) : '—';

    const statusTd = document.createElement('td');
    statusTd.appendChild(statusBadge(p.status));

    const updatedTd = document.createElement('td');
    updatedTd.style.color   = 'var(--text-muted)';
    updatedTd.style.fontSize = '12px';
    updatedTd.textContent   = formatRelativeTime(p.updatedAt);

    const actionTd = document.createElement('td');
    actionTd.className = 'product-actions';

    if (p.status === 'PENDING_SALES') {
      const reviewBtn = document.createElement('button');
      reviewBtn.className   = 'btn btn--primary btn--sm';
      reviewBtn.textContent = 'Review';
      reviewBtn.addEventListener('click', () =>
        navigate('products/detail', { id: p.id, returnTo: isQueue ? 'products/queue' : 'products/active' })
      );
      actionTd.appendChild(reviewBtn);
    }

    const viewBtn = document.createElement('button');
    viewBtn.className   = 'btn btn--ghost btn--sm';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () =>
      navigate('products/detail', { id: p.id, returnTo: isQueue ? 'products/queue' : 'products/active' })
    );
    actionTd.appendChild(viewBtn);

    tr.append(nameTd, catTd, adminTd, sellingTd, statusTd, updatedTd, actionTd);
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  container.appendChild(card);
}
