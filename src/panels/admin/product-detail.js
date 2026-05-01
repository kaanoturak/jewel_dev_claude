import DB                              from '../../core/db.js';
import { calculate }                   from '../../core/engine.js';
import { transition }                  from '../../modules/workflow/index.js';
import { getCurrentUser }              from '../../modules/auth/index.js';
import { statusBadge, formatCurrency, formatDate, formatRelativeTime, esc } from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function field(label, value) {
  if (value === '' || value === null || value === undefined) return '';
  return `
    <div style="display:grid;grid-template-columns:180px 1fr;gap:8px;padding:7px 0;
                border-bottom:1px solid var(--border-light);font-size:13px">
      <span style="color:var(--text-muted)">${esc(label)}</span>
      <span style="color:var(--text);font-weight:500;word-break:break-word">${value}</span>
    </div>`;
}

function sectionCard(title, bodyHTML) {
  return `
    <div class="card" style="margin-bottom:20px;overflow:hidden">
      <div style="padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);
                  font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;
                  color:var(--text-muted)">${esc(title)}</div>
      <div style="padding:4px 20px 12px">${bodyHTML}</div>
    </div>`;
}

// ─── Load ──────────────────────────────────────────────────────────────────────

async function _load(productId) {
  const product = await DB.get('products', productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const [variants, blobs] = await Promise.all([
    DB.queryByIndex('variants', 'productId', productId),
    DB.queryByIndex('mediaBlobs', 'productId', productId),
  ]);

  const blobMap = Object.fromEntries((blobs || []).map(b => [b.blobId, b]));
  const images  = (product.images || []).map(img => {
    const b = blobMap[img.id];
    return b ? { ...img, url: URL.createObjectURL(b.blob) } : img;
  });

  return { product: { ...product, images }, variants: variants || [] };
}

// ─── Read-only sections ────────────────────────────────────────────────────────

function _renderProductHeader(product) {
  const primaryImg = product.images?.[product.primaryImageIndex ?? 0];

  const thumbHTML = primaryImg?.url
    ? `<img src="${esc(primaryImg.url)}" alt="${esc(primaryImg.altText || product.name)}"
            style="width:72px;height:72px;object-fit:cover;border-radius:var(--r-md);flex-shrink:0">`
    : `<div style="width:72px;height:72px;border-radius:var(--r-md);background:var(--bg);
                   display:flex;align-items:center;justify-content:center;font-size:28px;
                   opacity:.3;flex-shrink:0">💎</div>`;

  return `
    <div class="card" style="margin-bottom:20px;padding:20px 24px;display:flex;align-items:flex-start;gap:20px">
      ${thumbHTML}
      <div style="flex:1;min-width:0">
        <div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:4px">
          ${esc(product.name || 'Untitled')}
        </div>
        <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-bottom:10px">
          ${esc(product.sku || '—')}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          ${statusBadge(product.status).outerHTML}
          ${product.category  ? `<span class="badge badge--gray">${esc(product.category)}</span>`  : ''}
          ${product.material  ? `<span class="badge badge--gray">${esc(product.material)}</span>`  : ''}
          ${product.collection? `<span class="badge badge--gray">${esc(product.collection)}</span>`: ''}
        </div>
      </div>
    </div>`;
}

function _renderProductInfo(product) {
  const rows = [
    field('Description', product.productDescription
      ? `<span style="white-space:pre-wrap">${product.productDescription}</span>` : ''),
    field('SEO Title',   esc(product.seoTitle || '')),
    field('Category',    esc(product.category || '—')),
    field('Material',    esc(product.material || '—')),
    field('Collection',  esc(product.collection || '')),
    field('Submitted',   formatRelativeTime(product.updatedAt)),
    field('Version',     String(product.version || 1)),
  ].join('');

  return sectionCard('Product Info', rows);
}

function _renderManufacturerCosts(product) {
  const m    = Number(product.costMaterial)  || 0;
  const l    = Number(product.costLabor)     || 0;
  const p    = Number(product.costPackaging) || 0;
  const base = m + l + p;

  const rows = [
    field('Material Cost',  formatCurrency(m)),
    field('Labor Cost',     formatCurrency(l)),
    field('Packaging Cost', formatCurrency(p)),
  ].join('');

  const totalHTML = `
    <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;
                border-top:2px solid var(--border);padding-top:10px;margin-top:6px">
      <span>Total Base Cost</span>
      <span style="color:var(--accent)">${formatCurrency(base)}</span>
    </div>`;

  return sectionCard('Manufacturer Costs (read-only)', rows + totalHTML);
}

function _renderVariants(variants) {
  if (!variants.length) {
    return sectionCard('Variants', `<p style="color:var(--text-muted);font-size:13px;padding:8px 0">No variants defined.</p>`);
  }

  const rows = variants.map(v => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:11px">${esc(v.sku || '—')}</td>
      <td>${esc(v.size  || '—')}</td>
      <td>${esc(v.color || '—')}</td>
      <td>${v.weight != null ? `${v.weight} g` : '—'}</td>
      <td>${v.stockCount ?? 0}</td>
      <td>${v.isActive !== false
            ? '<span class="badge badge--green">Active</span>'
            : '<span class="badge badge--stone">Inactive</span>'}</td>
    </tr>`).join('');

  const tableHTML = `
    <table class="products-table" style="margin-top:4px">
      <thead>
        <tr><th>SKU</th><th>Size</th><th>Color</th><th>Weight</th><th>Stock</th><th>Status</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  return sectionCard(`Variants (${variants.length})`, tableHTML);
}

// ─── Admin cost form ───────────────────────────────────────────────────────────

function _buildAdminCostForm(container, product) {
  const section = document.createElement('div');
  section.className = 'card';
  section.style.marginBottom = '20px';
  section.style.overflow = 'hidden';

  const header = document.createElement('div');
  header.style.cssText = 'padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);'
    + 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)';
  header.textContent = 'Admin Pricing';
  section.appendChild(header);

  const body = document.createElement('div');
  body.style.cssText = 'padding:16px 20px 20px';

  const numField = (id, label, value, required = false, hint = '') => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;grid-template-columns:180px 1fr;gap:8px;align-items:center;'
      + 'padding:7px 0;border-bottom:1px solid var(--border-light)';
    wrap.innerHTML = `
      <label for="${id}" style="font-size:13px;color:var(--text-muted)">
        ${esc(label)}${required ? ' <span style="color:var(--red,#ef4444)">*</span>' : ''}
      </label>
      <div style="display:flex;align-items:center;gap:8px">
        <input id="${id}" type="number" step="0.01" min="0"
               class="form-input" style="width:140px"
               value="${value != null ? value : ''}">
        ${hint ? `<span style="font-size:12px;color:var(--text-muted)">${esc(hint)}</span>` : ''}
      </div>`;
    return wrap;
  };

  body.appendChild(numField('admin-tax-pct',       'Tax %',            product.adminTaxPct,          false, '%'));
  body.appendChild(numField('admin-margin-pct',    'Target Margin %',  product.adminMarginPct,       true,  '% (required)'));
  body.appendChild(numField('admin-logistics',     'Logistics Cost',   product.adminLogisticsCost,   false, formatCurrency(0)));
  body.appendChild(numField('admin-marketing',     'Marketing Cost',   product.adminMarketingCost,   false, formatCurrency(0)));
  body.appendChild(numField('admin-misc',          'Misc Cost',        product.adminMiscCost,        false, formatCurrency(0)));

  // Live transfer price preview
  const previewRow = document.createElement('div');
  previewRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;'
    + 'font-size:14px;font-weight:700;border-top:2px solid var(--border);padding-top:12px;margin-top:8px';
  previewRow.innerHTML = `
    <span>Transfer Price (preview)</span>
    <span id="transfer-preview" style="color:var(--accent);font-size:16px">—</span>`;
  body.appendChild(previewRow);

  section.appendChild(body);
  container.appendChild(section);

  // Live update logic
  const allInputs = body.querySelectorAll('input[type=number]');
  const previewEl = body.querySelector('#transfer-preview');

  function updatePreview() {
    const draft = {
      ...product,
      adminTaxPct:          parseFloatOrNull(body.querySelector('#admin-tax-pct')?.value),
      adminMarginPct:       parseFloatOrNull(body.querySelector('#admin-margin-pct')?.value),
      adminLogisticsCost:   parseFloatOrNull(body.querySelector('#admin-logistics')?.value),
      adminMarketingCost:   parseFloatOrNull(body.querySelector('#admin-marketing')?.value),
      adminMiscCost:        parseFloatOrNull(body.querySelector('#admin-misc')?.value),
    };
    const { transferPrice } = calculate(draft);
    previewEl.textContent = transferPrice != null ? formatCurrency(transferPrice) : '—';
  }

  allInputs.forEach(inp => inp.addEventListener('input', updatePreview));
  updatePreview();
}

