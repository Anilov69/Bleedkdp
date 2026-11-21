(function () {
  'use strict';

  var esc = Shop.escapeHtml;
  var BAG = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.1A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.9L5 8Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>';
  var DATA_PATH = 'data/products.json';
  var IMAGE_DIR = 'images/products';
  var STORAGE_KEY = 'storeAdminConfig';
  var DEFAULT_SETTINGS = {
    storeName: 'Anilovbaker Picks',
    tagline: 'Hand-picked Amazon finds worth your money',
    heroTitle: 'Smart finds, honestly picked.',
    heroSubtitle: 'A curated collection of the Amazon products I actually recommend.',
    associateTag: '',
    contactEmail: ''
  };

  var config = loadConfig();
  var data = { settings: Object.assign({}, DEFAULT_SETTINGS), products: [] };
  var sha = null;
  var editingId = null;
  var pendingFile = null;
  var pendingFileUrl = null;
  var saveChain = Promise.resolve();
  var conflictGeneration = 0;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Config ---------- */
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch (e) { return null; }
  }
  function storeConfig(c) { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); }

  /* ---------- UI helpers ---------- */
  function toast(msg, type, ms) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'ok');
    el.textContent = msg;
    $('toasts').appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 300);
    }, ms || 4200);
  }
  function setLoading(on) { $('loading').classList.toggle('show', !!on); }
  function setBusy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Saving...'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  /* ---------- GitHub API ---------- */
  function api(path, opts) {
    opts = opts || {};
    return fetch('https://api.github.com/repos/' + config.repo + '/' + path, {
      method: opts.method || 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + config.token,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = text ? JSON.parse(text) : {};
        if (!res.ok) {
          var err = new Error(json.message || ('GitHub error ' + res.status));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  function encodeUtf8(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function decodeUtf8(b64) {
    var bin = atob(b64.replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function friendlyError(err) {
    if (err.status === 401) return 'Your token is invalid or expired. Please sign in again.';
    if (err.status === 403) return 'Your token does not have permission. Make sure "Contents: Read and write" is enabled for this repository.';
    if (err.status === 404) return 'Repository not found, or the token has no access to it.';
    if (err.status === 409 || err.status === 422) return 'The store was changed elsewhere. Reloaded the latest data — please try again.';
    return err.message || 'Something went wrong.';
  }

  function loadData() {
    return api('contents/' + DATA_PATH + '?ref=' + encodeURIComponent(config.branch)).then(function (file) {
      sha = file.sha;
      var parsed = JSON.parse(decodeUtf8(file.content));
      data.settings = Object.assign({}, DEFAULT_SETTINGS, parsed.settings || {});
      data.products = Array.isArray(parsed.products) ? parsed.products : [];
    }).catch(function (err) {
      if (err.status === 404) {
        return api('').then(function () { sha = null; }); // repo exists, file doesn't yet
      }
      throw err;
    });
  }

  function saveData(message) {
    var generation = conflictGeneration;
    var run = function () {
      if (generation !== conflictGeneration) {
        var stale = new Error('Stale change after conflict');
        stale.status = 409;
        return Promise.reject(stale);
      }
      var body = {
        message: message,
        content: encodeUtf8(JSON.stringify(data, null, 2) + '\n'),
        branch: config.branch
      };
      if (sha) body.sha = sha;
      return api('contents/' + DATA_PATH, { method: 'PUT', body: body }).then(function (res) {
        sha = res.content.sha;
      }).catch(function (err) {
        if (err.status === 409 || err.status === 422) {
          conflictGeneration++;
          return loadData().then(function () { renderAll(); throw err; });
        }
        throw err;
      });
    };
    saveChain = saveChain.catch(function () {}).then(run);
    return saveChain;
  }

  function imageSrc(path) {
    if (!path) return '';
    if (Shop.isHttpUrl(path)) return path;
    return 'https://raw.githubusercontent.com/' + config.repo + '/' + config.branch + '/' + path.replace(/^\/+/, '');
  }

  /* ---------- Image upload ---------- */
  function optimizeImage(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var max = 1000;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/webp', 0.86);
        var ext = 'webp';
        if (dataUrl.indexOf('data:image/webp') !== 0) { dataUrl = canvas.toDataURL('image/jpeg', 0.86); ext = 'jpg'; }
        resolve({ base64: dataUrl.split(',')[1], ext: ext });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
      img.src = url;
    });
  }

  function uploadImage(file, title) {
    return optimizeImage(file).then(function (out) {
      var path = IMAGE_DIR + '/' + Date.now() + '-' + Shop.slugify(title) + '.' + out.ext;
      return api('contents/' + path, {
        method: 'PUT',
        body: { message: 'Upload image for "' + title + '"', content: out.base64, branch: config.branch }
      }).then(function () { return path; });
    });
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    $('tb-store').textContent = data.settings.storeName || 'Store Admin';
    $('tag-warning').hidden = !!(data.settings.associateTag || '').trim();
    renderList();
    renderCategoryOptions();
    renderPreview();
    fillSettings();
  }

  function renderCategoryOptions() {
    var seen = {};
    data.products.forEach(function (p) { if (p.category) seen[p.category] = true; });
    $('category-list').innerHTML = Object.keys(seen).sort().map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
  }

  function renderList() {
    var q = $('list-search').value.trim().toLowerCase();
    $('count').textContent = data.products.length;
    $('plist-empty').hidden = data.products.length > 0;
    var tag = data.settings.associateTag;
    $('plist').innerHTML = data.products.map(function (p, i) {
      if (q && [p.title, p.category, p.badge].join(' ').toLowerCase().indexOf(q) === -1) return '';
      var tracked = Shop.hasAffiliateTag(p.link) || (tag && Shop.isAmazonUrl(p.link));
      return '<li class="pitem' + (editingId === p.id ? ' editing' : '') + '" data-id="' + esc(p.id) + '">' +
        '<div class="pthumb">' + (p.image ? '<img src="' + esc(imageSrc(p.image)) + '" alt="" loading="lazy">' : BAG) + '</div>' +
        '<div class="pinfo">' +
          '<strong>' + esc(p.title) + '</strong>' +
          '<div class="pmeta">' +
            (p.category ? '<span class="pill">' + esc(p.category) + '</span>' : '') +
            (p.badge ? '<span class="pill pill-accent">' + esc(p.badge) + '</span>' : '') +
            (tracked ? '<span class="pill pill-ok" title="Affiliate tracking active">&#10003; Tracked</span>' : '<span class="pill pill-warn" title="No Associates tag on this link">&#9888; No tag</span>') +
            '<a href="' + esc(Shop.buildAffiliateLink(p.link, tag)) + '" target="_blank" rel="noopener">Test link &nearr;</a>' +
          '</div>' +
        '</div>' +
        '<div class="pactions">' +
          '<button class="icon' + (p.featured ? ' on' : '') + '" data-act="feature" title="' + (p.featured ? 'Unfeature' : 'Feature') + '">' + (p.featured ? '&#9733;' : '&#9734;') + '</button>' +
          '<button class="icon" data-act="up" title="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
          '<button class="icon" data-act="down" title="Move down"' + (i === data.products.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
          '<button class="btn btn-light btn-sm" data-act="edit">Edit</button>' +
          '<button class="btn btn-danger btn-sm" data-act="delete">Remove</button>' +
        '</div>' +
      '</li>';
    }).join('');
  }

  function formValues() {
    return {
      link: $('f-link').value.trim(),
      title: $('f-title').value.trim(),
      image: $('f-image').value.trim(),
      category: $('f-category').value.trim(),
      badge: $('f-badge').value.trim(),
      description: $('f-description').value.trim(),
      featured: $('f-featured').checked
    };
  }

  function renderPreview() {
    var v = formValues();
    var src = pendingFileUrl || (v.image ? imageSrc(v.image) : '');
    $('p-media').innerHTML = (src ? '<img src="' + esc(src) + '" alt="">' : '<div class="img-fallback">' + BAG + '</div>') +
      '<span class="badge" id="p-badge"' + (v.badge ? '' : ' hidden') + '>' + esc(v.badge) + '</span>';
    $('p-cat').textContent = v.category;
    $('p-title').textContent = v.title || 'Product name';
    $('p-desc').textContent = v.description;
    $('p-link').textContent = v.link && Shop.isHttpUrl(v.link) ? Shop.buildAffiliateLink(v.link, data.settings.associateTag) : '—';
    renderLinkHint(v.link);
  }

  function renderLinkHint(link) {
    var hint = $('link-hint');
    var tag = (data.settings.associateTag || '').trim();
    hint.className = 'hint';
    if (!link) { hint.innerHTML = 'Tip: use Amazon\'s SiteStripe bar &rarr; "Get Link" to copy your affiliate link.'; return; }
    if (!Shop.isHttpUrl(link)) { hint.className = 'hint bad'; hint.textContent = 'This doesn\'t look like a web link.'; return; }
    if (!Shop.isAmazonUrl(link)) { hint.className = 'hint warn'; hint.textContent = 'This is not an Amazon link — double-check it.'; return; }
    var u = new URL(link);
    if (u.searchParams.get('tag')) { hint.className = 'hint good'; hint.textContent = '✓ Affiliate link detected (tag: ' + u.searchParams.get('tag') + ')'; return; }
    if (!/(^|\.)amazon\./.test(u.hostname)) { hint.className = 'hint good'; hint.textContent = '✓ Amazon short link — your tag is built in.'; return; }
    if (tag) { hint.className = 'hint good'; hint.textContent = '✓ Your tracking ID "' + tag + '" will be added automatically.'; return; }
    hint.className = 'hint warn';
    hint.textContent = '⚠ No affiliate tag in this link. Add your tracking ID in Settings to earn commissions.';
  }

  function titleFromAmazonUrl(link) {
    try {
      var u = new URL(link);
      if (!/(^|\.)amazon\./.test(u.hostname)) return '';
      var parts = u.pathname.split('/').filter(Boolean);
      var dp = parts.indexOf('dp');
      var slug = dp > 0 ? parts[dp - 1] : '';
      if (!slug || slug === 'gp') return '';
      return decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    } catch (e) { return ''; }
  }

  function resetForm() {
    editingId = null;
    $('product-form').reset();
    clearFile();
    $('form-title').textContent = 'Add a product';
    $('save-product').textContent = 'Publish product';
    $('cancel-edit').hidden = true;
    renderPreview();
    renderList();
  }

  function clearFile() {
    pendingFile = null;
    if (pendingFileUrl) URL.revokeObjectURL(pendingFileUrl);
    pendingFileUrl = null;
    $('f-file').value = '';
    $('drop').classList.remove('has-file');
    $('drop').querySelector('.drop-inner').innerHTML = '<strong>Drop an image</strong> or click to upload<br><small>JPG, PNG or WEBP — auto-optimized</small>';
  }

  function setFile(file) {
    if (!file || !/^image\//.test(file.type)) { toast('Please choose an image file.', 'err'); return; }
    clearFile();
    pendingFile = file;
    pendingFileUrl = URL.createObjectURL(file);
    $('f-image').value = '';
    $('drop').classList.add('has-file');
    $('drop').querySelector('.drop-inner').innerHTML = '<strong>' + esc(file.name) + '</strong><br><small>Will be uploaded when you publish · <u>change</u></small>';
    renderPreview();
  }

  function startEdit(id) {
    var p = data.products.find(function (x) { return x.id === id; });
    if (!p) return;
    editingId = id;
    clearFile();
    $('f-link').value = p.link || '';
    $('f-title').value = p.title || '';
    $('f-image').value = p.image || '';
    $('f-category').value = p.category || '';
    $('f-badge').value = p.badge || '';
    $('f-description').value = p.description || '';
    $('f-featured').checked = !!p.featured;
    $('form-title').textContent = 'Edit product';
    $('save-product').textContent = 'Save changes';
    $('cancel-edit').hidden = false;
    renderPreview();
    renderList();
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fillSettings() {
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      var el = $('s-' + k);
      if (el && document.activeElement !== el) el.value = data.settings[k] || '';
    });
  }

  /* ---------- Actions ---------- */
  function submitProduct(e) {
    e.preventDefault();
    var v = formValues();
    if (!Shop.isHttpUrl(v.link)) { toast('Please paste a valid Amazon link.', 'err'); $('f-link').focus(); return; }
    if (!v.title) { toast('Please enter a product name.', 'err'); $('f-title').focus(); return; }
    if (v.image && !Shop.isHttpUrl(v.image) && !/^images\//.test(v.image)) { toast('The image address must start with https://', 'err'); return; }
    if (!Shop.isAmazonUrl(v.link) && !confirm('This link is not an Amazon link. Publish anyway?')) return;

    var btn = $('save-product');
    var wasEditing = editingId;
    var backup = JSON.stringify(data.products);
    setBusy(btn, true, pendingFile ? 'Uploading image...' : 'Publishing...');
    setLoading(true);

    var imageStep = pendingFile ? uploadImage(pendingFile, v.title) : Promise.resolve(v.image);
    imageStep.then(function (imagePath) {
      btn.textContent = 'Publishing...';
      var product = {
        id: wasEditing || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        title: v.title,
        link: v.link,
        image: imagePath || '',
        category: v.category,
        badge: v.badge,
        description: v.description,
        featured: v.featured
      };
      if (wasEditing) {
        var idx = data.products.findIndex(function (x) { return x.id === wasEditing; });
        product.createdAt = (data.products[idx] || {}).createdAt || new Date().toISOString();
        if (idx >= 0) data.products[idx] = product; else data.products.unshift(product);
      } else {
        product.createdAt = new Date().toISOString();
        data.products.unshift(product);
      }
      return saveData((wasEditing ? 'Update' : 'Add') + ' product: ' + v.title).then(function () {
        toast(wasEditing ? 'Changes saved! Live on your site in about a minute.' : '"' + v.title + '" published! Live on your site in about a minute.');
        resetForm();
        renderAll();
      });
    }).catch(function (err) {
      if (err.status !== 409 && err.status !== 422) { data.products = JSON.parse(backup); renderAll(); }
      toast(friendlyError(err), 'err', 7000);
      if (err.status === 401) logout();
    }).finally(function () {
      setBusy(btn, false);
      if (!editingId) btn.textContent = 'Publish product';
      setLoading(false);
    });
  }

  function mutateAndSave(mutate, message, success) {
    var backup = JSON.stringify(data.products);
    mutate();
    renderAll();
    setLoading(true);
    return saveData(message).then(function () {
      if (success) toast(success);
    }).catch(function (err) {
      if (err.status !== 409 && err.status !== 422) { data.products = JSON.parse(backup); renderAll(); }
      toast(friendlyError(err), 'err', 7000);
      if (err.status === 401) logout();
    }).finally(function () { setLoading(false); });
  }

  function onListClick(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var id = btn.closest('.pitem').getAttribute('data-id');
    var idx = data.products.findIndex(function (p) { return p.id === id; });
    if (idx < 0) return;
    var p = data.products[idx];
    var act = btn.getAttribute('data-act');

    if (act === 'edit') return startEdit(id);
    if (act === 'delete') {
      if (!confirm('Remove "' + p.title + '" from your store?')) return;
      if (editingId === id) resetForm();
      return mutateAndSave(function () { data.products.splice(idx, 1); }, 'Remove product: ' + p.title, 'Product removed.');
    }
    if (act === 'feature') {
      return mutateAndSave(function () { p.featured = !p.featured; }, (p.featured ? 'Unfeature' : 'Feature') + ' product: ' + p.title, p.featured ? 'Removed from featured.' : 'Now featured on your homepage!');
    }
    if (act === 'up' || act === 'down') {
      var to = act === 'up' ? idx - 1 : idx + 1;
      if (to < 0 || to >= data.products.length) return;
      return mutateAndSave(function () {
        data.products.splice(to, 0, data.products.splice(idx, 1)[0]);
      }, 'Reorder products', null);
    }
  }

  function submitSettings(e) {
    e.preventDefault();
    var btn = $('save-settings');
    var next = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { next[k] = ($('s-' + k).value || '').trim(); });
    if (!next.storeName) { toast('Store name is required.', 'err'); return; }
    var prev = data.settings;
    data.settings = Object.assign({}, data.settings, next);
    setBusy(btn, true);
    saveData('Update store settings').then(function () {
      toast('Settings saved! Live in about a minute.');
      renderAll();
    }).catch(function (err) {
      if (err.status !== 409 && err.status !== 422) data.settings = prev;
      toast(friendlyError(err), 'err', 7000);
    }).finally(function () { setBusy(btn, false); });
  }

  function downloadBackup() {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'store-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('[data-panel]').forEach(function (p) { p.hidden = p.dataset.panel !== name; });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- Auth ---------- */
  function showLogin(error) {
    $('app-view').hidden = true;
    $('login-view').hidden = false;
    $('login-error').hidden = !error;
    $('login-error').textContent = error || '';
    setLoading(false);
  }

  function enterApp() {
    setLoading(true);
    return loadData().then(function () {
      $('login-view').hidden = true;
      $('app-view').hidden = false;
      renderAll();
      setLoading(false);
    });
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    config = null;
    showLogin();
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('login-btn');
    config = {
      token: $('token').value.trim(),
      repo: $('repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, ''),
      branch: $('branch').value.trim() || 'main'
    };
    setBusy(btn, true, 'Signing in...');
    enterApp().then(function () {
      storeConfig(config);
      $('token').value = '';
      toast('Welcome back! You\'re signed in.');
    }).catch(function (err) {
      showLogin(friendlyError(err));
      config = null;
    }).finally(function () { setBusy(btn, false); });
  });

  /* ---------- Wire up ---------- */
  $('logout').addEventListener('click', logout);
  $('product-form').addEventListener('submit', submitProduct);
  $('product-form').addEventListener('input', renderPreview);
  $('f-link').addEventListener('change', function () {
    if (!$('f-title').value.trim()) {
      var t = titleFromAmazonUrl($('f-link').value.trim());
      if (t) { $('f-title').value = t; renderPreview(); }
    }
  });
  $('f-image').addEventListener('input', function () { if ($('f-image').value.trim() && pendingFile) clearFile(); renderPreview(); });
  $('f-file').addEventListener('change', function () { if (this.files[0]) setFile(this.files[0]); });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function (e) {
    if ($('app-view').hidden) return;
    var item = Array.prototype.find.call(e.clipboardData.items || [], function (it) { return it.type.indexOf('image/') === 0; });
    if (item) { e.preventDefault(); setFile(item.getAsFile()); }
  });
  $('cancel-edit').addEventListener('click', resetForm);
  $('plist').addEventListener('click', onListClick);
  $('list-search').addEventListener('input', renderList);
  $('settings-form').addEventListener('submit', submitSettings);
  $('download-backup').addEventListener('click', downloadBackup);
  document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.dataset.tab); }); });
  document.querySelectorAll('[data-goto]').forEach(function (b) { b.addEventListener('click', function () { switchTab(b.dataset.goto); }); });

  if (config && config.token) {
    enterApp().catch(function (err) {
      if (err.status === 401) { localStorage.removeItem(STORAGE_KEY); config = null; }
      showLogin(friendlyError(err));
    });
  } else {
    showLogin();
  }
})();
