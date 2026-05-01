import { getCurrentUser, setCurrentUser } from '../../modules/auth/index.js';
import { render as renderDashboard }     from './dashboard.js';
import { render as renderProductQueue }  from './product-queue.js';
import { render as renderProductDetail } from './product-detail.js';
import { render as renderStockView }     from './stock-view.js';
import { render as renderAuditLog }      from './audit-log.js';

// ─── Views ─────────────────────────────────────────────────────────────────────
// Both "Review Queue" and "All Products" use the same module with a mode param.

const VIEWS = {
  dashboard:         renderDashboard,
  'products/queue':  (c, nav, p) => renderProductQueue(c, nav, { ...p, mode: 'queue' }),
  'products/all':    (c, nav, p) => renderProductQueue(c, nav, { ...p, mode: 'all'   }),
  'products/detail': renderProductDetail,
  stock:             renderStockView,
  'audit-log':       renderAuditLog,
};

const VIEW_TITLES = {
  dashboard:         'Dashboard',
  'products/queue':  'Review Queue',
  'products/all':    'All Products',
  'products/detail': 'Product Detail',
  stock:             'Stock Overview',
  'audit-log':       'Audit Log',
};

// ─── Router state ──────────────────────────────────────────────────────────────

let _contentEl   = null;
let _navLinks    = null;

function navigate(view, params = {}) {
  // Nav links only highlight top-level views
  if (_navLinks) {
    _navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.view === view);
    });
  }

  const titleEl = document.querySelector('#admin-page-title');
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
          <span class="sidebar-brand-role">Admin</span>
        </div>

        <ul class="sidebar-nav" id="admin-nav">
          <li>
            <a class="nav-link active" data-view="dashboard" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zm-7 7h5v5H2V9zm7 0h5v5H9V9z"/>
              </svg>
              Dashboard
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="products/queue" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.5 3A1.5 1.5 0 0 0 1 4.5v.793c.026.009.051.02.076.032L7.674 8.51c.206.1.446.1.652 0l6.598-3.185A.755.755 0 0 1 15 5.293V4.5A1.5 1.5 0 0 0 13.5 3h-11Z"/>
                <path d="M15 6.954 8.978 9.86a2.25 2.25 0 0 1-1.956 0L1 6.954V11.5A1.5 1.5 0 0 0 2.5 13h11a1.5 1.5 0 0 0 1.5-1.5V6.954Z"/>
              </svg>
              Review Queue
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="products/all" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-1 0v-3A1.5 1.5 0 0 1 1.5 0h3a.5.5 0 0 1 0 1h-3ZM11 .5a.5.5 0 0 1 .5-.5h3A1.5 1.5 0 0 1 16 1.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 1-.5-.5ZM.5 11a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 0 14.5v-3a.5.5 0 0 1 .5-.5Zm15 0a.5.5 0 0 1 .5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a.5.5 0 0 1 0-1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 1 .5-.5ZM3 4.5a.5.5 0 0 1 1 0v7a.5.5 0 0 1-1 0v-7Zm2-1a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5Zm2 1a.5.5 0 0 1 1 0v7a.5.5 0 0 1-1 0V4.5Zm2-1a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-1 0V4a.5.5 0 0 1 .5-.5Zm2 1a.5.5 0 0 1 1 0v7a.5.5 0 0 1-1 0v-7Z"/>
              </svg>
              All Products
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="stock" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.5A.5.5 0 0 1 .5 1H2a.5.5 0 0 1 .485.379L2.89 3H14.5a.5.5 0 0 1 .491.592l-1.5 8A.5.5 0 0 1 13 12H4a.5.5 0 0 1-.491-.408L2.01 3.607 1.61 2H.5a.5.5 0 0 1-.5-.5zM5 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-7 1a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm7 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
              </svg>
              Stock
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
          <button class="btn-signout" id="admin-signout">Sign out</button>
        </div>
      </nav>

      <div class="panel-main">
        <header class="panel-header">
          <h1 class="page-title" id="admin-page-title">Dashboard</h1>
        </header>
        <main class="panel-content" id="admin-content"></main>
      </div>

    </div>`;

  _contentEl = container.querySelector('#admin-content');
  _navLinks  = Array.from(container.querySelectorAll('.nav-link'));

  container.querySelector('#admin-nav').addEventListener('click', e => {
    const link = e.target.closest('[data-view]');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.view);
  });

  container.querySelector('#admin-signout').addEventListener('click', async () => {
    await setCurrentUser(null);
    window.location.reload();
  });

  navigate('dashboard');
}
