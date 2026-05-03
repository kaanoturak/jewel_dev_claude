import DB                               from '../../core/db.js';
import { getCurrentUser }               from '../../modules/auth/index.js';
import { transition }                   from '../../modules/workflow/index.js';
import {
  validate,
  PRODUCT_SCHEMA,
  MANUFACTURER_COST_SCHEMA,
  VARIANT_SCHEMA,
}                                       from '../../core/validator.js';
import { generateProductSKU, generateVariantSKU } from '../../modules/product/sku.js';
import {
  generateUUID,
  PRODUCT_CATEGORIES,
  PRODUCT_MATERIALS,
  formatCurrency,
  esc,
}                                       from '../../shared/utils/index.js';
import { logAction }                    from '../../core/logger.js';

// ─── Module state ──────────────────────────────────────────────────────────────

let _productId         = null;
let _draft             = {};
let _variants          = [];
let _pendingBlobs      = {};   // blobId → { file: File, objectURL: string }
let _deletedImageIds   = [];   // blobIds of saved images removed by the user
let _deletedVariantIds = [];
let _sharedCostMode    = true;
let _activeTab         = 0;
let _navigate          = null;
let _saving            = false; // guard against double-save race

const TABS = [
  'Basic Info', 'Media', 'Description', 'Variants', 'Costs', 'Review & Submit',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _initDraft() {
  return {
    name: '', category: '', material: '', collection: '',
    images: [], primaryImageIndex: 0, video: null,
    seoTitle: '', seoDescription: '',
    marketingDescription: '', productDescription: '',
    materials: '', careInstructions: '', searchTags: [],
    costMaterial: '', costLabor: '', costPackaging: '',
  };
}

function _calcBase(draft) {
  return (Number(draft.costMaterial)  || 0)
       + (Number(draft.costLabor)     || 0)
       + (Number(draft.costPackaging) || 0);
}

function _randSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// ─── Load ──────────────────────────────────────────────────────────────────────

async function _loadProduct(productId) {
  const product = await DB.get('products', productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const [variants, blobs] = await Promise.all([
    DB.queryByIndex('variants', 'productId', productId),
    DB.queryByIndex('mediaBlobs', 'productId', productId),
  ]);

  const blobMap = Object.fromEntries((blobs || []).map(b => [b.blobId, b]));
  const images  = (product.images || []).map(img => {
    const b = blobMap[img.id];
    return b ? { ...img, url: URL.createObjectURL(b.blob) } : img;
  });

  return {
    draft: {
      ...product,
      images,
      searchTags:    Array.isArray(product.searchTags) ? product.searchTags : [],
      costMaterial:  product.costMaterial  ?? '',
      costLabor:     product.costLabor     ?? '',
      costPackaging: product.costPackaging ?? '',
    },
    variants: (variants || []).map(v => ({
      ...v,
      costMaterial:  v.costMaterial  ?? '',
      costLabor:     v.costLabor     ?? '',
      costPackaging: v.costPackaging ?? '',
    })),
  };
}

// ─── Save ──────────────────────────────────────────────────────────────────────

async function _saveProduct() {
  if (_saving) return;
  _saving = true;
  try {
  const user = getCurrentUser();
  const now  = Date.now();

  const images = _draft.images.map(img => ({
    id:               img.id,
    url:              img.url,
    format:           img.format,
    originalFilename: img.originalFilename,
    width:            img.width  || 0,
    height:           img.height || 0,
    sizeBytes:        img.sizeBytes,
    uploadedAt:       img.uploadedAt,
    altText:          img.altText || '',
  }));

  if (_sharedCostMode) {
    const m = Number(_draft.costMaterial)  || 0;
    const l = Number(_draft.costLabor)     || 0;
    const p = Number(_draft.costPackaging) || 0;
    for (const v of _variants) { v.costMaterial = m; v.costLabor = l; v.costPackaging = p; }
  } else {
    _draft.costMaterial  = _variants.length ? Number(_variants[0].costMaterial)  || 0 : 0;
    _draft.costLabor     = _variants.length ? Number(_variants[0].costLabor)     || 0 : 0;
    _draft.costPackaging = _variants.length ? Number(_variants[0].costPackaging) || 0 : 0;
  }
  const costBase = _calcBase(_draft);

  if (_productId) {
    await DB.patch('products', _productId, {
      name:                 _draft.name,
      category:             _draft.category,
      material:             _draft.material,
      collection:           _draft.collection || null,
      images,
      primaryImageIndex:    _draft.primaryImageIndex,
      video:                _draft.video || null,
      seoTitle:             _draft.seoTitle,
      seoDescription:       _draft.seoDescription,
      marketingDescription: _draft.marketingDescription,
      productDescription:   _draft.productDescription,
      materials:            _draft.materials || null,
      careInstructions:     _draft.careInstructions || null,
      searchTags:           _draft.searchTags,
      costMaterial:         Number(_draft.costMaterial)  || 0,
      costLabor:            Number(_draft.costLabor)     || 0,
      costPackaging:        Number(_draft.costPackaging) || 0,
      costBase,
      updatedBy: user.userId,
      updatedAt: now,
    });
  } else {
    const sku = await generateProductSKU(_draft.category || 'Other', _draft.material || 'Brass');
    const id  = generateUUID();

    await DB.add('products', {
      id,
      sku,
      parentProductId:      null,
      name:                 _draft.name,
      category:             _draft.category,
      material:             _draft.material,
      collection:           _draft.collection || null,
      status:               'DRAFT',
      version:              1,
      images,
      primaryImageIndex:    _draft.primaryImageIndex,
      video:                _draft.video || null,
      seoTitle:             _draft.seoTitle,
      seoDescription:       _draft.seoDescription,
      marketingDescription: _draft.marketingDescription,
      productDescription:   _draft.productDescription,
      materials:            _draft.materials || null,
      careInstructions:     _draft.careInstructions || null,
      searchTags:           _draft.searchTags,
      costMaterial:         Number(_draft.costMaterial)  || 0,
      costLabor:            Number(_draft.costLabor)     || 0,
      costPackaging:        Number(_draft.costPackaging) || 0,
      costBase,
      adminTaxPct:          null,
      adminMarginPct:       null,
      adminLogisticsCost:   null,
      adminMarketingCost:   null,
      adminMiscCost:        null,
      transferPrice:        null,
      sellingPrice:         null,
      compareAtPrice:       null,
      activeCampaignId:     null,
      revisionNotes:        null,
      rejectionReason:      null,
      adminReviewedBy:      null,
      adminReviewedAt:      null,
      salesReviewedBy:      null,
      salesReviewedAt:      null,
      createdBy:            user.userId,
      createdAt:            now,
      updatedBy:            user.userId,
      updatedAt:            now,
      archivedAt:           null,
    });

    _productId = id;
    _draft.id  = id;
    _draft.sku = sku;

    logAction({
      productId: id,
      userId:    user.userId,
      userRole:  user.role,
      action:    'PRODUCT_CREATED',
      changedFields: [{ field: 'status', oldValue: null, newValue: 'DRAFT' }],
    });
  }

  // Flush pending blobs
  for (const img of images) {
    if (!_pendingBlobs[img.id]) continue;
    const { file } = _pendingBlobs[img.id];
    try {
      await DB.add('mediaBlobs', {
        blobId:    img.id,
        productId: _productId,
        blob:      file,
        format:    file.type || 'image/*',
        sizeBytes: file.size,
        createdAt: now,
      });
      URL.revokeObjectURL(img.url);
    } catch { /* already stored */ }
    delete _pendingBlobs[img.id];
  }

  // Save / update variants
  const product = await DB.get('products', _productId);
  for (const v of _variants) {
    if (v.variantId) {
      await DB.patch('variants', v.variantId, {
        size:          v.size  || null,
        color:         v.color || null,
        weight:        v.weight ? Number(v.weight) : null,
        stockCount:    Number(v.stockCount) || 0,
        isActive:      v.isActive !== false,
        costMaterial:  Number(v.costMaterial)  || 0,
        costLabor:     Number(v.costLabor)     || 0,
        costPackaging: Number(v.costPackaging) || 0,
        updatedAt:     now,
      });
    } else {
      const vId = generateUUID();
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const sku = generateVariantSKU(product.sku, _randSuffix());
          await DB.add('variants', {
            variantId:        vId,
            productId:        _productId,
            sku,
            size:             v.size  || null,
            color:            v.color || null,
            weight:           v.weight ? Number(v.weight) : null,
            customAttributes: [],
            stockCount:       Number(v.stockCount) || 0,
            isActive:         v.isActive !== false,
            costMaterial:     Number(v.costMaterial)  || 0,
            costLabor:        Number(v.costLabor)     || 0,
            costPackaging:    Number(v.costPackaging) || 0,
            createdAt:        now,
            updatedAt:        now,
          });
          v.variantId = vId;
          v.sku       = sku;
          break;
        } catch { /* SKU collision — retry with new suffix */ }
      }
    }
  }

  // Delete orphaned blobs from images removed by the user
  for (const blobId of _deletedImageIds) {
    await DB.delete('mediaBlobs', blobId).catch(() => {});
  }
  _deletedImageIds = [];

  // Delete removed variants
  for (const vId of _deletedVariantIds) {
    await DB.delete('variants', vId).catch(() => {});
  }
  _deletedVariantIds = [];
  } finally {
    _saving = false;
  }
}

