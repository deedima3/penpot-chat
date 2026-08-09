# Canvas Copilot for Penpot

An AI design agent plugin for Penpot. Describe a design from scratch, or select existing layers and ask the assistant to create, refine, align, organize, or remove them. Every request becomes a visible, editable operation plan before it is applied.

The design agent is guided by a product-design and frontend-aware system prompt: it plans a clear visual direction, coherent type/spacing, accessible text contrast, safe artboard padding, and explicit layer roles. At execution time, generated siblings are deterministically reordered from frame/background through surfaces and controls to text, with a final text-contrast safety net.

## Autonomous agent mode

Click **Run to goal** to start an agent loop rather than a one-shot design plan. The agent receives the current canvas state, applies a small batch of tools, re-reads the resulting canvas, and continues until it can verify the goal or reaches its six-pass safety cap. You can stop a run at any time; already-applied changes remain editable in Penpot.

## What it can do

- Create pages, artboards, rectangles, ellipses, text, and safe inline SVG vectors.
- Build complete wireframe or visual design directions from a prompt.
- Edit selected layers: position, size, rotation, opacity, fills, strokes, corner radius, text, and typography.
- Align, distribute, reorder, group, ungroup, or delete the current selection.
- Work with an OpenAI-compatible `/chat/completions` endpoint; no API key is bundled or committed.

The AI contract and every supported argument are documented in [guides/AI_TOOL_GUIDE.md](guides/AI_TOOL_GUIDE.md). The app deliberately uses a reviewed plan rather than unrestricted AI execution.

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

### Use LM Studio locally

Start LM Studio's server from its **Developer** tab, then open **AI connection** in Canvas Copilot and select **Connect local**. The plugin discovers your first available model at `http://localhost:1234/v1/models`, selects it, and uses LM Studio's OpenAI-compatible chat-completions endpoint. No API key is required unless you explicitly enabled LM Studio API authentication.

Canvas Copilot uses LM Studio's normal text response mode and validates the JSON-only design plan before showing it, so it works with locally loaded chat models that do not expose structured-output settings.

After an update, remove the existing Canvas Copilot entry in Penpot's Plugin Manager and install the manifest URL again. The manifest uses a versioned plugin filename so Penpot fetches the current build instead of its previously cached script.

## Deploy with GitHub Pages

The production bundle is committed in `docs/`, which GitHub Pages can serve directly from the repository—no Actions deployment token is needed.

1. In GitHub, go to **Settings → Pages**.
2. Set **Source** to **Deploy from a branch**, branch **`main`**, folder **`/docs`**, then save.
3. Install the resulting manifest in Penpot:

   ```text
   https://<github-user>.github.io/<repository-name>/manifest.json
   ```

The build uses relative asset URLs, so `manifest.json` resolves `plugin.js`, `icon.svg`, and the plugin iframe correctly from the Pages URL. Run `npm run build` before committing any future plugin changes; the included workflow verifies this build on every push.

## Architecture

```text
Designer → iframe UI → AI endpoint → validated JSON plan → designer approval → Penpot plugin bridge → canvas
```

`src/main.ts` renders the UI. `src/plugin.ts` is the only module that uses the global `penpot` API; it owns context collection, AI prompting, schema validation, and safe execution. This matches Penpot's iframe/plugin communication model and keeps the set of canvas mutations auditable.
