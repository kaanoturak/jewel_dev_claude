import DB                              from '../../core/db.js';
import { transition }                  from '../../modules/workflow/index.js';
import { getCurrentUser, getOverrides, setOverride } from '../../modules/auth/index.js';
import { ROLE_PERMISSIONS, ACTIONS }    from '../../modules/auth/permissions.js';
import { logOverride }                 from '../../core/logger.js';
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
    const raw = await DB.getAll('products');
    products = (raw || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
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

  // ─── Status Override Section ──────────────────────────────────────────────
  const overrideHeader = document.createElement('h2');
  overrideHeader.className = 'section-title';
  overrideHeader.style.marginBottom = '16px';
  overrideHeader.textContent = 'Workflow Status Override';
  container.appendChild(overrideHeader);

  // Warning banner
  const warning = document.createElement('div');
  warning.className = 'alert alert--warning';
  warning.style.marginBottom = '20px';
  warning.innerHTML = `
    <strong>Caution</strong>
    <p style="margin-top:4px;font-size:13px">
      Force any product to any status, bypassing normal workflow rules.
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

  const overrideForm = document.createElement('div');
  overrideForm.id = 'override-form';
  overrideForm.style.display = 'none';
  container.appendChild(overrideForm);

  searchInput.addEventListener('input', () => renderResults(searchInput.value.trim()));
  renderResults('');

  function renderResults(query) {
    resultsWrap.innerHTML = '';
    overrideForm.style.display = 'none';

    let matched;
    if (!query) {
      matched = products.slice(0, 15);
    } else {
      const q = query.toLowerCase();
      matched = products.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku  || '').toLowerCase().includes(q)
      ).slice(0, 10);
    }

    if (matched.length === 0) {
      resultsWrap.innerHTML = `<p style="font-size:13px;color:var(--text-muted)">${query ? 'No products found.' : 'No products yet.'}</p>`;
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
        resultsWrap.innerHTML = '';
        searchInput.value = p.name || p.sku || '';
        showOverrideForm(p);
      });
      ul.appendChild(li);
    }
    card.appendChild(ul);
    resultsWrap.appendChild(card);
  }

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

    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:10px;background:var(--bg);border-radius:var(--r-sm)">
        <span style="font-size:13px;color:var(--text-muted)">Current status:</span>
        <div id="cur-status-badge"></div>
      </div>
      <div style="display:grid;grid-template-columns:160px 1fr;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--border-light)">
        <label for="override-status" style="font-size:13px;color:var(--text-muted)">Force to Status <span style="color:var(--red,#ef4444)">*</span></label>
        <select id="override-status" class="form-select" style="width:auto;min-width:220px">
          <option value="">Select target status…</option>
          ${ALL_STATUSES.map(s => `<option value="${s}"${s === product.status ? ' disabled' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:160px 1fr;gap:8px;align-items:start;padding:7px 0;border-bottom:1px solid var(--border-light)">
        <label for="override-notes" style="font-size:13px;color:var(--text-muted);padding-top:6px">Reason / Notes</label>
        <textarea id="override-notes" class="form-textarea" style="width:100%;min-height:70px;font-size:13px;resize:vertical" placeholder="Notes are audit-logged."></textarea>
      </div>
      <div id="override-error" class="alert alert--error" style="display:none;margin-top:10px"></div>
    `;
    body.querySelector('#cur-status-badge').appendChild(statusBadge(product.status));
    card.appendChild(body);

    const footer = document.createElement('div');
    footer.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px';
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn--danger btn--sm';
    applyBtn.textContent = 'Force Transition';
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn--ghost btn--sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { overrideForm.style.display = 'none'; searchInput.value = ''; });
    footer.append(applyBtn, cancelBtn);
    card.appendChild(footer);
    overrideForm.appendChild(card);

    applyBtn.addEventListener('click', async () => {
      const toStatus = body.querySelector('#override-status').value;
      const notes = body.querySelector('#override-notes').value.trim();
      if (!toStatus) { body.querySelector('#override-error').textContent = 'Select a target status.'; body.querySelector('#override-error').style.display = 'block'; return; }
      applyBtn.disabled = true; applyBtn.textContent = 'Applying…';
      try {
        const user = getCurrentUser();
        await transition(product.id, toStatus, user?.userId, notes || undefined);
        const updated = await DB.get('products', product.id);
        if (updated) showOverrideForm(updated);
        const success = document.createElement('div');
        success.className = 'alert alert--success'; success.style.marginBottom = '16px'; success.textContent = `Product moved to ${toStatus}.`;
        overrideForm.prepend(success); setTimeout(() => success.remove(), 3000);
      } catch (err) {
        body.querySelector('#override-error').textContent = err.message; body.querySelector('#override-error').style.display = 'block';
        applyBtn.disabled = false; applyBtn.textContent = 'Force Transition';
      }
    });
  }

  // ─── Permission Overrides Section ─────────────────────────────────────────
  const permHeader = document.createElement('h2');
  permHeader.className = 'section-title';
  permHeader.style.cssText = 'margin:40px 0 16px';
  permHeader.textContent = 'Dynamic Permission Overrides';
  container.appendChild(permHeader);

  const permDesc = document.createElement('p');
  permDesc.style.cssText = 'font-size:13px;color:var(--text-muted);margin-bottom:20px';
  permDesc.textContent = 'Temporarily restrict or expand role capabilities. Changes are saved to Firestore and logged.';
  container.appendChild(permDesc);

  const roles = ['MANUFACTURER', 'ADMIN', 'SALES'];
  const overrides = getOverrides();

  for (const role of roles) {
    const roleCard = document.createElement('div');
    roleCard.className = 'card';
    roleCard.style.marginBottom = '24px';

    const rhdr = document.createElement('div');
    rhdr.style.cssText = 'padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);font-size:12px;font-weight:700';
    rhdr.textContent = role;
    roleCard.appendChild(rhdr);

    const rbody = document.createElement('div');
    rbody.style.padding = '12px 20px';

    // Transitions
    const tHdr = document.createElement('h4');
    tHdr.style.cssText = 'font-size:11px;text-transform:uppercase;color:var(--text-muted);margin:0 0 10px';
    tHdr.textContent = 'Allowed Transitions';
    rbody.appendChild(tHdr);

    const tGrid = document.createElement('div');
    tGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:8px;margin-bottom:20px';
    
    const perms = ROLE_PERMISSIONS[role];
    for (const tKey of perms.transitions) {
      if (tKey === '*:ARCHIVED') continue; // wildcard not directly togglable here
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const isOverridden = overrides.transitions[`${role}:${tKey}`];
      checkbox.checked = isOverridden !== undefined ? isOverridden : true;
      
      label.append(checkbox, document.createTextNode(tKey));
      tGrid.appendChild(label);

      checkbox.addEventListener('change', async () => {
        await setOverride('transitions', `${role}:${tKey}`, checkbox.checked);
        logOverride(getCurrentUser()?.userId, role, `TRANSITION:${tKey}`, checkbox.checked);
      });
    }
    rbody.appendChild(tGrid);

    // Actions
    const aHdr = document.createElement('h4');
    aHdr.style.cssText = 'font-size:11px;text-transform:uppercase;color:var(--text-muted);margin:0 0 10px';
    aHdr.textContent = 'Allowed Actions';
    rbody.appendChild(aHdr);

    const aGrid = document.createElement('div');
    aGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill, minmax(200px, 1fr));gap:8px';

    for (const action of perms.actions) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      const isOverridden = overrides.actions[`${role}:${action}`];
      checkbox.checked = isOverridden !== undefined ? isOverridden : true;
      
      label.append(checkbox, document.createTextNode(action));
      aGrid.appendChild(label);

      checkbox.addEventListener('change', async () => {
        await setOverride('actions', `${role}:${action}`, checkbox.checked);
        logOverride(getCurrentUser()?.userId, role, `ACTION:${action}`, checkbox.checked);
      });
    }
    rbody.appendChild(aGrid);

    roleCard.appendChild(rbody);
    container.appendChild(roleCard);
  }
}