function parseFloatOrNull(str) {
  if (str === '' || str == null) return null;
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function _collectAdminCosts(container) {
  return {
    adminTaxPct:         parseFloatOrNull(container.querySelector('#admin-tax-pct')?.value),
    adminMarginPct:      parseFloatOrNull(container.querySelector('#admin-margin-pct')?.value),
    adminLogisticsCost:  parseFloatOrNull(container.querySelector('#admin-logistics')?.value),
    adminMarketingCost:  parseFloatOrNull(container.querySelector('#admin-marketing')?.value),
    adminMiscCost:       parseFloatOrNull(container.querySelector('#admin-misc')?.value),
  };
}

// ─── Action bar ───────────────────────────────────────────────────────────────

function _buildActionBar(pageEl, product, navigate, returnTo, contentContainer) {
  const isPending = product.status === 'PENDING_ADMIN';
  // ... (rest of the function using contentContainer for _collectAdminCosts)
  const isPending = product.status === 'PENDING_ADMIN';

  const bar = document.createElement('div');
  bar.style.cssText = 'position:sticky;bottom:0;background:var(--surface);border-top:1px solid var(--border);'
    + 'padding:14px 28px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;z-index:10';

  if (!isPending) {
    const note = document.createElement('p');
    note.style.cssText = 'font-size:13px;color:var(--text-muted);margin:0';
    note.textContent = `This product is ${product.status} — no actions available.`;
    bar.appendChild(note);
    pageEl.appendChild(bar);
    return;
  }

  const user = getCurrentUser();

  // ── Save costs button ──
  const saveBtn = document.createElement('button');
  saveBtn.className   = 'btn btn--secondary btn--sm';
  saveBtn.textContent = 'Save Costs';

  // ── Approve button ──
  const approveBtn = document.createElement('button');
  approveBtn.className   = 'btn btn--primary btn--sm';
  approveBtn.textContent = 'Approve → Sales';

  // ── Request Revision button + inline panel ──
  const revisionBtn = document.createElement('button');
  revisionBtn.className   = 'btn btn--ghost btn--sm';
  revisionBtn.textContent = 'Request Revision';

  // ── Reject button ──
  const rejectBtn = document.createElement('button');
  rejectBtn.className   = 'btn btn--danger btn--sm';
  rejectBtn.textContent = 'Reject';

  bar.append(saveBtn, approveBtn, revisionBtn, rejectBtn);

  // Inline notes panel (shared for revision + reject)
  const notesPanel = document.createElement('div');
  notesPanel.style.cssText = 'display:none;width:100%;margin-top:10px';
  notesPanel.innerHTML = `
    <textarea id="action-notes" class="form-textarea"
              style="width:100%;min-height:80px;font-size:13px;resize:vertical"
              placeholder="Notes (required)…"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button id="notes-confirm-btn" class="btn btn--primary btn--sm">Confirm</button>
      <button id="notes-cancel-btn"  class="btn btn--ghost btn--sm">Cancel</button>
    </div>`;
  bar.appendChild(notesPanel);

  pageEl.appendChild(bar);

  let _pendingAction = null;

  function showNotes(action) {
    _pendingAction = action;
    notesPanel.style.display = 'block';
    notesPanel.querySelector('#action-notes').value = '';
    notesPanel.querySelector('#action-notes').focus();
    notesPanel.querySelector('#notes-confirm-btn').textContent =
      action === 'revision' ? 'Send Revision Request' : 'Confirm Reject';
  }

  function hideNotes() {
    _pendingAction = null;
    notesPanel.style.display = 'none';
  }

  async function saveCosts() {
    const costs = _collectAdminCosts(contentContainer);
    if (costs.adminMarginPct === null) {
      alert('Target Margin % is required before saving.');
      return false;
    }
    const { transferPrice } = calculate({ ...product, ...costs });
    await DB.patch('products', product.id, {
      ...costs,
      transferPrice,
      updatedBy: user?.userId,
      updatedAt: Date.now(),
    });
    return true;
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const ok = await saveCosts();
      if (ok) saveBtn.textContent = 'Saved ✓';
      setTimeout(() => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Costs';
      }, 1500);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Costs';
    }
  });

  approveBtn.addEventListener('click', async () => {
    approveBtn.disabled = true;
    approveBtn.textContent = 'Approving…';
    try {
      await saveCosts();
      await transition(product.id, 'PENDING_SALES', user?.userId);
      navigate(returnTo);
    } catch (err) {
      alert(`Approve failed: ${err.message}`);
      approveBtn.disabled = false;
      approveBtn.textContent = 'Approve → Sales';
    }
  });

  revisionBtn.addEventListener('click', () => showNotes('revision'));
  rejectBtn.addEventListener('click',   () => showNotes('reject'));

  notesPanel.querySelector('#notes-cancel-btn').addEventListener('click', hideNotes);

  notesPanel.querySelector('#notes-confirm-btn').addEventListener('click', async () => {
    const notes = notesPanel.querySelector('#action-notes').value.trim();
    if (!notes) {
      alert('Notes are required.');
      return;
    }

    const confirmBtn = notesPanel.querySelector('#notes-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing…';

    try {
      if (_pendingAction === 'revision') {
        await transition(product.id, 'REVISION_REQUESTED_BY_ADMIN', user?.userId, notes);
      } else {
        await transition(product.id, 'REJECTED', user?.userId, notes);
      }
      navigate(returnTo);
    } catch (err) {
      alert(`Action failed: ${err.message}`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = _pendingAction === 'revision' ? 'Send Revision Request' : 'Confirm Reject';
    }
  });
}

// ─── Public render ─────────────────────────────────────────────────────────────

export async function render(container, navigate, params = {}) {
  if (!params.id) {
    container.innerHTML = `<div class="alert alert--error" style="margin:28px">No product ID provided.</div>`;
    return;
  }

  const returnTo = params.returnTo || 'products/queue';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let product, variants;
  try {
    ({ product, variants } = await _load(params.id));
  } catch (err) {
    container.innerHTML = `<div class="alert alert--error" style="margin:28px">${esc(err.message)}</div>`;
    return;
  }

  container.innerHTML = '';

  const pageEl = document.createElement('div');
  pageEl.style.cssText = 'display:flex;flex-direction:column;min-height:100%';

  // Top bar
  const topbar = document.createElement('div');
  topbar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 28px;'
    + 'background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0';

  const backBtn = document.createElement('button');
  backBtn.className   = 'btn btn--ghost btn--sm';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', () => navigate(returnTo));

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'flex:1;font-size:14px;font-weight:600';
  titleEl.textContent   = product.name || 'Product Detail';

  topbar.append(backBtn, titleEl);
  pageEl.appendChild(topbar);

  // Scrollable content area
  const content = document.createElement('div');
  content.style.cssText = 'padding:28px;max-width:920px;flex:1';

  // Revision / rejection alert banners
  if (product.status === 'REVISION_REQUESTED_BY_ADMIN' && product.revisionNotes) {
    content.innerHTML += `
      <div class="alert alert--warning" style="margin-bottom:20px">
        <strong>Revision was requested:</strong>
        <p style="margin-top:6px;white-space:pre-wrap">${esc(product.revisionNotes)}</p>
      </div>`;
  }
  if (product.status === 'REJECTED' && product.rejectionReason) {
    content.innerHTML += `
      <div class="alert alert--error" style="margin-bottom:20px">
        <strong>Product was rejected:</strong>
        <p style="margin-top:6px;white-space:pre-wrap">${esc(product.rejectionReason)}</p>
      </div>`;
  }

  // Read-only sections
  content.innerHTML += _renderProductHeader(product);
  content.innerHTML += _renderProductInfo(product);
  content.innerHTML += _renderManufacturerCosts(product);
  content.innerHTML += _renderVariants(variants);

  pageEl.appendChild(content);

  // Admin cost form (interactive, appended after static HTML)
  _buildAdminCostForm(content, product);

  // Action bar (sticky bottom)
  _buildActionBar(pageEl, product, navigate, returnTo, content);

  container.appendChild(pageEl);
}
