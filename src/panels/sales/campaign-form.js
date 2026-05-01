import DB                                     from '../../core/db.js';
import { getCurrentUser }                    from '../../modules/auth/index.js';
import { generateUUID, formatCurrency, esc } from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelRow(id, label, inputEl, required = false, hint = '') {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;grid-template-columns:200px 1fr;gap:8px;align-items:start;'
    + 'padding:10px 0;border-bottom:1px solid var(--border-light)';
  const lbl = document.createElement('label');
  lbl.htmlFor    = id;
  lbl.style.cssText = 'font-size:13px;color:var(--text-muted);padding-top:6px';
  lbl.innerHTML  = esc(label) + (required ? ' <span style="color:var(--red,#ef4444)">*</span>' : '');
  const right = document.createElement('div');
  right.appendChild(inputEl);
  if (hint) {
    const h = document.createElement('p');
    h.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:4px';
    h.textContent = hint;
    right.appendChild(h);
  }
  wrap.append(lbl, right);
  return wrap;
}

function formInput(id, type, value, placeholder = '') {
  const inp = document.createElement('input');
  inp.id = id;
  inp.type = type;
  inp.className = 'form-input';
  inp.style.cssText = 'width:100%;max-width:340px';
  if (value != null) inp.value = value;
  if (placeholder) inp.placeholder = placeholder;
  return inp;
}

