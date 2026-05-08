# workflow-ts landing page

Static site served at GitHub Pages. Three files, no build step, no dependencies.

- `index.html` — structure and content
- `styles.css` — blueprint / drafting-sheet aesthetic
- `app.js` — interactive state diagram, tab switching, inline tokenizer

## Local preview

Any static server works. From the repo root:

```bash
npx http-server docs/site -p 4173 -c-1
# or
python3 -m http.server --directory docs/site 4173
```

Then open <http://localhost:4173>.

## Deployment

Pushes to `main` that touch `docs/site/**` (or `.github/workflows/pages.yml`) trigger
`.github/workflows/pages.yml`, which publishes the contents of `docs/site/` to
GitHub Pages.

Before the first deploy, enable Pages in the repo: **Settings → Pages → Build and
deployment → Source: GitHub Actions**. No manual branch or `CNAME` required.

The workflow can also be run manually via **Actions → Deploy landing page to
GitHub Pages → Run workflow**.
