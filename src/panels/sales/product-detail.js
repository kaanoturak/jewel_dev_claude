import DB                                        from '../../core/db.js';
import { calculate, getEffectivePrice }          from '../../core/engine.js';
import { transition }                            from '../../modules/workflow/index.js';
import { getCurrentUser }                        from '../../modules/auth/index.js';
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

  const [variants, blobs, allCampaigns] = await Promise.all([
    DB.queryByIndex('variants',   'productId', productId),
    DB.queryByIndex('mediaBlobs', 'productId', productId),
    DB.getAll('campaigns'),
  ]);

  const blobMap = Object.fromEntries((blobs || []).map(b => [b.blobId, b]));
  const images  = (product.images || []).map(img => {
    const b = blobMap[img.id];
    return b ? { ...img, url: URL.createObjectURL(b.blob) } : img;
  });

  const now = Date.now();
  const activeCampaigns = (allCampaigns || []).filter(c =>
    c.isActive && c.startsAt <= now && (!c.endsAt || c.endsAt >= now)
  );

  return {
    product: { ...product, images },
    variants: variants || [],
    allCampaigns: allCampaigns || [],
    activeCampaigns,
  };
}

// ─── Read-only sections ────────────────────────────────────────────────────────

function _renderHeader(product) {
  const primaryImg = product.images?.[product.primaryImageIndex ?? 0];
  const thumbHTML  = primaryImg?.url
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
  const section = document.createElement('div');
  section.className = 'card';
  section.style.cssText = 'margin-bottom:20px;overflow:hidden';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);'
    + 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)';
  hdr.textContent = 'Product Info';
  section.appendChild(hdr);

  const body = document.createElement('div');
  body.style.cssText = 'padding:4px 20px 12px';

  const descRow = document.createElement('div');
  descRow.style.cssText = 'display:grid;grid-template-columns:180px 1fr;gap:8px;padding:7px 0;'
    + 'border-bottom:1px solid var(--border-light);font-size:13px';
  const descLabel = document.createElement('span');
  descLabel.style.color = 'var(--text-muted)';
  descLabel.textContent = 'Description';
  const descDiv = document.createElement('div');
  descDiv.style.cssText = 'line-height:1.6;color:var(--text);font-weight:500;word-break:break-word';
  descDiv.innerHTML = product.productDescription || '—';
  descRow.appendChild(descLabel);
  descRow.appendChild(descDiv);
  body.appendChild(descRow);

  body.insertAdjacentHTML('beforeend', [
    field('SEO Title',   esc(product.seoTitle   || '')),
    field('Category',   esc(product.category   || '—')),
    field('Material',   esc(product.material   || '—')),
    field('Collection', esc(product.collection || '')),
    field('Updated',    formatRelativeTime(product.updatedAt)),
  ].join(''));

  section.appendChild(body);
  return section;
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
      <td>${v.stockCount ?? 0}</td>
      <td>${v.isActive !== false
            ? '<span class="badge badge--green">Active</span>'
            : '<span class="badge badge--stone">Inactive</span>'}</td>
    </tr>`).join('');

  return sectionCard(`Variants (${variants.length})`, `
    <table class="products-table" style="margin-top:4px">
      <thead><tr><th>SKU</th><th>Size</th><th>Color</th><th>Stock</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

// ─── Sales pricing form ────────────────────────────────────────────────────────