// ─── DOM collection (active tab → state) ──────────────────────────────────────

function _collect(formPage) {
  switch (_activeTab) {
    case 0:
      _draft.name       = formPage.querySelector('#f-name')?.value?.trim()       ?? _draft.name;
      _draft.category   = formPage.querySelector('#f-category')?.value           ?? _draft.category;
      _draft.material   = formPage.querySelector('#f-material')?.value           ?? _draft.material;
      _draft.collection = formPage.querySelector('#f-collection')?.value?.trim() ?? _draft.collection;
      break;
    case 2:
      _draft.seoTitle             = formPage.querySelector('#f-seo-title')?.value?.trim() ?? _draft.seoTitle;
      _draft.seoDescription       = formPage.querySelector('#f-seo-desc')?.value?.trim()  ?? _draft.seoDescription;
      _draft.marketingDescription = formPage.querySelector('#f-mkt-desc')?.value?.trim()  ?? _draft.marketingDescription;
      _draft.productDescription   = formPage.querySelector('#f-prod-desc')?.value?.trim() ?? _draft.productDescription;
      _draft.materials            = formPage.querySelector('#f-materials')?.value?.trim() ?? _draft.materials;
      _draft.careInstructions     = formPage.querySelector('#f-care')?.value?.trim()      ?? _draft.careInstructions;
      break;
    case 3:
      formPage.querySelectorAll('[data-variant-idx]').forEach(row => {
        const i = parseInt(row.dataset.variantIdx, 10);
        if (!_variants[i]) return;
        _variants[i].size       = row.querySelector('[data-f="size"]')?.value?.trim()        || null;
        _variants[i].color      = row.querySelector('[data-f="color"]')?.value?.trim()       || null;
        _variants[i].weight     = parseFloat(row.querySelector('[data-f="weight"]')?.value)  || null;
        _variants[i].stockCount = parseInt(row.querySelector('[data-f="stock"]')?.value, 10) || 0;
        _variants[i].isActive   = row.querySelector('[data-f="active"]')?.checked !== false;
        if (!_sharedCostMode) {
          _variants[i].costMaterial  = row.querySelector('[data-f="costMat"]')?.value || '';
          _variants[i].costLabor     = row.querySelector('[data-f="costLab"]')?.value || '';
          _variants[i].costPackaging = row.querySelector('[data-f="costPkg"]')?.value || '';
        }
      });
      if (_sharedCostMode) {
        _draft.costMaterial  = formPage.querySelector('#sc-mat')?.value ?? _draft.costMaterial;
        _draft.costLabor     = formPage.querySelector('#sc-lab')?.value ?? _draft.costLabor;
        _draft.costPackaging = formPage.querySelector('#sc-pkg')?.value ?? _draft.costPackaging;
      }
      break;
    case 4:
      _draft.costMaterial  = formPage.querySelector('#f-cost-mat')?.value ?? _draft.costMaterial;
      _draft.costLabor     = formPage.querySelector('#f-cost-lab')?.value ?? _draft.costLabor;
      _draft.costPackaging = formPage.querySelector('#f-cost-pkg')?.value ?? _draft.costPackaging;
      break;
  }
}

