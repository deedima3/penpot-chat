# Canvas Copilot AI tool guide

Canvas Copilot does not give the language model direct JavaScript or unrestricted access to a Penpot file. Instead, it sends a compact page/selection summary and asks the model for a JSON plan. The plan is validated, shown to the designer, and only then executed by the Penpot-side bridge.

This is the exact tool surface available to the AI:

| Tool | When to use it | Required / useful arguments |
| --- | --- | --- |
| `create_page` | Start a separate design direction or deliverable | `name` |
| `create_board` | Make an artboard/container | `name`, `x`, `y`, `width`, `height`, `fill`, `radius` |
| `create_rectangle` | Create panels, buttons, cards, dividers | `name`, `x`, `y`, `width`, `height`, `fill`, `radius`, `stroke`, `parent: "last_board"` |
| `create_ellipse` | Create avatars, pills, decorative geometry | Same placement/style arguments as rectangles |
| `create_text` | Create editable typography | `name`, `text`, `x`, `y`, optional `width`, `fontFamily`, `fontSize`, `fontWeight`, `fill`, `align`, `parent: "last_board"` |
| `create_svg` | Insert a small, editable vector illustration | `name`, safe inline `svg`, optional `x`, `y`, `parent` |
| `update_selection` | Change the layers a designer selected in Penpot | `properties`: names, position, size, rotation, opacity, visibility, fills, strokes, radius, or text styles |
| `arrange_selection` | Align, distribute, or reorder selected layers | `action` such as `align_left`, `align_middle`, `bring_to_front` |
| `group_selection` / `ungroup_selection` | Organize selected layers | no arguments |
| `delete_selection` | Remove selected layers only after an explicit user request | no arguments |

## Response format

The AI must respond with JSON only:

```json
{
  "title": "Create a travel landing hero",
  "summary": "A responsive editorial hero on a warm neutral board.",
  "operations": [
    {
      "tool": "create_board",
      "label": "Add desktop hero artboard",
      "args": { "name": "Travel hero", "x": 0, "y": 0, "width": 1440, "height": 900, "fill": "#F7F0E5" }
    },
    {
      "tool": "create_text",
      "label": "Add editorial headline",
      "args": { "name": "Hero headline", "text": "Travel slowly.\nRemember deeply.", "x": 88, "y": 180, "width": 630, "fontSize": 72, "fontWeight": 600, "fill": "#1D1916", "parent": "last_board" }
    }
  ]
}
```

The canonical version of this instruction lives in `src/plugin.ts` as `TOOL_CONTRACT`. Update that string whenever the executor gains a tool. Do not advertise a tool that the executor cannot validate and apply.

## Design quality rules sent to the AI

Before creating a plan, the assistant is instructed to work as a senior product designer and frontend-minded design systems engineer. It must establish a single visual direction, use a coherent spacing/type system, build layers in paint order, keep board children inside safe padding, give every text layer an explicit contrasting color, and make text/control layers front-most. The plugin also performs a final text-contrast fallback and brings generated text to the front of sibling backgrounds during execution.

Every new shape can now declare `layer` as `frame`, `background`, `decoration`, `surface`, `content`, `control`, or `text`. The executor reorders all generated siblings into that sequence after the plan runs. If the AI omits a role, the executor safely infers one from the shape type and layer name.
