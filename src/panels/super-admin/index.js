import { getCurrentUser, logout } from '../../modules/auth/index.js';
import { render as renderDashboard }     from './dashboard.js';
import { render as renderUserMgmt }      from './user-management.js';
import { render as renderOverride }      from './override.js';
import { render as renderAuditLog }      from '../admin/audit-log.js';

// ─── Views ─────────────────────────────────────────────────────────────────────

const VIEWS = {
  dashboard:  renderDashboard,
  users:      renderUserMgmt,
  override:   renderOverride,
  'audit-log': renderAuditLog,
};

const VIEW_TITLES = {
  dashboard:   'Dashboard',
  users:       'User Management',
  override:    'Override / Force Transition',
  'audit-log': 'Audit Log',
};

// ─── Router state ──────────────────────────────────────────────────────────────

let _contentEl = null;
let _navLinks  = null;

function navigate(view, params = {}) {
  if (_navLinks) {
    _navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.view === view);
    });
  }

  const titleEl = document.querySelector('#sa-page-title');
  if (titleEl) titleEl.textContent = VIEW_TITLES[view] ?? view;

  const handler = VIEWS[view];
  if (handler) {
    handler(_contentEl, navigate, params);
  } else {
    _contentEl.innerHTML = `
      <div class="view-placeholder">
        <h2>Not Found</h2>
        <p>No view registered for "${view}".</p>
      </div>`;
  }
}

// ─── Panel mount ───────────────────────────────────────────────────────────────

export function mount(container) {
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="panel">

      <nav class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-name">TuguJewelry</span>
          <span class="sidebar-brand-role">Super Admin</span>
        </div>

        <ul class="sidebar-nav" id="sa-nav">
          <li>
            <a class="nav-link active" data-view="dashboard" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zm-7 7h5v5H2V9zm7 0h5v5H9V9z"/>
              </svg>
              Dashboard
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="users" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path fill-rule="evenodd" d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/>
                <path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
              </svg>
              Users
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="override" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
              </svg>
              Override
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="audit-log" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M5 4a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm-.5 2.5A.5.5 0 0 1 5 6h6a.5.5 0 0 1 0 1H5a.5.5 0 0 1-.5-.5zM5 8a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1H5zm0 2a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H5z"/>
                <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/>
              </svg>
              Audit Log
            </a>
          </li>
        </ul>

        <div class="sidebar-footer">
          <span class="sidebar-user-name">${user?.displayName ?? '—'}</span>
          <span class="sidebar-user-email">${user?.email ?? ''}</span>
          <button class="btn-signout" id="sa-signout">Sign out</button>
        </div>
      </nav>

      <div class="panel-main">
        <header class="panel-header">
          <h1 class="page-title" id="sa-page-title">Dashboard</h1>
        </header>
        <main class="panel-content" id="sa-content"></main>
      </div>

    </div>`;

  _contentEl = container.querySelector('#sa-content');
  _navLinks  = Array.from(container.querySelectorAll('.nav-link'));

  container.querySelector('#sa-nav').addEventListener('click', e => {
    const link = e.target.closest('[data-view]');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.view);
  });

  container.querySelector('#sa-signout').addEventListener('click', async () => {
    await logout();
    window.location.reload();
  });

  navigate('dashboard');
}