// ─── Tab: Basic Info ───────────────────────────────────────────────────────────

function _tabBasicInfo() {
  const d = document.createElement('div');
  d.className = 'tab-panel';
  d.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="f-name">Product Name *</label>
      <input id="f-name" class="form-input" type="text" maxlength="120"
             value="${esc(_draft.name)}" placeholder="e.g. Signet Ring No.1">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="f-category">Category *</label>
        <select id="f-category" class="form-select">
          <option value="">Select…</option>
          ${PRODUCT_CATEGORIES.map(c =>
            `<option value="${esc(c)}"${_draft.category === c ? ' selected' : ''}>${esc(c)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-material">Material *</label>
        <select id="f-material" class="form-select">
          <option value="">Select…</option>
          ${PRODUCT_MATERIALS.map(m =>
            `<option value="${esc(m)}"${_draft.material === m ? ' selected' : ''}>${esc(m)}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="f-collection">
        Collection <span class="form-optional">(optional)</span>
      </label>
      <input id="f-collection" class="form-input" type="text"
             value="${esc(_draft.collection || '')}" placeholder="e.g. Archetype Series">
    </div>`;
  return d;
}

// ─── Tab: Media ────────────────────────────────────────────────────────────────

function _tabMedia() {
  const d = document.createElement('div');
  d.className = 'tab-panel';

  const imgSection = document.createElement('div');
  imgSection.className = 'form-group';
  imgSection.innerHTML = `
    <label class="form-label">
      Product Images * <span class="form-optional">(min 1, recommended 4–8)</span>
    </label>`;

  const fileInput = document.createElement('input');
  fileInput.type     = 'file';
  fileInput.accept   = 'image/jpeg,image/png,image/webp';
  fileInput.multiple = true;
  fileInput.style.display = 'none';

  const uploadZone = document.createElement('div');
  uploadZone.className = 'media-upload-zone';
  uploadZone.innerHTML = `
    <div style="font-size:32px;opacity:.35">🖼</div>
    <p>Click to select images</p>
    <p class="media-upload-hint">JPG, PNG, WebP · max 20 MB each · min 600 px</p>`;
  uploadZone.addEventListener('click', () => fileInput.click());

  const grid = document.createElement('div');
  grid.className = 'media-grid';
  _renderGrid(grid);

  fileInput.addEventListener('change', () => {
    _handleImageFiles(Array.from(fileInput.files), grid);
    fileInput.value = '';
  });

  imgSection.append(uploadZone, fileInput, grid);
  d.appendChild(imgSection);

  const vidSection = document.createElement('div');
  vidSection.className = 'form-group';
  vidSection.innerHTML = `
    <label class="form-label">
      Video <span class="form-optional">(optional · MP4/MOV · max 50 MB)</span>
    </label>`;

  const vidWrap = document.createElement('div');
  vidWrap.id = 'vid-zone-wrap';
  vidWrap.appendChild(_buildVideoZone());
  vidSection.appendChild(vidWrap);
  d.appendChild(vidSection);

  return d;
}

function _buildVideoZone() {
  const zone = document.createElement('div');
  zone.className = 'media-upload-zone';

  if (_draft.video) {
    zone.innerHTML = `
      <p>📹 ${esc(_draft.video.originalFilename || 'Video')}</p>
      <button class="btn btn--ghost btn--sm" id="btn-rmv-vid" style="margin-top:8px">Remove</button>`;
    zone.querySelector('#btn-rmv-vid').addEventListener('click', e => {
      e.stopPropagation();
      _draft.video = null;
      document.querySelector('#vid-zone-wrap')?.replaceChild(_buildVideoZone(), zone);
    });
  } else {
    const vidInput = document.createElement('input');
    vidInput.type   = 'file';
    vidInput.accept = 'video/mp4,video/quicktime';
    vidInput.style.display = 'none';
    zone.innerHTML = `
      <div style="font-size:32px;opacity:.35">🎥</div>
      <p>Click to add a video</p>
      <p class="media-upload-hint">MP4 or MOV · max 50 MB</p>`;
    zone.appendChild(vidInput);
    zone.addEventListener('click', () => vidInput.click());
    vidInput.addEventListener('change', () => {
      const file = vidInput.files[0];
      if (!file) return;
      if (file.size > 50 * 1024 * 1024) { alert('Video must be 50 MB or smaller.'); return; }
      const blobId = generateUUID();
      const url    = URL.createObjectURL(file);
      _pendingBlobs[blobId] = { file, objectURL: url };
      _draft.video = {
        id: blobId, url, format: file.type,
        originalFilename: file.name, sizeBytes: file.size, uploadedAt: Date.now(),
      };
      document.querySelector('#vid-zone-wrap')?.replaceChild(_buildVideoZone(), zone);
    });
  }

  return zone;
}

function _handleImageFiles(files, grid) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (file.size > 20 * 1024 * 1024) { alert(`${file.name} exceeds 20 MB and was skipped.`); continue; }
    const blobId = generateUUID();
    const url    = URL.createObjectURL(file);
    _pendingBlobs[blobId] = { file, objectURL: url };
    _draft.images.push({
      id: blobId, url, format: file.type, originalFilename: file.name,
      width: 0, height: 0, sizeBytes: file.size, uploadedAt: Date.now(), altText: '',
    });
  }
  _renderGrid(grid);
}

function _renderGrid(grid) {
  grid.innerHTML = '';
  _draft.images.forEach((img, i) => {
    const thumb = document.createElement('div');
    thumb.className = `media-thumb${i === _draft.primaryImageIndex ? ' media-thumb--primary' : ''}`;
    thumb.title = 'Click to set as primary';

    const imgEl = document.createElement('img');
    imgEl.src = img.url;
    imgEl.alt = img.altText || img.originalFilename || '';
    thumb.appendChild(imgEl);

    if (i === _draft.primaryImageIndex) {
      const badge = document.createElement('span');
      badge.className = 'media-thumb-badge';
      badge.textContent = 'Primary';
      thumb.appendChild(badge);
    }

    const rm = document.createElement('button');
    rm.className = 'media-thumb-remove';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', e => {
      e.stopPropagation();
      if (_pendingBlobs[img.id]) {
        URL.revokeObjectURL(_pendingBlobs[img.id].objectURL);
        delete _pendingBlobs[img.id];
      } else {
        _deletedImageIds.push(img.id);
      }
      _draft.images.splice(i, 1);
      if (_draft.primaryImageIndex >= _draft.images.length) {
        _draft.primaryImageIndex = Math.max(0, _draft.images.length - 1);
      }
      _renderGrid(grid);
    });
    thumb.appendChild(rm);

    thumb.addEventListener('click', () => { _draft.primaryImageIndex = i; _renderGrid(grid); });
    grid.appendChild(thumb);
  });
}

// ─── Tab: Description ──────────────────────────────────────────────────────────

function _tabDescription() {
  const d = document.createElement('div');
  d.className = 'tab-panel';
  d.innerHTML = `
    <div class="form-group">
      <label class="form-label" for="f-seo-title">SEO Title *</label>
      <input id="f-seo-title" class="form-input" type="text" maxlength="70"
             value="${esc(_draft.seoTitle)}" placeholder="Handmade Brass Signet Ring | TuguJewelry">
      <div class="form-hint">
        <span>Shown in Google search results</span>
        <span id="cnt-seo-title">${(_draft.seoTitle||'').length}/70</span>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="f-seo-desc">SEO Description *</label>
      <textarea id="f-seo-desc" class="form-textarea" maxlength="160" rows="3"
                placeholder="Brief, compelling description for search results.">${esc(_draft.seoDescription)}</textarea>
      <div class="form-hint">
        <span>Meta description</span>
        <span id="cnt-seo-desc">${(_draft.seoDescription||'').length}/160</span>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label" for="f-mkt-desc">Marketing Description *</label>
      <textarea id="f-mkt-desc" class="form-textarea" rows="4"
                placeholder="Ad copy for Google/Meta campaigns (min 50 chars).">${esc(_draft.marketingDescription)}</textarea>
      <div class="form-hint"><span id="cnt-mkt">${(_draft.marketingDescription||'').length} / min 50</span></div>
    </div>
    <div class="form-group">
      <label class="form-label" for="f-prod-desc">Product Description *</label>
      <textarea id="f-prod-desc" class="form-textarea" rows="6"
                placeholder="Full product description (min 100 chars).">${esc(_draft.productDescription)}</textarea>
      <div class="form-hint"><span id="cnt-prod">${(_draft.productDescription||'').length} / min 100</span></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="f-materials">Materials <span class="form-optional">(optional)</span></label>
        <textarea id="f-materials" class="form-textarea" rows="3"
                  placeholder="e.g. Solid brass, hand-polished.">${esc(_draft.materials || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-care">Care Instructions <span class="form-optional">(optional)</span></label>
        <textarea id="f-care" class="form-textarea" rows="3"
                  placeholder="e.g. Polish with a soft cloth.">${esc(_draft.careInstructions || '')}</textarea>
      </div>
    </div>
    <div class="form-group" id="tags-wrap">
      <label class="form-label">Search Tags <span class="form-optional">(optional)</span></label>
    </div>`;

  d.querySelector('#f-seo-title').addEventListener('input', function () {
    d.querySelector('#cnt-seo-title').textContent = `${this.value.length}/70`;
  });
  d.querySelector('#f-seo-desc').addEventListener('input', function () {
    d.querySelector('#cnt-seo-desc').textContent = `${this.value.length}/160`;
  });
  d.querySelector('#f-mkt-desc').addEventListener('input', function () {
    d.querySelector('#cnt-mkt').textContent = `${this.value.length} / min 50`;
  });
  d.querySelector('#f-prod-desc').addEventListener('input', function () {
    d.querySelector('#cnt-prod').textContent = `${this.value.length} / min 100`;
  });

  d.querySelector('#tags-wrap').appendChild(_buildTagsWidget());
  return d;
}

function _buildTagsWidget() {
  const wrap = document.createElement('div');
  wrap.className = 'tags-input-wrap';

  const inp = document.createElement('input');
  inp.className = 'tags-input';
  inp.type = 'text';

  const render = () => {
    wrap.innerHTML = '';
    for (const tag of _draft.searchTags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${esc(tag)}<button class="tag-chip-remove" data-tag="${esc(tag)}" title="Remove">×</button>`;
      wrap.appendChild(chip);
    }
    wrap.appendChild(inp);
    inp.placeholder = _draft.searchTags.length === 0 ? 'Type a tag, press Enter or comma…' : '';
  };

  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = inp.value.trim().replace(/,/g, '');
      if (v && !_draft.searchTags.includes(v)) _draft.searchTags.push(v);
      inp.value = '';
      render();
    } else if (e.key === 'Backspace' && !inp.value && _draft.searchTags.length) {
      _draft.searchTags.pop();
      render();
    }
  });

  wrap.addEventListener('click', e => {
    const btn = e.target.closest('.tag-chip-remove');
    if (btn) {
      _draft.searchTags = _draft.searchTags.filter(t => t !== btn.dataset.tag);
      render();
    } else {
      inp.focus();
    }
  });

  render();
  return wrap;
}

