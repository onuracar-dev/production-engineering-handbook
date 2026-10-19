# Handbook site

The reading view for this handbook, published at [handbook.onuracar.dev](https://handbook.onuracar.dev). Nine books sit on an SVG shelf, one per domain, and each spine is as thick as the number of problems inside it. Opening a book shows its contents. Each problem is a two-page spread: the left page has the problem and the approaches that failed first, the right page has the fix, its source and, where one exists, the verified test output.

React 18 + Vite. There are no other runtime dependencies: page turns are CSS 3D transforms, markdown is rendered by a small parser in `src/markdown.js`, and routing uses the URL hash (`#/<domain-folder>/<case-slug>`).

## Run it

Requires Node 22+.

```bash
npm install
npm run dev
```

`npm run build` writes the static site to `dist/`, and `npm run preview` serves that build.

## Where the content comes from

Nothing in `site/` duplicates the handbook. `scripts/build-data.mjs` runs before `dev` and `build`:

1. It reads the **Quick Problem Index** in the root `README.md` to get the books, their order, and the question for each case.
2. For every case it parses `<domain>/<case>/README.md` by heading: *Problem*, *Why Naive Approaches Fail*, *Architecture*, *Implementation* and the optional *How to Verify*, *How to Run* or *Derivation*. Only a case with a `test/` folder gets the "Verified" stamp; *How to Verify* without `test/` (or `test/` without *How to Verify*) fails the build.
3. It writes `public/data/index.json` (shelf and contents) and one `public/data/book-<n>.json` per book (loaded when the book is opened). Both are generated and git-ignored.

The build fails instead of publishing a broken page when:

- a case listed in the index has no folder or no `README.md`,
- a required section is missing or empty,
- the file linked from *Implementation* does not exist,
- a book has no `SPINE` / `HEIGHTS` entry in `src/config.js`.

So a new case study shows up on the site after the next deploy, as long as it follows the [contributing guide](../CONTRIBUTING.md) and is added to the Quick Problem Index. A new domain also needs one line in `src/config.js` for its spine colour and height.

## Layout

| Path | What it does |
|---|---|
| `src/Shelf.jsx` | The SVG shelf: spines, bookend, plant, hover label |
| `src/Reader.jsx` | Top bar, the two-page spread, corner page-turn buttons |
| `src/useBook.js` | Builds the pages, measures the contents into pages, runs the page-turn animation, hash routing |
| `src/markdown.js` | Minimal markdown to HTML for the case content |
| `src/config.js` | Spine colours, heights, roman numerals, repo URL |
| `prototype/` | The original single-file prototype the site was ported from, kept for reference |

## Deploy (Cloudflare Workers)

The site deploys as static assets on a Worker. `wrangler.jsonc` points the Worker at `dist/`.

| Setting | Value |
|---|---|
| Path (root directory) | `site` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Node version | `site/.node-version` (22) |
| Custom domain | `handbook.onuracar.dev` |

The build reads files outside `site/` (the root README and the domain folders), which works because Cloudflare clones the whole repository.
