import { getCurrentUser, setCurrentUser } from '../../modules/auth/index.js';
import { render as renderDashboard }     from './dashboard.js';
import { render as renderProductForm }   from './product-form.js';
import { render as renderProductView }   from './product-view.js';

// ─── Internal router ──────────────────────────────────────────────────────────
// Views are keyed by a simple string path. Params are passed as a plain object.

const VIEWS = {
  dashboard:       renderDashboard,
  'products/new':  renderProductForm,
  'products/edit': renderProductForm,
  'products/view': renderProductView,
  account:         renderAccountStub,
};

let _contentEl  = null;
let _navLinks   = null;
let _currentView = null;

function navigate(view, params = {}) {
  _currentView = view;

  // Update active nav link
  if (_navLinks) {
    _navLinks.forEach((link) => {
      link.classList.toggle('active', link.dataset.view === view);
    });
  }

  // Update page title
  const titleEl = document.querySelector('.page-title');
  if (titleEl) titleEl.textContent = viewTitle(view);

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

function viewTitle(view) {
  const titles = {
    dashboard:       'Dashboard',
    'products/new':  'New Product',
    'products/edit': 'Edit Product',
    'products/view': 'Product Detail',
    account:         'Account',
  };
  return titles[view] ?? view;
}

// ─── Account view ─────────────────────────────────────────────────────────────

function renderAccountStub(container) {
  const user = getCurrentUser();
  container.innerHTML = `
    <div style="max-width:480px">
      <div class="card" style="padding:24px">
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Signed in as</p>
        <p style="font-weight:600;font-size:15px">${user?.displayName ?? '—'}</p>
        <p style="font-size:12px;color:var(--text-muted);margin-top:2px">${user?.email ?? ''}</p>
        <p style="font-size:12px;font-weight:600;color:var(--accent);margin-top:8px">${user?.role ?? ''}</p>
      </div>
    </div>`;
}

// ─── Panel shell ──────────────────────────────────────────────────────────────

export function mount(container) {
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="panel">

      <!-- Sidebar -->
      <nav class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-name">TuguJewelry</span>
          <span class="sidebar-brand-role">Manufacturer</span>
        </div>

        <ul class="sidebar-nav" id="mfr-nav">
          <li>
            <a class="nav-link active" data-view="dashboard" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2h5v5H2V2zm7 0h5v5H9V2zm-7 7h5v5H2V9zm7 0h5v5H9V9z"/>
              </svg>
              Dashboard
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="products/new" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 0 1.5h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5H1.75a.75.75 0 0 1 0-1.5h5.5V1.75A.75.75 0 0 1 8 1z"/>
              </svg>
              New Product
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="account" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6a5 5 0 0 1 10 0H3z"/>
              </svg>
              Account
            </a>
          </li>
        </ul>

        <div class="sidebar-footer">
          <span class="sidebar-user-name">${user?.displayName ?? '—'}</span>
          <span class="sidebar-user-email">${user?.email ?? ''}</span>
          <button class="btn-signout" id="btn-signout">Sign out</button>
        </div>
      </nav>

      <!-- Main area -->
      <div class="panel-main">
        <header class="panel-header">
          <h1 class="page-title">Dashboard</h1>
          <button class="btn btn--primary" id="btn-new-product">+ New Product</button>
        </header>
        <main class="panel-content" id="mfr-content"></main>
      </div>

    </div>
  `;

  // Cache refs
  _contentEl = container.querySelector('#mfr-content');
  _navLinks  = Array.from(container.querySelectorAll('.nav-link'));

  // Nav clicks
  container.querySelector('#mfr-nav').addEventListener('click', (e) => {
    const link = e.target.closest('[data-view]');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.view);
  });

  // Header "New Product" shortcut
  container.querySelector('#btn-new-product').addEventListener('click', () => {
    navigate('products/new');
  });

  // Sign out
  container.querySelector('#btn-signout').addEventListener('click', async () => {
    await setCurrentUser(null);
    window.location.reload();
  });

  // Initial view
  navigate('dashboard');
}