// ─── Tab: Variants ─────────────────────────────────────────────────────────────

function _renderSharedCostInputs(container) {
  container.innerHTML = '';
  if (!_sharedCostMode) {
    container.innerHTML = '<p style="font-size:13px;color:var(--text-muted)">Costs are set per-variant in the table above.</p>';
    return;
  }
  const m = parseFloat(_draft.costMaterial)  || 0;
  const l = parseFloat(_draft.costLabor)     || 0;
  const p = parseFloat(_draft.costPackaging) || 0;
  container.innerHTML = `
    <div class="form-row-3">
      <div class="form-group">
        <label class="form-label" for="sc-mat">Material Cost (USD) *</label>
        <input id="sc-mat" class="form-input" type="number" min="0.01" step="0.01"
               value="${m || ''}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label" for="sc-lab">Labor Cost (USD) *</label>
        <input id="sc-lab" class="form-input" type="number" min="0" step="0.01"
               value="${l || ''}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label" for="sc-pkg">
          Packaging Cost <span class="form-optional">(optional)</span>
        </label>
        <input id="sc-pkg" class="form-input" type="number" min="0" step="0.01"
               value="${p || ''}" placeholder="0.00">
      </div>
    </div>`;
}

function _tabVariants() {
  if (_variants.length === 0) {
    _variants.push({ size: '', color: '', weight: '', stockCount: 0, isActive: true,
                     costMaterial: '', costLabor: '', costPackaging: '' });
  }

  const d = document.createElement('div');
  d.className = 'tab-panel';

  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<span class="section-title">Variants</span>`;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--secondary btn--sm';
  addBtn.textContent = '+ Add Variant';
  addBtn.addEventListener('click', () => {
    _collectVariantRows(d);
    _variants.push({ size: '', color: '', weight: '', stockCount: 0, isActive: true,
                     costMaterial: '', costLabor: '', costPackaging: '' });
    d.querySelector('#vt-wrap')?.replaceWith(_buildVariantTable());
  });
  header.appendChild(addBtn);
  d.appendChild(header);
  d.appendChild(_buildVariantTable());

  // ─── Per-variant cost toggle ───────────────────────────────────────────────
  const costToggle = document.createElement('div');
  costToggle.style.cssText = 'margin-top:20px;padding-top:16px;border-top:1px solid var(--border)';

  const checkLabel = document.createElement('label');
  checkLabel.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;'
    + 'cursor:pointer;margin-bottom:12px;font-weight:500';
  const checkbox = document.createElement('input');
  checkbox.type    = 'checkbox';
  checkbox.id      = 'shared-cost-check';
  checkbox.checked = _sharedCostMode;
  const checkText  = document.createElement('span');
  checkText.textContent = 'Same cost for all variants';
  checkLabel.append(checkbox, checkText);
  costToggle.appendChild(checkLabel);

  const costInputsEl = document.createElement('div');
  costInputsEl.id = 'variant-cost-inputs';
  _renderSharedCostInputs(costInputsEl);
  costToggle.appendChild(costInputsEl);
  d.appendChild(costToggle);

  checkbox.addEventListener('change', () => {
    _collectVariantRows(d);
    _sharedCostMode = checkbox.checked;
    if (_sharedCostMode) {
      const m = Number(_draft.costMaterial)  || 0;
      const l = Number(_draft.costLabor)     || 0;
      const p = Number(_draft.costPackaging) || 0;
      for (const v of _variants) { v.costMaterial = m; v.costLabor = l; v.costPackaging = p; }
    }
    d.querySelector('#vt-wrap')?.replaceWith(_buildVariantTable());
    _renderSharedCostInputs(costInputsEl);
  });

  return d;
}

function _collectVariantRows(panel) {
  panel.querySelectorAll('[data-variant-idx]').forEach(row => {
    const i = parseInt(row.dataset.variantIdx, 10);
    if (!_variants[i]) return;
    _variants[i].size       = row.querySelector('[data-f="size"]')?.value?.trim()        || null;
    _variants[i].color      = row.querySelector('[data-f="color"]')?.value?.trim()       || null;
    _variants[i].weight     = parseFloat(row.querySelector('[data-f="weight"]')?.value)  || null;
    _variants[i].stockCount = parseInt(row.querySelector('[data-f="stock"]')?.value, 10) || 0;
    _variants[i].isActive   = row.querySelector('[data-f="active"]')?.checked !== false;
    if (!_sharedCostMode) {
      _variants[i].costMaterial  = row.querySelector('[data-f="costMat"]')?.value || '';
      _variants[i].costLabor     = row.querySelector('[data-f="costLab"]')?.value || '';
      _variants[i].costPackaging = row.querySelector('[data-f="costPkg"]')?.value || '';
    }
  });
}

function _buildVariantTable() {
  const wrap = document.createElement('div');
  wrap.id = 'vt-wrap';

  const tbl = document.createElement('table');
  tbl.className = 'variant-table';
  const costCols = !_sharedCostMode
    ? '<th>Material $</th><th>Labor $</th><th>Packaging $</th>'
    : '';
  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Size</th><th>Color</th><th>Weight (g)</th>
        <th>Stock *</th><th>Active</th>${costCols}<th>SKU</th><th></th>
      </tr>
    </thead>
    <tbody id="vt-body"></tbody>`;

  const tbody = tbl.querySelector('#vt-body');

  _variants.forEach((v, i) => {
    const tr = document.createElement('tr');
    tr.dataset.variantIdx = i;
    const costInputs = !_sharedCostMode ? `
      <td><input class="variant-input" type="number" data-f="costMat" min="0" step="0.01" value="${v.costMaterial||''}" placeholder="0.00" style="width:80px"></td>
      <td><input class="variant-input" type="number" data-f="costLab" min="0" step="0.01" value="${v.costLabor||''}"    placeholder="0.00" style="width:80px"></td>
      <td><input class="variant-input" type="number" data-f="costPkg" min="0" step="0.01" value="${v.costPackaging||''}" placeholder="0.00" style="width:80px"></td>` : '';
    tr.innerHTML = `
      <td><input class="variant-input" type="text"   data-f="size"   maxlength="20" value="${esc(v.size||'')}"  placeholder="e.g. 7.5"></td>
      <td><input class="variant-input" type="text"   data-f="color"  maxlength="30" value="${esc(v.color||'')}" placeholder="e.g. Gold"></td>
      <td><input class="variant-input" type="number" data-f="weight" min="0" step="0.1" value="${v.weight||''}" placeholder="g" style="width:72px"></td>
      <td><input class="variant-input" type="number" data-f="stock"  min="0" step="1"   value="${v.stockCount??0}" style="width:72px"></td>
      <td style="text-align:center"><input type="checkbox" data-f="active"${v.isActive!==false?' checked':''}></td>
      ${costInputs}
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(v.sku||'—')}</td>
      <td>${_variants.length > 1 ? `<button class="btn btn--ghost btn--sm" data-rm="${i}" title="Remove">✕</button>` : ''}</td>`;
    tbody.appendChild(tr);
  });

  tbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-rm]');
    if (!btn) return;
    const i = parseInt(btn.dataset.rm, 10);
    _collectVariantRows(wrap.closest('.tab-panel') || wrap);
    if (_variants[i]?.variantId) _deletedVariantIds.push(_variants[i].variantId);
    _variants.splice(i, 1);
    wrap.replaceWith(_buildVariantTable());
  });

  wrap.appendChild(tbl);
  return wrap;
}

