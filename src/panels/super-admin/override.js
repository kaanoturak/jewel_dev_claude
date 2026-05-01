import DB                              from '../../core/db.js';
import { transition }                  from '../../modules/workflow/index.js';
import { getCurrentUser }              from '../../modules/auth/index.js';
import { statusBadge, formatRelativeTime, esc } from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_STATUSES = [
  'DRAFT', 'PENDING_ADMIN', 'REVISION_REQUESTED_BY_ADMIN',
  'PENDING_SALES', 'REVISION_REQUESTED_BY_SALES',
  'READY_FOR_ECOMMERCE', 'REJECTED', 'ARCHIVED',
];

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let products;
  try {
    products = await DB.getAll('products');
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

  // Warning banner
  const warning = document.createElement('div');
  warning.className = 'alert alert--warning';
  warning.style.marginBottom = '20px';
  warning.innerHTML = `
    <strong>Super Admin Override</strong>
    <p style="margin-top:4px;font-size:13px">
      Force any product to any status, bypassing normal workflow rules.
      Use with caution — all actions are logged.
    </p>`;
  container.appendChild(warning);

  // ── Product search ────────────────────────────────────────────────────────
  const searchWrap = document.createElement('div');
  searchWrap.style.cssText = 'display:flex;gap:8px;margin-bottom:16px;align-items:center';

  const searchInput = document.createElement('input');
  searchInput.type        = 'text';
  searchInput.className   = 'form-input';
  searchInput.placeholder = 'Search product by name or SKU…';
  searchInput.style.cssText = 'flex:1;max-width:400px';

  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  const resultsWrap = document.createElement('div');
  container.appendChild(resultsWrap);

  // Override form (hidden until product selected)
  const overrideForm = document.createElement('div');
  overrideForm.id = 'override-form';
  overrideForm.style.display = 'none';
  container.appendChild(overrideForm);

  let selectedProduct = null;

  function renderResults(query) {
    resultsWrap.innerHTML = '';
    overrideForm.style.display = 'none';
    selectedProduct = null;

    if (!query) return;

    const q       = query.toLowerCase();
    const matched = products.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.sku  || '').toLowerCase().includes(q)
    ).slice(0, 10);

    if (matched.length === 0) {
      resultsWrap.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">No products found.</p>`;
      return;
    }

    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '16px';

    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none;padding:0;margin:0';

    for (const p of matched) {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 16px;'
        + 'border-bottom:1px solid var(--border-light);cursor:pointer';
      li.innerHTML = `
        <div style="flex:1">
          <span style="font-weight:600;font-size:13px">${esc(p.name || 'Untitled')}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:8px;font-family:var(--font-mono)">${esc(p.sku || '')}</span>
        </div>
        <div></div>
        <span style="font-size:12px;color:var(--text-muted)">${formatRelativeTime(p.updatedAt)}</span>`;
      li.querySelector('div:last-of-type').appendChild(statusBadge(p.status));

      li.addEventListener('click', () => {
        selectedProduct = p;
        resultsWrap.innerHTML = '';
        searchInput.value = p.name || p.sku || '';
        showOverrideForm(p);
      });

      ul.appendChild(li);
    }

    card.appendChild(ul);
    resultsWrap.appendChild(card);
  }

  searchInput.addEventListener('input', () => renderResults(searchInput.value.trim()));

  function showOverrideForm(product) {
    overrideForm.style.display = 'block';
    overrideForm.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'max-width:640px;overflow:hidden';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);'
      + 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)';
    hdr.textContent = 'Force Status Transition';
    card.appendChild(hdr);

    const body = document.createElement('div');
    body.style.cssText = 'padding:16px 20px 8px';

    // Current status
    const curRow = document.createElement('div');
    curRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;'
      + 'padding:10px;background:var(--bg);border-radius:var(--r-sm)';
    curRow.innerHTML = `<span style="font-size:13px;color:var(--text-muted)">Current status:</span>`;
    curRow.appendChild(statusBadge(product.status));
    body.appendChild(curRow);

    // Target status
    const targetRow = document.createElement('div');
    targetRow.style.cssText = 'display:grid;grid-template-columns:160px 1fr;gap:8px;align-items:center;'
      + 'padding:7px 0;border-bottom:1px solid var(--border-light)';
    targetRow.innerHTML = `<label for="override-status" style="font-size:13px;color:var(--text-muted)">
      Force to Status <span style="color:var(--red,#ef4444)">*</span></label>`;

    const statusSelect = document.createElement('select');
    statusSelect.id = 'override-status';
    statusSelect.className = 'form-select';
    statusSelect.style.cssText = 'width:auto;min-width:220px';

    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = 'Select target status…';
    statusSelect.appendChild(blankOpt);

    for (const s of ALL_STATUSES) {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === product.status) opt.disabled = true;
      statusSelect.appendChild(opt);
    }
    targetRow.appendChild(statusSelect);
    body.appendChild(targetRow);

    // Notes
    const notesRow = document.createElement('div');
    notesRow.style.cssText = 'display:grid;grid-template-columns:160px 1fr;gap:8px;align-items:start;'
      + 'padding:7px 0;border-bottom:1px solid var(--border-light)';
    notesRow.innerHTML = `<label for="override-notes" style="font-size:13px;color:var(--text-muted);padding-top:6px">
      Reason / Notes</label>`;
    const notesArea = document.createElement('textarea');
    notesArea.id = 'override-notes';
    notesArea.className = 'form-textarea';
    notesArea.style.cssText = 'width:100%;min-height:70px;font-size:13px;resize:vertical';
    notesArea.placeholder = 'Required for revision/reject statuses; optional otherwise.';
    notesRow.appendChild(notesArea);
    body.appendChild(notesRow);

    const errorEl = document.createElement('div');
    errorEl.className = 'alert alert--error';
    errorEl.style.display = 'none';
    errorEl.style.marginTop = '10px';
    body.appendChild(errorEl);

    card.appendChild(body);

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px';

    const applyBtn = document.createElement('button');
    applyBtn.className   = 'btn btn--danger btn--sm';
    applyBtn.textContent = 'Force Transition';

    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'btn btn--ghost btn--sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      overrideForm.style.display = 'none';
      searchInput.value = '';
    });

    footer.append(applyBtn, cancelBtn);
    card.appendChild(footer);
    overrideForm.appendChild(card);

    applyBtn.addEventListener('click', async () => {
      const toStatus = statusSelect.value;
      const notes    = notesArea.value.trim();

      if (!toStatus) {
        errorEl.textContent = 'Select a target status.';
        errorEl.style.display = 'block';
        return;
      }

      applyBtn.disabled = true;
      applyBtn.textContent = 'Applying…';
      errorEl.style.display = 'none';

      try {
        const user = getCurrentUser();
        // Super admin override — transition() allows any transition for SUPER_ADMIN role
        await transition(product.id, toStatus, user?.userId, notes || undefined);

        // Refresh local product record
        const updated = await DB.get('products', product.id);
        if (updated) {
          const idx = products.findIndex(p => p.id === product.id);
          if (idx !== -1) products[idx] = updated;
          showOverrideForm(updated);
        }

        const successBanner = document.createElement('div');
        successBanner.className = 'alert alert--success';
        successBanner.style.cssText = 'margin-bottom:16px';
        successBanner.textContent = `Product moved to ${toStatus}.`;
        overrideForm.insertBefore(successBanner, overrideForm.firstChild);
        setTimeout(() => successBanner.remove(), 3000);

      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = 'block';
        applyBtn.disabled = false;
        applyBtn.textContent = 'Force Transition';
      }
    });
  }
}
