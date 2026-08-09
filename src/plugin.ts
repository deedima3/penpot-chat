/* global penpot */
// This file is the trusted bridge between the iframe UI and Penpot's plugin API.
// Keep AI responses as data: only the operation types below can reach the canvas.
declare const penpot: any;

type Operation = { tool: string; args?: Record<string, any>; label?: string };
type Plan = { title: string; summary: string; operations: Operation[] };

const UI_SIZE = { width: 456, height: 760 };
const ALLOWED_TOOLS = new Set([
  "create_page", "create_board", "create_rectangle", "create_ellipse", "create_text",
  "create_svg", "update_selection", "arrange_selection", "group_selection", "ungroup_selection", "delete_selection"
]);

const TOOL_CONTRACT = `You are Canvas Copilot, a careful Penpot design agent. Turn the user's request into a small, editable Penpot execution plan. You do not manipulate pixels or output prose.

You may ONLY use these tools:
- create_page {name}
- create_board {name,x,y,width,height,fill?,radius?}
- create_rectangle {name,x,y,width,height,fill?,radius?,stroke?,parent?}; parent may be "last_board".
- create_ellipse {name,x,y,width,height,fill?,stroke?,parent?}; parent may be "last_board".
- create_text {name,text,x,y,width?,height?,fontFamily?,fontSize?,fontWeight?,fill?,align?,parent?}; parent may be "last_board".
- create_svg {name,svg,x?,y?,parent?}; SVG must be simple, safe inline SVG only and no scripts/external URLs.
- update_selection {properties}; properties may contain name,x,y,width,height,rotation,opacity,visible,fill,stroke,radius,text,fontFamily,fontSize,fontWeight,align.
- arrange_selection {action}; action is bring_to_front, bring_forward, send_to_back, send_backward, align_left, align_center, align_right, align_top, align_middle, align_bottom, distribute_horizontal, or distribute_vertical.
- group_selection {}
- ungroup_selection {}
- delete_selection {}

Rules: use the current selection only for selection tools. For new designs, create a board before its child shapes and use parent:"last_board". Prefer 4–18 operations. Keep every object editable and name layers descriptively. Never use deletion unless expressly requested. The response must be valid JSON only in this exact shape: {"title":"short title","summary":"one sentence","operations":[{"tool":"one tool name","label":"human-readable change","args":{}}]}.`;

function summarizeShape(shape: any, depth = 0): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    id: shape.id,
    type: shape.type,
    name: shape.name,
    x: Math.round(shape.x || 0), y: Math.round(shape.y || 0),
    width: Math.round(shape.width || 0), height: Math.round(shape.height || 0)
  };
  if (shape.type === "text") summary.text = String(shape.characters || shape.text || "").slice(0, 160);
  if (depth < 2 && Array.isArray(shape.children)) summary.children = shape.children.slice(0, 24).map((child: any) => summarizeShape(child, depth + 1));
  return summary;
}

function sendContext() {
  const page = penpot.currentPage;
  const selection = penpot.selection || [];
  penpot.ui.sendMessage({
    source: "canvas-copilot", type: "context",
    context: {
      page: { id: page?.id, name: page?.name },
      selection: selection.map((shape: any) => summarizeShape(shape)),
      topLevel: (page?.root?.children || []).slice(0, 24).map((shape: any) => summarizeShape(shape)),
      viewport: penpot.viewport?.center
    }
  });
}