// ─── Tab: Costs ────────────────────────────────────────────────────────────────

function _tabCosts() {
  const m = parseFloat(_draft.costMaterial)  || 0;
  const l = parseFloat(_draft.costLabor)     || 0;
  const p = parseFloat(_draft.costPackaging) || 0;

  const d = document.createElement('div');
  d.className = 'tab-panel';
  d.innerHTML = `
    <div class="form-row-3">
      <div class="form-group">
        <label class="form-label" for="f-cost-mat">Material Cost (USD) *</label>
        <input id="f-cost-mat" class="form-input" type="number" min="0.01" step="0.01"
               value="${esc(String(_draft.costMaterial))}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label" for="f-cost-lab">Labor Cost (USD) *</label>
        <input id="f-cost-lab" class="form-input" type="number" min="0" step="0.01"
               value="${esc(String(_draft.costLabor))}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label class="form-label" for="f-cost-pkg">
          Packaging Cost <span class="form-optional">(optional)</span>
        </label>
        <input id="f-cost-pkg" class="form-input" type="number" min="0" step="0.01"
               value="${esc(String(_draft.costPackaging))}" placeholder="0.00">
      </div>
    </div>
    <div class="cost-calc">
      <div class="cost-calc__row"><span>Material</span><span id="cc-m">${formatCurrency(m)}</span></div>
      <div class="cost-calc__row"><span>Labor</span><span id="cc-l">${formatCurrency(l)}</span></div>
      <div class="cost-calc__row"><span>Packaging</span><span id="cc-p">${formatCurrency(p)}</span></div>
      <div class="cost-calc__total"><span>Total Base Cost</span><span id="cc-t">${formatCurrency(m+l+p)}</span></div>
    </div>
    <div class="alert alert--info" style="margin-top:20px">
      ℹ Admin will apply their own cost layers (tax, margin, logistics) on top of this.
      You will not see the final transfer price.
    </div>`;

  const negWarn = document.createElement('div');
  negWarn.id = 'cost-neg-warning';
  negWarn.style.cssText = 'display:none;font-size:12px;color:var(--red,#ef4444);margin-top:6px';
  negWarn.textContent = 'Cost values cannot be negative.';
  d.querySelector('.cost-calc').before(negWarn);

  const update = () => {
    const mv = parseFloat(d.querySelector('#f-cost-mat')?.value) ?? 0;
    const lv = parseFloat(d.querySelector('#f-cost-lab')?.value) ?? 0;
    const pv = parseFloat(d.querySelector('#f-cost-pkg')?.value) ?? 0;
    d.querySelector('#cc-m').textContent = formatCurrency(Math.max(0, mv));
    d.querySelector('#cc-l').textContent = formatCurrency(Math.max(0, lv));
    d.querySelector('#cc-p').textContent = formatCurrency(Math.max(0, pv));
    d.querySelector('#cc-t').textContent = formatCurrency(Math.max(0, mv) + Math.max(0, lv) + Math.max(0, pv));
    negWarn.style.display = (mv < 0 || lv < 0 || pv < 0) ? 'block' : 'none';
  };
  d.querySelector('#f-cost-mat').addEventListener('input', update);
  d.querySelector('#f-cost-lab').addEventListener('input', update);
  d.querySelector('#f-cost-pkg').addEventListener('input', update);
  return d;
}

