import { getCurrentUser, setCurrentUser } from '../../modules/auth/index.js';
import { render as renderDashboard }     from './dashboard.js';
import { render as renderProductQueue }  from './product-queue.js';
import { render as renderProductDetail } from './product-detail.js';
import { render as renderCampaignForm }  from './campaign-form.js';

// ─── Views ─────────────────────────────────────────────────────────────────────

const VIEWS = {
  dashboard:         renderDashboard,
  'products/queue':  renderProductQueue,
  'products/detail': renderProductDetail,
  'products/active': (c, nav, p) => renderProductQueue(c, nav, { ...p, mode: 'active' }),
  'campaigns/new':   renderCampaignForm,
  'campaigns/edit':  renderCampaignForm,
};

const VIEW_TITLES = {
  dashboard:         'Dashboard',
  'products/queue':  'Incoming Queue',
  'products/active': 'Active Products',
  'products/detail': 'Product Detail',
  'campaigns/new':   'New Campaign',
  'campaigns/edit':  'Edit Campaign',
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

  const titleEl = document.querySelector('#sales-page-title');
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
          <span class="sidebar-brand-role">Sales</span>
        </div>

        <ul class="sidebar-nav" id="sales-nav">
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
              Incoming Queue
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="products/active" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 1a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-1 0v-3A1.5 1.5 0 0 1 1.5 0h3a.5.5 0 0 1 0 1h-3ZM11 .5a.5.5 0 0 1 .5-.5h3A1.5 1.5 0 0 1 16 1.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 1-.5-.5ZM.5 11a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 0 14.5v-3a.5.5 0 0 1 .5-.5Zm15 0a.5.5 0 0 1 .5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a.5.5 0 0 1 0-1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 1 .5-.5Z"/>
              </svg>
              Active Products
            </a>
          </li>
          <li>
            <a class="nav-link" data-view="campaigns/new" href="#">
              <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H0V4zm0 3h16v5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V7zm3 2a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5H3z"/>
              </svg>
              New Campaign
            </a>
          </li>
        </ul>

        <div class="sidebar-footer">
          <span class="sidebar-user-name">${user?.displayName ?? '—'}</span>
          <span class="sidebar-user-email">${user?.email ?? ''}</span>
          <button class="btn-signout" id="sales-signout">Sign out</button>
        </div>
      </nav>

      <div class="panel-main">
        <header class="panel-header">
          <h1 class="page-title" id="sales-page-title">Dashboard</h1>
        </header>
        <main class="panel-content" id="sales-content"></main>
      </div>

    </div>`;

  _contentEl = container.querySelector('#sales-content');
  _navLinks  = Array.from(container.querySelectorAll('.nav-link'));

  container.querySelector('#sales-nav').addEventListener('click', e => {
    const link = e.target.closest('[data-view]');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.view);
  });

  container.querySelector('#sales-signout').addEventListener('click', async () => {
    await setCurrentUser(null);
    window.location.reload();
  });

  navigate('dashboard');
}