function formSelect(id, options, selectedVal) {
  const sel = document.createElement('select');
  sel.id = id;
  sel.className = 'form-select';
  sel.style.cssText = 'width:auto;min-width:180px';
  for (const [val, label] of options) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === selectedVal) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function tsToDatetimeLocal(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
       + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToTs(str) {
  if (!str) return null;
  return new Date(str).getTime();
}

// ─── Load ──────────────────────────────────────────────────────────────────────

async function _load(campaignId) {
  const [campaign, products] = await Promise.all([
    campaignId ? DB.get('campaigns', campaignId) : Promise.resolve(null),
    DB.getAll('products'),
  ]);
  return { campaign, products: products || [] };
}

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container, navigate, params = {}) {
  const isEdit = !!params.id;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let campaign, products;
  try {
    ({ campaign, products } = await _load(params.id || null));
  } catch (err) {
    container.innerHTML = `<div class="alert alert--error" style="margin:28px">${esc(err.message)}</div>`;
    return;
  }

  container.innerHTML = '';

  const c = campaign || {};

  // ── Form card ─────────────────────────────────────────────────────────────
  const card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'max-width:760px;overflow:hidden';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);'
    + 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)';
  hdr.textContent = isEdit ? 'Edit Campaign' : 'New Campaign';
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.style.cssText = 'padding:8px 20px 24px';

  // Name
  const nameInp = formInput('campaign-name', 'text', c.name || '', 'e.g. Summer Sale 2026');
  body.appendChild(labelRow('campaign-name', 'Campaign Name', nameInp, true));

  // Discount type
  const typeSelect = formSelect('campaign-type',
    [['PERCENTAGE', 'Percentage (%)'], ['FIXED', 'Fixed Amount']],
    c.discountType || 'PERCENTAGE'
  );
  body.appendChild(labelRow('campaign-type', 'Discount Type', typeSelect, true));

  // Discount value
  const valueInp = formInput('campaign-value', 'number', c.discountValue ?? '', 'e.g. 15');
  valueInp.min  = '0';
  valueInp.step = '0.01';
  valueInp.style.cssText = 'width:140px';
  const valueHintEl = document.createElement('span');
  valueHintEl.id = 'campaign-value-hint';
  valueHintEl.style.cssText = 'font-size:12px;color:var(--text-muted);margin-left:8px';
  const valueWrap = document.createElement('div');
  valueWrap.style.display = 'flex';
  valueWrap.style.alignItems = 'center';
  valueWrap.appendChild(valueInp);
  valueWrap.appendChild(valueHintEl);

  const updateValueHint = () => {
    valueHintEl.textContent = typeSelect.value === 'PERCENTAGE' ? '%' : 'fixed amount';
  };
  typeSelect.addEventListener('change', updateValueHint);
  updateValueHint();

  body.appendChild(labelRow('campaign-value', 'Discount Value', valueWrap, true));

  // Dates
  const startsInp = formInput('campaign-starts', 'datetime-local', tsToDatetimeLocal(c.startsAt));
  body.appendChild(labelRow('campaign-starts', 'Starts At', startsInp, true));

  const endsInp = formInput('campaign-ends', 'datetime-local', tsToDatetimeLocal(c.endsAt));
  body.appendChild(labelRow('campaign-ends', 'Ends At', endsInp, false, 'Leave blank for no end date'));

  // Active toggle
  const activeCheck = document.createElement('input');
  activeCheck.type    = 'checkbox';
  activeCheck.id      = 'campaign-active';
  activeCheck.style.cssText = 'width:18px;height:18px;cursor:pointer;margin-top:6px';
  activeCheck.checked = c.isActive !== false;
  body.appendChild(labelRow('campaign-active', 'Active', activeCheck, false, 'Inactive campaigns never apply discounts'));

  // Scope selector
  const scopeSelect = formSelect('campaign-scope',
    [['all', 'All products'], ['selected', 'Selected products']],
    c.productIds?.length ? 'selected' : 'all'
  );
  body.appendChild(labelRow('campaign-scope', 'Scope', scopeSelect, true));

  // Product multiselect (shown when scope = selected)
  const productListWrap = document.createElement('div');
  productListWrap.id = 'campaign-product-list';
  productListWrap.style.cssText = 'display:none;padding:10px 0;border-bottom:1px solid var(--border-light)';

  const labelDiv = document.createElement('div');
  labelDiv.style.cssText = 'font-size:13px;color:var(--text-muted);margin-bottom:8px';
  labelDiv.textContent = 'Select products:';
  productListWrap.appendChild(labelDiv);

  const checkGrid = document.createElement('div');
  checkGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;'
    + 'max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-sm);padding:8px';

  const readyProducts = products.filter(p =>
    ['PENDING_SALES', 'READY_FOR_ECOMMERCE'].includes(p.status)
  );

  for (const p of readyProducts) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;'
      + 'padding:4px 6px;border-radius:var(--r-sm)';
    const cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.value = p.id;
    cb.name  = 'campaign-product';
    if (c.productIds?.includes(p.id)) cb.checked = true;
    row.appendChild(cb);
    row.appendChild(document.createTextNode(p.name || p.sku || p.id));
    checkGrid.appendChild(row);
  }

  if (readyProducts.length === 0) {
    checkGrid.innerHTML = `<p style="font-size:12px;color:var(--text-muted);padding:4px">No eligible products.</p>`;
  }

  productListWrap.appendChild(checkGrid);
  body.appendChild(productListWrap);

  const toggleProductList = () => {
    productListWrap.style.display = scopeSelect.value === 'selected' ? 'block' : 'none';
  };
  scopeSelect.addEventListener('change', toggleProductList);
  toggleProductList();

  card.appendChild(body);

  // Error area
  const errorEl = document.createElement('div');
  errorEl.style.cssText = 'margin:0 20px;display:none';
  errorEl.className = 'alert alert--error';
  card.appendChild(errorEl);

  // Footer buttons
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:14px 20px;border-top:1px solid var(--border);'
    + 'display:flex;gap:10px;align-items:center';

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'btn btn--primary btn--sm';
  saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Campaign';

  const cancelBtn = document.createElement('button');
  cancelBtn.className   = 'btn btn--ghost btn--sm';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => navigate('dashboard'));

  footer.append(saveBtn, cancelBtn);

  if (isEdit) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className   = 'btn btn--danger btn--sm';
    deleteBtn.textContent = 'Delete Campaign';
    deleteBtn.style.marginLeft = 'auto';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete this campaign? This cannot be undone.')) return;
      await DB.delete('campaigns', params.id);
      navigate('dashboard');
    });
    footer.appendChild(deleteBtn);
  }

  card.appendChild(footer);
  container.appendChild(card);

  // ── Save handler ──────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const name         = document.getElementById('campaign-name').value.trim();
    const discountType = document.getElementById('campaign-type').value;
    const discountValue = parseFloat(document.getElementById('campaign-value').value);
    const startsAt     = datetimeLocalToTs(document.getElementById('campaign-starts').value);
    const endsAt       = datetimeLocalToTs(document.getElementById('campaign-ends').value);
    const isActive     = document.getElementById('campaign-active').checked;
    const scope        = document.getElementById('campaign-scope').value;
    const productIds   = scope === 'selected'
      ? Array.from(document.querySelectorAll('input[name=campaign-product]:checked')).map(cb => cb.value)
      : [];

    const errors = [];
    if (!name)                  errors.push('Campaign Name is required.');
    if (isNaN(discountValue) || discountValue <= 0) errors.push('Discount Value must be a positive number.');
    if (!startsAt)              errors.push('Starts At is required.');
    if (scope === 'selected' && productIds.length === 0) errors.push('Select at least one product.');

    if (errors.length) {
      errorEl.innerHTML = errors.map(e => `<p>${esc(e)}</p>`).join('');
      errorEl.style.display = 'block';
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    errorEl.style.display = 'none';
    saveBtn.disabled = true;
    saveBtn.textContent = isEdit ? 'Saving…' : 'Creating…';

    const user = getCurrentUser();
    const now  = Date.now();

    try {
      if (isEdit) {
        await DB.patch('campaigns', params.id, {
          name, discountType, discountValue, startsAt, endsAt, isActive,
          productIds, updatedBy: user?.userId, updatedAt: now,
        });
      } else {
        await DB.add('campaigns', {
          id: generateUUID(),
          name, discountType, discountValue, startsAt, endsAt, isActive,
          productIds, createdBy: user?.userId, createdAt: now, updatedAt: now,
        });
      }
      navigate('dashboard');
    } catch (err) {
      errorEl.innerHTML = `<p>${esc(err.message)}</p>`;
      errorEl.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save Changes' : 'Create Campaign';
    }
  });
}
