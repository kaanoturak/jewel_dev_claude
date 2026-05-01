import DB                               from '../../core/db.js';
import { getCurrentUser }              from '../../modules/auth/index.js';
import { generateUUID, formatDate, esc } from '../../shared/utils/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLES = ['MANUFACTURER', 'ADMIN', 'SALES', 'SUPER_ADMIN'];

// ─── Render ────────────────────────────────────────────────────────────────────

export async function render(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  let users;
  try {
    users = await DB.getAll('users');
  } catch (err) {
    container.innerHTML = `
      <div class="view-placeholder">
        <h2>Could not load users</h2>
        <p>${esc(err.message)}</p>
      </div>`;
    return;
  }

  users = [...(users || [])].sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  container.innerHTML = '';

  // ── Add user button ───────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:16px';
  const addBtn = document.createElement('button');
  addBtn.className   = 'btn btn--primary btn--sm';
  addBtn.textContent = '+ Add User';
  addBtn.addEventListener('click', () => showForm(container, null, users, refresh));
  toolbar.appendChild(addBtn);
  container.appendChild(toolbar);

  // ── Table ─────────────────────────────────────────────────────────────────
  const tableWrap = document.createElement('div');
  tableWrap.id = 'user-table-wrap';
  container.appendChild(tableWrap);

  function refresh() {
    DB.getAll('users').then(fresh => {
      users = [...(fresh || [])].sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
      renderTable(tableWrap, users, refresh);
    });
  }

  renderTable(tableWrap, users, refresh);
}

function renderTable(wrap, users, refresh) {
  wrap.querySelector('.card')?.remove();

  const card = document.createElement('div');
  card.className = 'card';

  if (users.length === 0) {
    card.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">👤</div>
        <div class="empty-state__title">No users</div>
        <div class="empty-state__desc">Add the first user above.</div>
      </div>`;
    wrap.appendChild(card);
    return;
  }

  const table = document.createElement('table');
  table.className = 'products-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Status</th>
        <th>Created</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>`;

  const tbody = table.querySelector('tbody');
  const currentUser = getCurrentUser();

  for (const u of users) {
    const isActive = u.isActive !== false;
    const isSelf   = u.userId === currentUser?.userId;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600">${esc(u.displayName || '—')}</td>
      <td style="color:var(--text-muted);font-size:12px">${esc(u.email || '—')}</td>
      <td><span class="badge badge--blue">${esc(u.role || '—')}</span></td>
      <td>${isActive
            ? '<span class="badge badge--green">Active</span>'
            : '<span class="badge badge--stone">Inactive</span>'}</td>
      <td style="color:var(--text-muted);font-size:12px">${formatDate(u.createdAt)}</td>
      <td class="product-actions"></td>`;

    const actions = tr.querySelector('.product-actions');

    const editBtn = document.createElement('button');
    editBtn.className   = 'btn btn--ghost btn--sm';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => showForm(tr.closest('table').parentElement.parentElement, u, users, refresh));
    actions.appendChild(editBtn);

    if (!isSelf) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className   = `btn btn--sm ${isActive ? 'btn--danger' : 'btn--secondary'}`;
      toggleBtn.textContent = isActive ? 'Deactivate' : 'Activate';
      toggleBtn.addEventListener('click', async () => {
        await DB.patch('users', u.userId, { isActive: !isActive, updatedAt: Date.now() });
        refresh();
      });
      actions.appendChild(toggleBtn);
    }

    tbody.appendChild(tr);
  }

  card.appendChild(table);
  wrap.appendChild(card);
}

// ─── Inline user form ─────────────────────────────────────────────────────────

function showForm(container, user, allUsers, onSave) {
  // Remove any existing inline form
  container.querySelector('#user-form-card')?.remove();

  const isEdit = !!user;
  const card   = document.createElement('div');
  card.id        = 'user-form-card';
  card.className = 'card';
  card.style.cssText = 'max-width:560px;margin-bottom:20px;overflow:hidden';

  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:10px 20px;background:var(--surface-alt);border-bottom:1px solid var(--border);'
    + 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)';
  hdr.textContent = isEdit ? 'Edit User' : 'Add User';
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.style.cssText = 'padding:12px 20px 8px';
  body.innerHTML = `
    <div style="display:grid;gap:12px">
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center">
        <label for="u-name" style="font-size:13px;color:var(--text-muted)">Display Name <span style="color:var(--red,#ef4444)">*</span></label>
        <input id="u-name" type="text" class="form-input" value="${esc(user?.displayName || '')}" placeholder="Full name">
      </div>
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center">
        <label for="u-email" style="font-size:13px;color:var(--text-muted)">Email <span style="color:var(--red,#ef4444)">*</span></label>
        <input id="u-email" type="email" class="form-input" value="${esc(user?.email || '')}" placeholder="user@example.com">
      </div>
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center">
        <label for="u-role" style="font-size:13px;color:var(--text-muted)">Role <span style="color:var(--red,#ef4444)">*</span></label>
        <select id="u-role" class="form-select" style="width:auto;min-width:180px">
          ${ROLES.map(r => `<option value="${r}"${r === user?.role ? ' selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>
      ${!isEdit ? `
      <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;align-items:center">
        <label for="u-pin" style="font-size:13px;color:var(--text-muted)">PIN / Password</label>
        <input id="u-pin" type="password" class="form-input" placeholder="Leave blank for no auth">
      </div>` : ''}
      <div id="u-error" class="alert alert--error" style="display:none"></div>
    </div>`;
  card.appendChild(body);

  const footer = document.createElement('div');
  footer.style.cssText = 'padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px';

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'btn btn--primary btn--sm';
  saveBtn.textContent = isEdit ? 'Save' : 'Create User';

  const cancelBtn = document.createElement('button');
  cancelBtn.className   = 'btn btn--ghost btn--sm';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => card.remove());

  footer.append(saveBtn, cancelBtn);
  card.appendChild(footer);

  // Insert before the table wrap
  const tableWrap = container.querySelector('#user-table-wrap');
  container.insertBefore(card, tableWrap);

  saveBtn.addEventListener('click', async () => {
    const name  = body.querySelector('#u-name').value.trim();
    const email = body.querySelector('#u-email').value.trim();
    const role  = body.querySelector('#u-role').value;
    const pin   = body.querySelector('#u-pin')?.value.trim() || null;

    const errorEl = body.querySelector('#u-error');
    const errors  = [];
    if (!name)  errors.push('Display Name is required.');
    if (!email) errors.push('Email is required.');
    if (!isEdit) {
      const dup = allUsers.find(u => u.email === email && (!user || u.userId !== user.userId));
      if (dup) errors.push('A user with this email already exists.');
    }

    if (errors.length) {
      errorEl.innerHTML = errors.map(e => `<p>${esc(e)}</p>`).join('');
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    const now = Date.now();
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      if (isEdit) {
        await DB.patch('users', user.userId, { displayName: name, email, role, updatedAt: now });
      } else {
        await DB.add('users', {
          userId: generateUUID(),
          displayName: name, email, role,
          pin: pin || null,
          isActive: true,
          createdAt: now, updatedAt: now,
        });
      }
      card.remove();
      onSave();
    } catch (err) {
      errorEl.innerHTML = `<p>${esc(err.message)}</p>`;
      errorEl.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? 'Save' : 'Create User';
    }
  });
}