function cleanJson(value: string): unknown {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

function validatePlan(value: unknown): Plan {
  if (!value || typeof value !== "object") throw new Error("AI did not return a JSON object.");
  const plan = value as Plan;
  if (!Array.isArray(plan.operations) || plan.operations.length === 0) throw new Error("The proposed plan has no operations.");
  if (plan.operations.length > 30) throw new Error("The proposed plan is too large (max 30 operations).");
  for (const operation of plan.operations) {
    if (!operation || !ALLOWED_TOOLS.has(operation.tool)) throw new Error(`Unsupported AI tool: ${operation?.tool || "unknown"}`);
    if (operation.args !== undefined && (typeof operation.args !== "object" || Array.isArray(operation.args))) throw new Error(`Invalid arguments for ${operation.tool}.`);
  }
  return { title: String(plan.title || "Proposed canvas change"), summary: String(plan.summary || ""), operations: plan.operations };
}

async function askAI(message: any) {
  const { prompt, settings } = message;
  if (!settings?.endpoint || !settings?.model || !settings?.apiKey) throw new Error("Add an endpoint, model, and API key in AI connection first.");
  const context = {
    page: { name: penpot.currentPage?.name },
    selection: (penpot.selection || []).map((shape: any) => summarizeShape(shape)),
    topLevel: (penpot.currentPage?.root?.children || []).slice(0, 24).map((shape: any) => summarizeShape(shape)),
    viewportCenter: penpot.viewport?.center
  };
  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TOOL_CONTRACT },
        { role: "user", content: `Canvas context:\n${JSON.stringify(context)}\n\nDesign request:\n${String(prompt)}` }
      ]
    })
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status}): ${(await response.text()).slice(0, 240)}`);
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The AI endpoint returned no chat-completions message.");
  return validatePlan(cleanJson(content));
}

function hexFill(hex?: string) {
  return hex ? [{ fillColor: hex, fillOpacity: 1 }] : undefined;
}
function stroke(value?: string) {
  return value ? [{ strokeColor: value, strokeOpacity: 1, strokeStyle: "solid", strokeWidth: 1, strokeAlignment: "center" }] : undefined;
}
function append(shape: any, parent: any) {
  (parent || penpot.currentPage.root).appendChild(shape);
}
function setCommon(shape: any, args: Record<string, any>) {
  if (typeof args.name === "string") shape.name = args.name;
  if (Number.isFinite(args.x)) shape.x = args.x;
  if (Number.isFinite(args.y)) shape.y = args.y;
  if (Number.isFinite(args.width) || Number.isFinite(args.height)) shape.resize(Number.isFinite(args.width) ? args.width : shape.width, Number.isFinite(args.height) ? args.height : shape.height);
  if (Number.isFinite(args.rotation)) shape.rotate(args.rotation);
  if (Number.isFinite(args.opacity)) shape.opacity = Math.max(0, Math.min(1, args.opacity));
  if (typeof args.visible === "boolean") shape.visible = args.visible;
  if (Number.isFinite(args.radius)) shape.borderRadius = Math.max(0, args.radius);
  if (typeof args.fill === "string") shape.fills = hexFill(args.fill);
  if (typeof args.stroke === "string") shape.strokes = stroke(args.stroke);
}
function setText(shape: any, args: Record<string, any>) {
  if (typeof args.text === "string") {
    if ("characters" in shape) shape.characters = args.text;
    else if ("text" in shape) shape.text = args.text;
  }
  if (typeof args.fontFamily === "string") shape.fontFamily = args.fontFamily;
  if (args.fontSize !== undefined) shape.fontSize = String(args.fontSize);
  if (args.fontWeight !== undefined) shape.fontWeight = String(args.fontWeight);
  if (typeof args.align === "string") shape.align = args.align;
}

async function execute(plan: Plan) {
  const created: any[] = [];
  let lastBoard: any = null;
  const resolveParent = (args: Record<string, any>) => args.parent === "last_board" ? lastBoard : null;
  for (const operation of plan.operations) {
    const args = operation.args || {};
    let shape: any;
    switch (operation.tool) {
      case "create_page": {
        const page = penpot.createPage(); page.name = String(args.name || "New page"); await penpot.openPage(page); lastBoard = null; break;
      }
      case "create_board": {
        shape = penpot.createBoard(); append(shape, null); setCommon(shape, args); lastBoard = shape; created.push(shape); break;
      }
      case "create_rectangle": {
        shape = penpot.createRectangle(); append(shape, resolveParent(args)); setCommon(shape, args); created.push(shape); break;
      }
      case "create_ellipse": {
        shape = penpot.createEllipse(); append(shape, resolveParent(args)); setCommon(shape, args); created.push(shape); break;
      }
      case "create_text": {
        shape = penpot.createText(String(args.text || "Text")); if (!shape) throw new Error("Penpot could not create text."); append(shape, resolveParent(args)); setCommon(shape, args); setText(shape, args); created.push(shape); break;
      }
      case "create_svg": {
        const svg = String(args.svg || ""); if (!svg.includes("<svg") || /<script|javascript:|on\w+\s*=/i.test(svg)) throw new Error("Unsafe or invalid SVG was rejected.");
        shape = penpot.createShapeFromSvg(svg); if (!shape) throw new Error("Penpot could not create the SVG."); append(shape, resolveParent(args)); setCommon(shape, args); created.push(shape); break;
      }
      case "update_selection": {
        for (const selected of penpot.selection || []) { setCommon(selected, args.properties || {}); if (selected.type === "text") setText(selected, args.properties || {}); } break;
      }
      case "arrange_selection": {
        const selected = penpot.selection || []; const action = args.action;
        if (action === "align_left") penpot.alignHorizontal(selected, "left"); else if (action === "align_center") penpot.alignHorizontal(selected, "center"); else if (action === "align_right") penpot.alignHorizontal(selected, "right");
        else if (action === "align_top") penpot.alignVertical(selected, "top"); else if (action === "align_middle") penpot.alignVertical(selected, "center"); else if (action === "align_bottom") penpot.alignVertical(selected, "bottom");
        else if (action === "distribute_horizontal") penpot.distributeHorizontal(selected); else if (action === "distribute_vertical") penpot.distributeVertical(selected);
        else for (const item of selected) ({ bring_to_front: () => item.bringToFront(), bring_forward: () => item.bringForward(), send_to_back: () => item.sendToBack(), send_backward: () => item.sendBackward() } as Record<string, () => void>)[action]?.();
        break;
      }
      case "group_selection": { const group = penpot.group(penpot.selection || []); if (group) created.push(group); break; }
      case "ungroup_selection": { for (const item of penpot.selection || []) if (penpot.utils.types.isGroup(item)) penpot.ungroup(item); break; }
      case "delete_selection": { for (const item of penpot.selection || []) item.remove(); break; }
    }
  }
  if (created.length) penpot.selection = created;
  sendContext();
  return `Applied ${plan.operations.length} operation${plan.operations.length === 1 ? "" : "s"}.`;
}

penpot.ui.open("Canvas Copilot", `?theme=${penpot.theme}`, UI_SIZE);
penpot.ui.onMessage(async (message: any) => {
  try {
    if (message?.type === "get-context") sendContext();
    else if (message?.type === "request-ai") penpot.ui.sendMessage({ source: "canvas-copilot", type: "ai-result", plan: await askAI(message) });
    else if (message?.type === "apply-plan") penpot.ui.sendMessage({ source: "canvas-copilot", type: "apply-result", message: await execute(validatePlan(message.plan)) });
  } catch (error) {
    penpot.ui.sendMessage({ source: "canvas-copilot", type: "error", message: error instanceof Error ? error.message : "Unexpected plugin error." });
  }
});
penpot.on("selectionchange", sendContext);
penpot.on("themechange", (theme: string) => penpot.ui.sendMessage({ source: "canvas-copilot", type: "themechange", theme }));
