import DB      from '../../core/db.js';
import { esc } from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Data ──────────────────────────────────────────────────────────────────────

async function _load() {
  const [allProducts, allVariants] = await Promise.all([
    DB.getAll('products'),
    DB.getAll('variants'),
  ]);

  const productMap = Object.fromEntries((allProducts || []).map(p => [p.id, p]));
  const rows = (allVariants || []).map(v => ({
    ...v,
    productName:   productMap[v.productId]?.name   || '—',
    productStatus: productMap[v.productId]?.status || '—',
    productSku:    productMap[v.productId]?.sku    || '—',
  }));

  return rows;
}

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let rows;
  try {
    rows = await _load();
  } catch (err) {
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load stock data</h2>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  // ── Filter bar ────────────────────────────────────────────────────────────
  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center';

  const searchInput = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.className   = 'form-input';
  searchInput.placeholder = 'Search by product name or SKU…';
  searchInput.style.cssText = 'flex:1;min-width:200px;max-width:360px';

  const stockSelect = document.createElement('select');
  stockSelect.className = 'form-select';
  stockSelect.style.cssText = 'width:auto;min-width:150px';
  [
    ['',       'All stock levels'],
    ['out',    'Out of stock (0)'],
    ['low',    'Low stock (1–5)'],
    ['in',     'In stock (>5)'],
  ].forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    stockSelect.appendChild(opt);
  });

  const activeSelect = document.createElement('select');
  activeSelect.className = 'form-select';
  activeSelect.style.cssText = 'width:auto;min-width:130px';
  [['', 'All variants'], ['1', 'Active only'], ['0', 'Inactive only']].forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    activeSelect.appendChild(opt);
  });

  const countEl = document.createElement('span');
  countEl.style.cssText = 'font-size:12px;color:var(--text-muted);margin-left:auto';

  filterBar.append(searchInput, stockSelect, activeSelect, countEl);
  container.appendChild(filterBar);

  // ── Table wrapper ─────────────────────────────────────────────────────────
  const tableWrap = document.createElement('div');
  container.appendChild(tableWrap);

  function applyFilter() {
    const query      = searchInput.value.trim().toLowerCase();
    const stockLevel = stockSelect.value;
    const activeVal  = activeSelect.value;

    const filtered = rows.filter(v => {
      const matchSearch = !query
        || (v.productName || '').toLowerCase().includes(query)
        || (v.sku         || '').toLowerCase().includes(query)
        || (v.productSku  || '').toLowerCase().includes(query);

      const stock = v.stockCount ?? 0;
      const matchStock =
        !stockLevel       ? true
        : stockLevel === 'out' ? stock === 0
        : stockLevel === 'low' ? stock > 0 && stock <= 5
        : stock > 5;

      const isActive = v.isActive !== false;
      const matchActive =
        !activeVal         ? true
        : activeVal === '1' ? isActive
        : !isActive;

      return matchSearch && matchStock && matchActive;
    });

    renderTable(tableWrap, filtered, countEl);
  }

  searchInput.addEventListener('input', applyFilter);
  stockSelect.addEventListener('change', applyFilter);
  activeSelect.addEventListener('change', applyFilter);

  applyFilter();
}

function renderTable(wrap, rows, countEl) {
  wrap.querySelector('.card')?.remove();
  countEl.textContent = `${rows.length} variant${rows.length !== 1 ? 's' : ''}`;

  const card = document.createElement('div');
  card.className = 'card';

  if (rows.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📦</div>
        <div class="empty-state__title">No variants match</div>
        <div class="empty-state__desc">Adjust the filters above.</div>
      </div>`;
    wrap.appendChild(card);
    return;
  }

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th>
        <th>Variant SKU</th>
        <th>Size</th>
        <th>Color</th>
        <th>Weight</th>
        <th>Stock</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');

  const sorted = [...rows].sort((a, b) => (a.stockCount ?? 0) - (b.stockCount ?? 0));

  for (const v of sorted) {
    const stock = v.stockCount ?? 0;
    const stockBadge = stock === 0
      ? `<span class="badge badge--red">0</span>`
      : stock <= 5
        ? `<span class="badge badge--amber">${stock}</span>`
        : `<span class="badge badge--green">${stock}</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="product-name">
          ${esc(v.productName)}
          <small>${esc(v.productSku)}</small>
        </div>
      </td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(v.sku || '—')}</td>
      <td>${esc(v.size  || '—')}</td>
      <td>${esc(v.color || '—')}</td>
      <td>${v.weight != null ? `${v.weight} g` : '—'}</td>
      <td>${stockBadge}</td>
      <td>${v.isActive !== false
            ? '<span class="badge badge--green">Active</span>'
            : '<span class="badge badge--stone">Inactive</span>'}</td>`;
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  wrap.appendChild(card);
}