// ─── Tab: Review & Submit ──────────────────────────────────────────────────────

function _tabReview(formPage) {
  const d = document.createElement('div');
  d.className = 'tab-panel';

  const productData = {
    ..._draft,
    costMaterial: Number(_draft.costMaterial) || 0,
    costLabor:    Number(_draft.costLabor)    || 0,
    images:       _draft.images,
  };

  const r1 = validate(PRODUCT_SCHEMA, productData);
  const r2 = validate(MANUFACTURER_COST_SCHEMA, productData);

  const variantErrors = [];
  if (_variants.length === 0) {
    variantErrors.push('At least one variant is required');
  }
  _variants.forEach((v, i) => {
    const r = validate(VARIANT_SCHEMA, { ...v, stockCount: Number(v.stockCount) || 0 });
    if (!r.valid) Object.values(r.errors).flat().forEach(m => variantErrors.push(`Variant ${i + 1}: ${m}`));
  });

  const allErrors = [
    ...Object.values(r1.errors).flat(),
    ...Object.values(r2.errors).flat(),
    ...variantErrors,
  ];

  if (allErrors.length > 0) {
    const errBox = document.createElement('div');
    errBox.className = 'alert alert--error';
    errBox.innerHTML = `<strong>Fix before submitting:</strong><ul style="margin-top:8px;padding-left:18px">
      ${allErrors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`;
    d.appendChild(errBox);
    setTimeout(() => errBox.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  const sections = [
    { title: 'Basic Info', rows: [
      ['Name',       _draft.name       || '—'],
      ['Category',   _draft.category   || '—'],
      ['Material',   _draft.material   || '—'],
      ['Collection', _draft.collection || '—'],
    ]},
    { title: 'Media', rows: [
      ['Images', `${_draft.images.length} image(s)`],
      ['Video',  _draft.video ? _draft.video.originalFilename : 'None'],
    ]},
    { title: 'Description', rows: [
      ['SEO Title',      _draft.seoTitle || '—'],
      ['SEO Desc',       `${(_draft.seoDescription||'').length} chars`],
      ['Marketing Desc', `${(_draft.marketingDescription||'').length} chars`],
      ['Product Desc',   `${(_draft.productDescription||'').length} chars`],
      ['Tags',           _draft.searchTags.length ? _draft.searchTags.join(', ') : 'None'],
    ]},
    { title: `Variants (${_variants.length})`, rows:
      _variants.length
        ? _variants.map((v, i) => [
            `#${i + 1}`,
            ([v.size, v.color].filter(Boolean).join(' / ') || 'No attributes') + ` · Stock: ${v.stockCount ?? 0}`,
          ])
        : [['', 'No variants defined']],
    },
    { title: 'Costs', rows: [
      ['Material',  formatCurrency(Number(_draft.costMaterial)  || 0)],
      ['Labor',     formatCurrency(Number(_draft.costLabor)     || 0)],
      ['Packaging', formatCurrency(Number(_draft.costPackaging) || 0)],
      ['Base Cost', formatCurrency(_calcBase(_draft))],
    ]},
  ];

  for (const sec of sections) {
    const box = document.createElement('div');
    box.className = 'review-section';
    box.innerHTML = `<h3>${esc(sec.title)}</h3>` +
      sec.rows.map(([label, value]) => `
        <div class="review-field">
          <span class="review-field__label">${esc(label)}</span>
          <span class="review-field__value">${esc(String(value))}</span>
        </div>`).join('');
    d.appendChild(box);
  }

  const actions = document.createElement('div');
  actions.className = 'submit-actions';

  const draftBtn  = document.createElement('button');
  draftBtn.className   = 'btn btn--secondary';
  draftBtn.textContent = 'Save Draft';

  const submitBtn = document.createElement('button');
  submitBtn.className   = 'btn btn--primary';
  submitBtn.textContent = 'Submit for Review →';
  submitBtn.disabled    = allErrors.length > 0;
  if (allErrors.length > 0) submitBtn.title = 'Fix the errors listed above';

  const _run = async (andSubmit) => {
    draftBtn.disabled    = true;
    submitBtn.disabled   = true;
    draftBtn.textContent = 'Saving…';
    d.querySelector('.alert--error')?.remove();
    try {
      await _saveProduct();
      if (andSubmit) {
        const user = getCurrentUser();
        await transition(_productId, 'PENDING_ADMIN', user.userId);
        _navigate('dashboard');
      } else {
        const badge = formPage.querySelector('.form-topbar-sku');
        if (badge && _draft.sku) badge.textContent = `SKU: ${_draft.sku}`;
        draftBtn.textContent = 'Saved ✓';
        setTimeout(() => {
          draftBtn.textContent = 'Save Draft';
          draftBtn.disabled    = false;
          submitBtn.disabled   = allErrors.length > 0;
        }, 2000);
      }
    } catch (err) {
      const errEl = document.createElement('div');
      errEl.className   = 'alert alert--error';
      errEl.textContent = err.message || 'Save failed. Please try again.';
      d.prepend(errEl);
      errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      draftBtn.textContent = 'Save Draft';
      draftBtn.disabled    = false;
      submitBtn.disabled   = allErrors.length > 0;
    }
  };

  draftBtn.addEventListener('click',  () => _run(false));
  submitBtn.addEventListener('click', () => _run(true));
  actions.append(draftBtn, submitBtn);
  d.appendChild(actions);
  return d;
}

// ─── Tab switching ─────────────────────────────────────────────────────────────

function _switchTab(newIdx, formPage) {
  _collect(formPage);
  _activeTab = newIdx;

  formPage.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === newIdx);
  });

  const body = formPage.querySelector('#tab-body');
  body.innerHTML = '';
  body.appendChild(_renderActiveTab(formPage));
}

