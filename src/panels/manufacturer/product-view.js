import DB                              from '../../core/db.js';
import { statusBadge, formatCurrency, formatDate, esc } from '../../shared/utils/index.js';
import { transition }                  from '../../modules/workflow/index.js';
import { getCurrentUser }              from '../../modules/auth/index.js';

const EDITABLE_STATUSES = new Set(['DRAFT', 'REVISION_REQUESTED_BY_ADMIN']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function field(label, value) {
  if (!value && value !== 0) return '';
  return `
    <div style="display:grid;grid-template-columns:160px 1fr;gap:8px;padding:7px 0;
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
    return b ? { ...img, url: (typeof b.blob === 'string' ? b.blob : URL.createObjectURL(b.blob)) } : img;
  });

  return { product: { ...product, images }, variants: variants || [] };
}

// ─── Section renderers ─────────────────────────────────────────────────────────

function _renderAlert(product) {
  if (product.status === 'REVISION_REQUESTED_BY_ADMIN' && product.revisionNotes) {
    return `
      <div class="alert alert--warning" style="margin-bottom:20px">
        <strong>Revision requested by Admin:</strong>
        <p style="margin-top:6px;white-space:pre-wrap">${esc(product.revisionNotes)}</p>
      </div>`;
  }

  if (product.status === 'REJECTED' && product.rejectionReason) {
    return `
      <div class="alert alert--error" style="margin-bottom:20px">
        <strong>Product rejected:</strong>
        <p style="margin-top:6px;white-space:pre-wrap">${esc(product.rejectionReason)}</p>
      </div>`;
  }
  return '';
}

function _renderHeader(product) {
  const primaryImg = product.images?.[product.primaryImageIndex ?? 0];

  const thumbHTML = primaryImg
    ? `<img src="${esc(primaryImg.url)}" alt="${esc(primaryImg.altText || product.name)}"
            style="width:72px;height:72px;object-fit:cover;border-radius:var(--r-md);
                   flex-shrink:0;background:var(--bg)">`
    : `<div style="width:72px;height:72px;border-radius:var(--r-md);background:var(--bg);
                   display:flex;align-items:center;justify-content:center;
                   font-size:28px;opacity:.3;flex-shrink:0">💎</div>`;

  return `
    <div class="card" style="margin-bottom:20px;padding:20px 24px;
                              display:flex;align-items:flex-start;gap:20px">
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
          ${product.category ? `<span class="badge badge--gray">${esc(product.category)}</span>` : ''}
          ${product.material ? `<span class="badge badge--gray">${esc(product.material)}</span>` : ''}
          ${product.collection ? `<span class="badge badge--gray">${esc(product.collection)}</span>` : ''}
        </div>
      </div>
    </div>`;
}

function _renderDescription(product) {
  const rows = [
    field('SEO Title',         esc(product.seoTitle   || '—')),
    field('SEO Description',   esc(product.seoDescription || '—')),
    field('Marketing Desc',    `<span style="white-space:pre-wrap">${esc(product.marketingDescription || '—')}</span>`),
    field('Product Desc',      `<span style="white-space:pre-wrap">${esc(product.productDescription || '—')}</span>`),
    product.materials        ? field('Materials',        esc(product.materials)) : '',
    product.careInstructions ? field('Care',             esc(product.careInstructions)) : '',
    product.searchTags?.length
      ? field('Tags', product.searchTags.map(t => `<span class="badge badge--gray" style="margin-right:4px">${esc(t)}</span>`).join(''))
      : '',
  ].join('');

  return sectionCard('Description', rows || '<p style="color:var(--text-muted);font-size:13px;padding:8px 0">No description yet.</p>');
}

function _renderMedia(product) {
  if (!product.images?.length) {
    return sectionCard('Media', `<p style="color:var(--text-muted);font-size:13px;padding:8px 0">No images uploaded.</p>`);
  }

  const gridHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;padding-top:8px">
      ${product.images.map((img, i) => `
        <div style="position:relative;aspect-ratio:1;border-radius:var(--r-md);overflow:hidden;
                    border:2px solid ${i === (product.primaryImageIndex ?? 0) ? 'var(--accent)' : 'var(--border)'}">
          <img src="${esc(img.url)}" alt="${esc(img.altText || '')}"
               style="width:100%;height:100%;object-fit:cover">
          ${i === (product.primaryImageIndex ?? 0)
            ? `<span style="position:absolute;top:4px;left:4px;background:var(--accent);color:#fff;
                            font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;
                            text-transform:uppercase">Primary</span>`
            : ''}
        </div>`).join('')}
    </div>
    ${product.video
      ? `<p style="margin-top:12px;font-size:13px;color:var(--text-muted)">
           📹 ${esc(product.video.originalFilename || 'Video attached')}
         </p>`
      : ''}`;

  return sectionCard('Media', gridHTML);
}

function _renderVariants(variants) {
  if (!variants.length) {
    return sectionCard('Variants', `<p style="color:var(--text-muted);font-size:13px;padding:8px 0">No variants defined.</p>`);
  }

  const rows = variants.map(v => `
    <tr>
      <td>${esc(v.sku || '—')}</td>
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
        <tr>
          <th>SKU</th><th>Size</th><th>Color</th>
          <th>Weight</th><th>Stock</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  return sectionCard(`Variants (${variants.length})`, tableHTML);
}

function _renderCosts(product) {
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

  return sectionCard('Manufacturer Costs', rows + totalHTML);
}

function _renderMeta(product) {
  const rows = [
    field('Created',     formatDate(product.createdAt)),
    field('Last Updated', formatDate(product.updatedAt)),
    product.archivedAt ? field('Archived', formatDate(product.archivedAt)) : '',
    field('Version',     String(product.version || 1)),
  ].join('');

  return sectionCard('Product Info', rows);
}

// ─── Public render ─────────────────────────────────────────────────────────────

export async function render(container, navigate, params = {}) {
  if (!params.id) {
    container.innerHTML = `<div class="alert alert--error" style="margin:28px">No product ID provided.</div>`;
    return;
  }

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

  const canEdit   = EDITABLE_STATUSES.has(product.status);
  const viewPage  = document.createElement('div');

  // Top bar
  const topbar = document.createElement('div');
  topbar.style.cssText = 'display:flex;align-items:center;gap:12px;padding:16px 28px;'
    + 'background:var(--surface);border-bottom:1px solid var(--border)';

  const backBtn = document.createElement('button');
  backBtn.className   = 'btn btn--ghost btn--sm';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', () => navigate(params.returnTo || 'dashboard'));

  const titleEl = document.createElement('span');
  titleEl.style.cssText  = 'flex:1;font-size:14px;font-weight:600';
  titleEl.textContent    = product.name || 'Product Detail';

  topbar.appendChild(backBtn);
  topbar.appendChild(titleEl);

  if (canEdit) {
    const editBtn = document.createElement('button');
    editBtn.className   = 'btn btn--secondary btn--sm';
    editBtn.textContent = 'Edit Product';
    editBtn.addEventListener('click', () => navigate('products/edit', { id: product.id, returnTo: params.returnTo || 'dashboard' }));
    topbar.appendChild(editBtn);
  }


  viewPage.appendChild(topbar);

  // Content area
  const content = document.createElement('div');
  content.style.cssText = 'padding:28px;max-width:900px';
  content.innerHTML     =
    _renderAlert(product) +
    _renderHeader(product) +
    _renderDescription(product) +
    _renderMedia(product) +
    _renderVariants(variants) +
    _renderCosts(product) +
    _renderMeta(product);

  viewPage.appendChild(content);

  container.innerHTML = '';
  container.appendChild(viewPage);
}
