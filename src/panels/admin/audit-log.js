import DB      from '../../core/db.js';
import { esc } from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ACTION_LABELS = {
  STATUS_TRANSITION:    'Status change',
  FIELD_EDIT:           'Fields edited',
  COST_EDIT:            'Costs updated',
  PRODUCT_CREATED:      'Product created',
  PRODUCT_DELETED:      'Product deleted',
  VARIANT_ADDED:        'Variant added',
  VARIANT_EDITED:       'Variant edited',
  VARIANT_DELETED:      'Variant deleted',
};

function actionLabel(action) {
  return ACTION_LABELS[action] || action;
}

function actionBadgeClass(action) {
  if (action === 'STATUS_TRANSITION') return 'badge--blue';
  if (action === 'PRODUCT_CREATED')   return 'badge--green';
  if (action === 'PRODUCT_DELETED')   return 'badge--red';
  return 'badge--gray';
}

// ─── Data ──────────────────────────────────────────────────────────────────────

async function _load(productId) {
  if (productId) {
    return DB.queryByIndex('auditLog', 'productId', productId);
  }
  return DB.getAll('auditLog');
}

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container, navigate, params = {}) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let entries;
  try {
    entries = await _load(params.productId || null);
  } catch (err) {
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load audit log</h2>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  // Newest first
  entries = [...(entries || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  container.innerHTML = '';

  // ── Filter bar ────────────────────────────────────────────────────────────
  const filterBar = document.createElement('div');
  filterBar.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center';

  const searchInput = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.className   = 'form-input';
  searchInput.placeholder = 'Search by user, product, or action…';
  searchInput.style.cssText = 'flex:1;min-width:200px;max-width:360px';

  const actionSelect = document.createElement('select');
  actionSelect.className = 'form-select';
  actionSelect.style.cssText = 'width:auto;min-width:160px';
  const actionTypes = ['', ...new Set((entries).map(e => e.action).filter(Boolean))];
  actionTypes.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a ? actionLabel(a) : 'All actions';
    actionSelect.appendChild(opt);
  });

  const countEl = document.createElement('span');
  countEl.style.cssText = 'font-size:12px;color:var(--text-muted);margin-left:auto';

  filterBar.append(searchInput, actionSelect, countEl);
  container.appendChild(filterBar);

  const tableWrap = document.createElement('div');
  container.appendChild(tableWrap);

  function applyFilter() {
    const query  = searchInput.value.trim().toLowerCase();
    const action = actionSelect.value;

    const filtered = entries.filter(e => {
      const matchAction = !action || e.action === action;
      const matchSearch = !query
        || (e.userId      || '').toLowerCase().includes(query)
        || (e.productId   || '').toLowerCase().includes(query)
        || (e.action      || '').toLowerCase().includes(query)
        || (e.toStatus    || '').toLowerCase().includes(query)
        || (e.fromStatus  || '').toLowerCase().includes(query)
        || (e.notes       || '').toLowerCase().includes(query);
      return matchAction && matchSearch;
    });

    renderTable(tableWrap, filtered, countEl);
  }

  searchInput.addEventListener('input', applyFilter);
  actionSelect.addEventListener('change', applyFilter);

  applyFilter();
}

function renderTable(wrap, entries, countEl) {
  wrap.querySelector('.card')?.remove();
  countEl.textContent = `${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}`;

  const card = document.createElement('div');
  card.className = 'card';

  if (entries.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <div class="empty-state__title">No log entries</div>
        <div class="empty-state__desc">No audit events match the current filter.</div>
      </div>`;
    wrap.appendChild(card);
    return;
  }

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>When</th>
        <th>Action</th>
        <th>Product</th>
        <th>Transition</th>
        <th>User</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');

  for (const e of entries) {
    const tr = document.createElement('tr');

    const transitionHTML = (e.fromStatus || e.toStatus)
      ? `<span style="font-size:11px;color:var(--text-muted)">${esc(e.fromStatus || '—')}</span>`
        + ` <span style="color:var(--text-muted)">→</span> `
        + `<span style="font-size:11px">${esc(e.toStatus || '—')}</span>`
      : '—';

    tr.innerHTML = `
      <td style="white-space:nowrap;color:var(--text-muted);font-size:12px">${esc(formatTs(e.timestamp))}</td>
      <td><span class="badge ${actionBadgeClass(e.action)}">${esc(actionLabel(e.action))}</span></td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(e.productId || '—')}</td>
      <td style="white-space:nowrap">${transitionHTML}</td>
      <td style="font-size:12px;color:var(--text-muted)">${esc(e.userId || '—')}</td>
      <td style="font-size:12px;max-width:260px;white-space:pre-wrap;word-break:break-word">${esc(e.notes || '')}</td>`;
    tbody.appendChild(tr);
  }

  card.appendChild(table);
  wrap.appendChild(card);
}
