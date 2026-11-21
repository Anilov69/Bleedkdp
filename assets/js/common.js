(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isHttpUrl(value) {
    try {
      var u = new URL(value);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  function isAmazonUrl(value) {
    try {
      var host = new URL(value).hostname.toLowerCase();
      return /(^|\.)amazon\.[a-z.]+$/.test(host) || /(^|\.)amzn\.(to|eu|asia)$/.test(host) || host === 'a.co';
    } catch (e) {
      return false;
    }
  }

  // Adds the Associates tag to full amazon.* links that don't already carry one.
  // Short links (amzn.to / a.co) already embed the tag, so they are left untouched.
  function buildAffiliateLink(link, tag) {
    if (!isHttpUrl(link)) return '#';
    try {
      var u = new URL(link);
      var host = u.hostname.toLowerCase();
      if (tag && /(^|\.)amazon\.[a-z.]+$/.test(host) && !u.searchParams.get('tag')) {
        u.searchParams.set('tag', tag.trim());
      }
      return u.toString();
    } catch (e) {
      return link;
    }
  }

  function hasAffiliateTag(link) {
    try {
      var u = new URL(link);
      var host = u.hostname.toLowerCase();
      if (/(^|\.)amzn\.(to|eu|asia)$/.test(host) || host === 'a.co') return true;
      return !!u.searchParams.get('tag');
    } catch (e) {
      return false;
    }
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item';
  }

  global.Shop = {
    escapeHtml: escapeHtml,
    isHttpUrl: isHttpUrl,
    isAmazonUrl: isAmazonUrl,
    buildAffiliateLink: buildAffiliateLink,
    hasAffiliateTag: hasAffiliateTag,
    slugify: slugify
  };
})(window);