function _renderActiveTab(formPage) {
  switch (_activeTab) {
    case 0: return _tabBasicInfo();
    case 1: return _tabMedia();
    case 2: return _tabDescription();
    case 3: return _tabVariants();
    case 4: return _tabCosts();
    case 5: return _tabReview(formPage);
    default: return document.createElement('div');
  }
}

// ─── Public render ─────────────────────────────────────────────────────────────

export async function render(container, navigate, params = {}) {
  _navigate          = navigate;
  _activeTab         = 0;
  _pendingBlobs      = {};
  _deletedImageIds   = [];
  _deletedVariantIds = [];
  _sharedCostMode    = true;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text-muted)">
      Loading…
    </div>`;

  try {
    if (params.id) {
      _productId = params.id;
      const { draft, variants } = await _loadProduct(params.id);
      _draft    = draft;
      _variants = variants;
      // Detect per-variant cost mode: shared if all variants have the same cost as the product record
      _sharedCostMode = variants.length === 0 || variants.every(v =>
        Number(v.costMaterial)  === Number(draft.costMaterial)  &&
        Number(v.costLabor)     === Number(draft.costLabor)     &&
        Number(v.costPackaging) === Number(draft.costPackaging)
      );
    } else {
      _productId      = null;
      _draft          = _initDraft();
      _variants       = [];
      _sharedCostMode = true;
    }
  } catch (err) {
    container.innerHTML = `<div class="alert alert--error" style="margin:28px">${esc(err.message)}</div>`;
    return;
  }

  const formPage = document.createElement('div');
  formPage.className = 'form-page';

  // Top bar
  const topbar = document.createElement('div');
  topbar.className = 'form-topbar';

  const backBtn = document.createElement('button');
  backBtn.className   = 'btn btn--ghost btn--sm';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', () => navigate('dashboard'));

  const titleEl = document.createElement('span');
  titleEl.className   = 'form-topbar-title';
  titleEl.textContent = params.id ? `Edit: ${_draft.name || 'Product'}` : 'New Product';

  const skuBadge = document.createElement('span');
  skuBadge.className   = 'form-topbar-sku';
  skuBadge.textContent = _draft.sku ? `SKU: ${_draft.sku}` : 'SKU: generated on first save';

  const saveBtn = document.createElement('button');
  saveBtn.className   = 'btn btn--secondary btn--sm';
  saveBtn.textContent = 'Save Draft';
  saveBtn.addEventListener('click', async () => {
    if (_saving) return;
    _collect(formPage);
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Saving…';
    try {
      await _saveProduct();
      if (_draft.sku) skuBadge.textContent = `SKU: ${_draft.sku}`;
      titleEl.textContent = `Edit: ${_draft.name || 'Product'}`;
      saveBtn.textContent = 'Saved ✓';
      setTimeout(() => { saveBtn.textContent = 'Save Draft'; saveBtn.disabled = false; }, 2000);
    } catch (err) {
      saveBtn.textContent = 'Save Draft';
      saveBtn.disabled    = false;
      alert(`Save failed: ${err.message}`);
    }
  });

  topbar.append(backBtn, titleEl, skuBadge, saveBtn);
  formPage.appendChild(topbar);

  // Tabs header
  const tabsEl = document.createElement('div');
  tabsEl.className = 'form-tabs';
  TABS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className   = `tab-btn${i === 0 ? ' active' : ''}`;
    btn.textContent = label;
    btn.addEventListener('click', () => _switchTab(i, formPage));
    tabsEl.appendChild(btn);
  });
  formPage.appendChild(tabsEl);

  // Tab body
  const body = document.createElement('div');
  body.id = 'tab-body';
  body.appendChild(_renderActiveTab(formPage));
  formPage.appendChild(body);

  // Live-update header title as user types the product name
  formPage.addEventListener('input', e => {
    if (e.target.id === 'f-name') {
      const name = e.target.value.trim();
      titleEl.textContent = name || (params.id ? 'Edit Product' : 'New Product');
    }
  });

  // Replace comma with dot in all number inputs (Turkish locale numpad support)
  formPage.addEventListener('keydown', e => {
    if (e.key === ',' && e.target.matches('input[type="number"]')) {
      e.preventDefault();
      const inp = e.target;
      const pos = inp.selectionStart;
      inp.value = inp.value.slice(0, pos) + '.' + inp.value.slice(inp.selectionEnd);
      inp.setSelectionRange(pos + 1, pos + 1);
    }
  });

  container.innerHTML = '';
  container.appendChild(formPage);
}