function _buildPricingForm(container, product, allCampaigns) {
  const section = document.createElement('div');
  section.className = 'card';
  section.style.cssText = 'margin-bottom:20px;overflow:hidden';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);'
    + 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)';
  hdr.textContent = 'Sales Pricing';
  section.appendChild(hdr);

  const body = document.createElement('div');
  body.style.cssText = 'padding:16px 20px 20px';

  // Admin price row (read-only)
  const adminRow = document.createElement('div');
  adminRow.style.cssText = 'display:grid;grid-template-columns:180px 1fr;gap:8px;align-items:center;'
    + 'padding:7px 0;border-bottom:1px solid var(--border-light)';
  adminRow.innerHTML = `
    <span style="font-size:13px;color:var(--text-muted)">Admin Price (transfer)</span>
    <span style="font-size:15px;font-weight:700;color:var(--accent)">
      ${product.transferPrice != null ? esc(formatCurrency(product.transferPrice)) : '<span style="color:var(--text-muted)">Not set</span>'}
    </span>`;
  body.appendChild(adminRow);

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
               class="form-input" style="width:160px"
               value="${value != null ? value : ''}">
        ${hint ? `<span style="font-size:12px;color:var(--text-muted)">${esc(hint)}</span>` : ''}
      </div>`;
    return wrap;
  };

  body.appendChild(numField('selling-price',    'Selling Price',    product.sellingPrice,    true,  '(required)'));
  body.appendChild(numField('compare-at-price', 'Compare-at Price', product.compareAtPrice,  false, '(optional strikethrough)'));

  // Campaign selector
  const campaignRow = document.createElement('div');
  campaignRow.style.cssText = 'display:grid;grid-template-columns:180px 1fr;gap:8px;align-items:center;'
    + 'padding:7px 0;border-bottom:1px solid var(--border-light)';

  const campaignSelect = document.createElement('select');
  campaignSelect.id = 'campaign-select';
  campaignSelect.className = 'form-select';
  campaignSelect.style.cssText = 'width:auto;min-width:200px';

  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = 'No campaign';
  campaignSelect.appendChild(noneOpt);

  const now = Date.now();
  const eligibleCampaigns = (allCampaigns || []).filter(c => c.isActive);
  for (const c of eligibleCampaigns) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name + (c.discountType === 'PERCENTAGE'
      ? ` (${c.discountValue}% off)`
      : ` (-${formatCurrency(c.discountValue)})`);
    if (product.activeCampaignId === c.id) opt.selected = true;
    campaignSelect.appendChild(opt);
  }

  campaignRow.innerHTML = `<label style="font-size:13px;color:var(--text-muted)">Campaign</label>`;
  campaignRow.appendChild(campaignSelect);
  body.appendChild(campaignRow);

  // Effective price preview
  const previewRow = document.createElement('div');
  previewRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;'
    + 'font-size:14px;font-weight:700;border-top:2px solid var(--border);padding-top:12px;margin-top:8px';
  previewRow.innerHTML = `
    <span>Effective Price (preview)</span>
    <span id="effective-preview" style="color:var(--accent);font-size:16px">—</span>`;
  body.appendChild(previewRow);
  section.appendChild(body);
  container.appendChild(section);

  // Live preview update
  const sellingInput    = body.querySelector('#selling-price');
  const effectiveEl     = body.querySelector('#effective-preview');

  function updatePreview() {
    const sellingPrice = parseFloatOrNull(sellingInput.value);
    const selectedCampaignId = campaignSelect.value;
    const campaign = eligibleCampaigns.find(c => c.id === selectedCampaignId) || null;

    const draft = { ...product, sellingPrice };
    const eff   = getEffectivePrice(draft, campaign);
    effectiveEl.textContent = eff != null ? formatCurrency(eff) : '—';
  }

  sellingInput.addEventListener('input', updatePreview);
  campaignSelect.addEventListener('change', updatePreview);
  updatePreview();
}

function parseFloatOrNull(str) {
  if (str === '' || str == null) return null;
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function _collectPricing(scopeEl) {
  return {
    sellingPrice:     parseFloatOrNull(scopeEl.querySelector('#selling-price')?.value),
    compareAtPrice:   parseFloatOrNull(scopeEl.querySelector('#compare-at-price')?.value),
    activeCampaignId: scopeEl.querySelector('#campaign-select')?.value || null,
  };
}

// ─── Action bar ───────────────────────────────────────────────────────────────

function _buildActionBar(pageEl, product, navigate, returnTo, pricingContent) {
  const isSalesPending = product.status === 'PENDING_SALES';

  const bar = document.createElement('div');
  bar.style.cssText = 'position:sticky;bottom:0;background:var(--surface);border-top:1px solid var(--border);'
    + 'padding:14px 28px;display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap;z-index:10';

  if (!isSalesPending) {
    const note = document.createElement('p');
    note.style.cssText = 'font-size:13px;color:var(--text-muted);margin:0';
    note.textContent = `This product is ${product.status} — no actions available.`;
    bar.appendChild(note);
    pageEl.appendChild(bar);
    return;
  }

  const user = getCurrentUser();

  const saveBtn    = document.createElement('button');
  saveBtn.className   = 'btn btn--secondary btn--sm';
  saveBtn.textContent = 'Save Pricing';

  const approveBtn = document.createElement('button');
  approveBtn.className   = 'btn btn--primary btn--sm';
  approveBtn.textContent = 'Approve → E-Com';

  const revisionBtn = document.createElement('button');
  revisionBtn.className   = 'btn btn--ghost btn--sm';
  revisionBtn.textContent = 'Request Revision';

  const rejectBtn = document.createElement('button');
  rejectBtn.className   = 'btn btn--danger btn--sm';
  rejectBtn.textContent = 'Reject';

  bar.append(saveBtn, approveBtn, revisionBtn, rejectBtn);

  const notesPanel = document.createElement('div');
  notesPanel.style.cssText = 'display:none;width:100%;margin-top:10px';
  notesPanel.innerHTML = `
    <textarea id="sales-action-notes" class="form-textarea"
              style="width:100%;min-height:80px;font-size:13px;resize:vertical"
              placeholder="Notes (required)…"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button id="sales-notes-confirm" class="btn btn--primary btn--sm">Confirm</button>
      <button id="sales-notes-cancel"  class="btn btn--ghost btn--sm">Cancel</button>
    </div>`;
  bar.appendChild(notesPanel);
  pageEl.appendChild(bar);

  let _pendingAction = null;

  async function savePricing() {
    const pricing = _collectPricing(pricingContent);
    if (pricing.sellingPrice == null || pricing.sellingPrice < 0) {
      alert('Selling Price is required and must be a non-negative number.');
      return false;
    }
    await DB.patch('products', product.id, {
      ...pricing,
      updatedBy: user?.userId,
      updatedAt: Date.now(),
    });
    return true;
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const ok = await savePricing();
      if (ok) saveBtn.textContent = 'Saved ✓';
      setTimeout(() => { saveBtn.disabled = false; saveBtn.textContent = 'Save Pricing'; }, 1500);
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Pricing';
    }
  });

  approveBtn.addEventListener('click', async () => {
    approveBtn.disabled = true;
    approveBtn.textContent = 'Approving…';
    try {
      await savePricing();
      await transition(product.id, 'READY_FOR_ECOMMERCE', user?.userId);
      navigate(returnTo);
    } catch (err) {
      alert(`Approve failed: ${err.message}`);
      approveBtn.disabled = false;
      approveBtn.textContent = 'Approve → E-Com';
    }
  });

  revisionBtn.addEventListener('click', () => {
    _pendingAction = 'revision';
    notesPanel.style.display = 'block';
    notesPanel.querySelector('#sales-action-notes').value = '';
    notesPanel.querySelector('#sales-action-notes').focus();
    notesPanel.querySelector('#sales-notes-confirm').textContent = 'Send Revision Request';
  });

  rejectBtn.addEventListener('click', () => {
    _pendingAction = 'reject';
    notesPanel.style.display = 'block';
    notesPanel.querySelector('#sales-action-notes').value = '';
    notesPanel.querySelector('#sales-action-notes').focus();
    notesPanel.querySelector('#sales-notes-confirm').textContent = 'Confirm Reject';
  });

  notesPanel.querySelector('#sales-notes-cancel').addEventListener('click', () => {
    _pendingAction = null;
    notesPanel.style.display = 'none';
  });

  notesPanel.querySelector('#sales-notes-confirm').addEventListener('click', async () => {
    const notes = notesPanel.querySelector('#sales-action-notes').value.trim();
    if (!notes) { alert('Notes are required.'); return; }

    const btn = notesPanel.querySelector('#sales-notes-confirm');
    btn.disabled = true;
    btn.textContent = 'Processing…';

    try {
      if (_pendingAction === 'revision') {
        await transition(product.id, 'REVISION_REQUESTED_BY_SALES', user?.userId, notes);
      } else {
        await transition(product.id, 'REJECTED', user?.userId, notes);
      }
      navigate(returnTo);
    } catch (err) {
      console.error(`[Sales Action] ${_pendingAction} failed:`, err);
      alert(`Action failed: ${err.message}`);
      btn.disabled = false;
      btn.textContent = _pendingAction === 'revision' ? 'Send Revision Request' : 'Confirm Reject';
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

  let product, variants, allCampaigns;
  try {
    ({ product, variants, allCampaigns } = await _load(params.id));
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

  // Content
  const content = document.createElement('div');
  content.style.cssText = 'padding:28px;max-width:920px;flex:1';

  // Revision / rejection banners
  if (product.status === 'REVISION_REQUESTED_BY_SALES' && product.revisionNotes) {
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

  content.insertAdjacentHTML('beforeend', _renderHeader(product));
  content.appendChild(_renderProductInfo(product));
  content.insertAdjacentHTML('beforeend', _renderVariants(variants));

  pageEl.appendChild(content);

  // Pricing form (interactive)
  _buildPricingForm(content, product, allCampaigns);

  // Action bar (sticky bottom)
  _buildActionBar(pageEl, product, navigate, returnTo, content);

  container.appendChild(pageEl);
}
