import { getCurrentUser, setCurrentUser } from '../../modules/auth/index.js';

/**
 * Build the standard panel layout (sidebar + main area) into container.
 *
 * config: {
 *   brandName:    string
 *   brandRole:    string
 *   navItems:     [{ view: string, icon: string (SVG path innerHTML), label: string }]
 *   onViewRender: (view, params, contentEl, navigate) => void
 *   getHeaderEl:  (view, navigate) => HTMLElement | null   — optional
 * }
 *
 * Returns { contentEl, navigate }
 */
export function buildPanelShell(container, config) {
  const { brandName, brandRole, navItems, onViewRender, getHeaderEl } = config;
  const user = getCurrentUser();

  container.innerHTML = `
    <div class="panel">
      <nav class="sidebar">
        <div class="sidebar-brand">
          <span class="sidebar-brand-name">${brandName}</span>
          <span class="sidebar-brand-role">${brandRole}</span>
        </div>
        <ul class="sidebar-nav" id="ps-nav"></ul>
        <div class="sidebar-footer">
          <span class="sidebar-user-name">${user?.displayName ?? '—'}</span>
          <span class="sidebar-user-email">${user?.email ?? ''}</span>
          <button class="btn-signout" id="ps-signout">Sign out</button>
        </div>
      </nav>
      <div class="panel-main">
        <header class="panel-header">
          <h1 class="page-title" id="ps-title"></h1>
          <div id="ps-header-slot"></div>
        </header>
        <main class="panel-content" id="ps-content"></main>
      </div>
    </div>
  `;

  const navEl     = container.querySelector('#ps-nav');
  const titleEl   = container.querySelector('#ps-title');
  const slotEl    = container.querySelector('#ps-header-slot');
  const contentEl = container.querySelector('#ps-content');

  for (const item of navItems) {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.className    = 'nav-link';
    a.href         = '#';
    a.dataset.view = item.view;
    a.innerHTML    = `
      <svg class="nav-icon" viewBox="0 0 16 16" fill="currentColor">${item.icon}</svg>
      ${item.label}
    `;
    li.appendChild(a);
    navEl.appendChild(li);
  }

  function navigate(view, params = {}) {
    navEl.querySelectorAll('.nav-link').forEach((a) => {
      a.classList.toggle('active', a.dataset.view === view);
    });

    const item = navItems.find((n) => n.view === view);
    titleEl.textContent = item?.label ?? view;

    slotEl.innerHTML = '';
    const headerEl = getHeaderEl?.(view, navigate);
    if (headerEl) slotEl.appendChild(headerEl);

    onViewRender(view, params, contentEl, navigate);
  }

  navEl.addEventListener('click', (e) => {
    const link = e.target.closest('[data-view]');
    if (!link) return;
    e.preventDefault();
    navigate(link.dataset.view);
  });

  container.querySelector('#ps-signout').addEventListener('click', async () => {
    await setCurrentUser(null);
    window.location.reload();
  });

  return { contentEl, navigate };
}
