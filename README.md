# Canvas Copilot for Penpot

An AI design agent plugin for Penpot. Describe a design from scratch, or select existing layers and ask the assistant to create, refine, align, organize, or remove them. Every request becomes a visible, editable operation plan before it is applied.

## What it can do

- Create pages, artboards, rectangles, ellipses, text, and safe inline SVG vectors.
- Build complete wireframe or visual design directions from a prompt.
- Edit selected layers: position, size, rotation, opacity, fills, strokes, corner radius, text, and typography.
- Align, distribute, reorder, group, ungroup, or delete the current selection.
- Work with an OpenAI-compatible `/chat/completions` endpoint; no API key is bundled or committed.

The AI contract and every supported argument are documented in [docs/AI_TOOL_GUIDE.md](docs/AI_TOOL_GUIDE.md). The app deliberately uses a reviewed plan rather than unrestricted AI execution.

## Run locally

```bash
npm install
npm run dev
```

Open Penpot's Plugin Manager (`Ctrl` + `Alt` + `P` on Linux/Windows, `⌘` + `Alt` + `P` on macOS), then install:

```
http://localhost:4400/manifest.json
```

Open **Canvas Copilot**, expand **AI connection**, and supply an OpenAI-compatible chat-completions URL, model name, and API key. The browser stores these values only in the plugin's local storage.

## Deploy with GitHub Pages

The included [GitHub Pages workflow](.github/workflows/deploy-pages.yml) builds and publishes `dist/` whenever `main` is pushed.

1. Create or connect a GitHub repository, commit this project, and push its default branch as `main`.
2. In GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the **Deploy Penpot plugin to GitHub Pages** workflow manually).
4. Install the resulting manifest in Penpot:

   ```text
   https://<github-user>.github.io/<repository-name>/manifest.json
   ```

The build uses relative asset URLs, so `manifest.json` always resolves `plugin.js` and `icon.svg` correctly from a Pages project URL.

## Architecture

```text
Designer → iframe UI → AI endpoint → validated JSON plan → designer approval → Penpot plugin bridge → canvas
```

`src/main.ts` renders the UI. `src/plugin.ts` is the only module that uses the global `penpot` API; it owns context collection, AI prompting, schema validation, and safe execution. This matches Penpot's iframe/plugin communication model and keeps the set of canvas mutations auditable.
