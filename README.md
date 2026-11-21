# Anilovbaker Picks

An Amazon affiliate storefront hosted on GitHub Pages at [anilovbaker.tech](https://anilovbaker.tech).
Every product button sends visitors straight to Amazon through your Associates link.

## Managing products

1. Go to **https://anilovbaker.tech/admin.html**.
2. Sign in with a GitHub fine-grained token (one time per browser):
   - [Create a token](https://github.com/settings/personal-access-tokens/new)
   - Repository access: **Only select repositories → Bleedkdp**
   - Permissions → Repository permissions → **Contents: Read and write**
3. **Settings** tab: enter your Amazon Associates tracking ID (e.g. `yourname-20`). It is added automatically to full `amazon.*` links that don't already include a tag. Short `amzn.to` links from SiteStripe already contain it.
4. **Products** tab: paste the Amazon link, a name and an image (upload/drag/paste a file, or paste the image address), then **Publish**. Use the buttons on each product to edit, feature (star), reorder or remove it.

Changes are saved as commits to `data/products.json` (uploaded images go to `images/products/`) and go live in about a minute once GitHub Pages rebuilds.

## Structure

| Path | Purpose |
| --- | --- |
| `index.html` | Public storefront |
| `admin.html` | Admin dashboard (not indexed by search engines) |
| `data/products.json` | Store settings and product list |
| `assets/` | Styles and scripts |
| `images/products/` | Uploaded product images |
