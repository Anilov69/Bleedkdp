(function () {
  'use strict';

  var esc = Shop.escapeHtml;
  var BAG = window.SHOP_BAG = '<div class="img-fallback"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.1A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.9L5 8Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg></div>';
  var state = { settings: {}, products: [], category: 'All', query: '', sort: 'default' };

  var els = {
    grid: document.getElementById('grid'),
    featured: document.getElementById('featured'),
    featuredGrid: document.getElementById('featured-grid'),
    navFeatured: document.getElementById('nav-featured'),
    chips: document.getElementById('chips'),
    empty: document.getElementById('empty'),
    emptyTitle: document.getElementById('empty-title'),
    emptyText: document.getElementById('empty-text'),
    search: document.getElementById('search'),
    sort: document.getElementById('sort'),
    heroStack: document.getElementById('hero-stack')
  };

  document.getElementById('year').textContent = new Date().getFullYear();

  window.addEventListener('scroll', function () {
    document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });

  function applySettings(s) {
    document.querySelectorAll('[data-setting]').forEach(function (el) {
      var v = s[el.getAttribute('data-setting')];
      if (v) el.textContent = v;
    });
    if (s.storeName) document.title = s.storeName + ' | ' + (s.tagline || 'Hand-picked Amazon Finds');
    if (s.contactEmail) document.getElementById('contact-link').href = 'mailto:' + s.contactEmail;
  }

  function link(p) {
    return Shop.buildAffiliateLink(p.link, state.settings.associateTag);
  }

  function imageHtml(p) {
    if (p.image) {
      return '<img src="' + esc(p.image) + '" alt="' + esc(p.title) + '" loading="lazy" onerror="this.outerHTML=window.SHOP_BAG">';
    }
    return BAG;
  }

  function cardHtml(p, i) {
    return '<article class="card reveal" style="--d:' + (i % 8) * 60 + 'ms">' +
      '<a class="card-media" href="' + esc(link(p)) + '" target="_blank" rel="nofollow sponsored noopener">' +
        imageHtml(p) +
        (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') +
      '</a>' +
      '<div class="card-body">' +
        (p.category ? '<span class="card-cat">' + esc(p.category) + '</span>' : '') +
        '<h3 class="card-title">' + esc(p.title) + '</h3>' +
        (p.description ? '<p class="card-desc">' + esc(p.description) + '</p>' : '') +
        '<a class="btn btn-amazon" href="' + esc(link(p)) + '" target="_blank" rel="nofollow sponsored noopener">View on Amazon <span aria-hidden="true">&rarr;</span></a>' +
      '</div>' +
    '</article>';
  }

  function featuredHtml(p, i) {
    return '<article class="feature reveal" style="--d:' + i * 80 + 'ms">' +
      '<a class="feature-media" href="' + esc(link(p)) + '" target="_blank" rel="nofollow sponsored noopener">' + imageHtml(p) + '</a>' +
      '<div class="feature-body">' +
        '<span class="badge badge-inline">' + esc(p.badge || 'Featured') + '</span>' +
        '<h3>' + esc(p.title) + '</h3>' +
        (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
        '<a class="btn btn-amazon" href="' + esc(link(p)) + '" target="_blank" rel="nofollow sponsored noopener">View on Amazon <span aria-hidden="true">&rarr;</span></a>' +
      '</div>' +
    '</article>';
  }

  function categories() {
    var seen = {};
    state.products.forEach(function (p) { if (p.category) seen[p.category] = true; });
    return Object.keys(seen).sort();
  }

  function renderChips() {
    var cats = categories();
    if (!cats.length) { els.chips.innerHTML = ''; return; }
    els.chips.innerHTML = ['All'].concat(cats).map(function (c) {
      return '<button class="chip' + (c === state.category ? ' active' : '') + '" role="tab" aria-selected="' + (c === state.category) + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
  }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    var list = state.products.filter(function (p) {
      if (state.category !== 'All' && p.category !== state.category) return false;
      if (!q) return true;
      return [p.title, p.description, p.category, p.badge].join(' ').toLowerCase().indexOf(q) !== -1;
    });
    if (state.sort === 'newest') {
      list = list.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    } else if (state.sort === 'az') {
      list = list.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
    }
    return list;
  }

  function renderGrid() {
    var list = filtered();
    els.grid.innerHTML = list.map(cardHtml).join('');
    els.empty.hidden = list.length > 0;
    if (!list.length && state.products.length) {
      els.emptyTitle.textContent = 'No matches found';
      els.emptyText.textContent = 'Try a different search or category.';
    }
    observe();
  }

  function renderFeatured() {
    var list = state.products.filter(function (p) { return p.featured; }).slice(0, 4);
    els.featured.hidden = !list.length;
    els.navFeatured.hidden = !list.length;
    els.featuredGrid.innerHTML = list.map(featuredHtml).join('');
  }

  function renderHero() {
    document.getElementById('stat-products').textContent = state.products.length;
    document.getElementById('stat-categories').textContent = categories().length;
    var withImg = state.products.filter(function (p) { return p.image; });
    var picks = withImg.filter(function (p) { return p.featured; }).concat(withImg.filter(function (p) { return !p.featured; })).slice(0, 3);
    var cards = els.heroStack.querySelectorAll('.stack-card');
    picks.forEach(function (p, i) {
      cards[i].innerHTML = '<img src="' + esc(p.image) + '" alt="">';
    });
  }

  var observer = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); }
    });
  }, { threshold: 0.08 }) : null;

  function observe() {
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
      if (observer) observer.observe(el); else el.classList.add('in');
    });
  }

  els.chips.addEventListener('click', function (e) {
    var btn = e.target.closest('.chip');
    if (!btn) return;
    state.category = btn.getAttribute('data-cat');
    renderChips();
    renderGrid();
  });
  els.search.addEventListener('input', function () { state.query = els.search.value; renderGrid(); });
  els.sort.addEventListener('change', function () { state.sort = els.sort.value; renderGrid(); });

  fetch('data/products.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      state.settings = data.settings || {};
      state.products = (data.products || []).filter(function (p) { return p && p.title && Shop.isHttpUrl(p.link); });
      applySettings(state.settings);
      renderHero();
      renderFeatured();
      renderChips();
      renderGrid();
    })
    .catch(function () {
      els.empty.hidden = false;
      els.emptyTitle.textContent = 'Could not load products';
      els.emptyText.textContent = 'Please refresh the page in a moment.';
      observe();
    });

  observe();
})();
