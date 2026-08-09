import "./styles.css";

type Settings = { endpoint: string; model: string; apiKey: string };
type Operation = { tool: string; label?: string; args?: Record<string, unknown> };
type Plan = { title: string; summary: string; operations: Operation[] };

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const send = (message: unknown) => parent.postMessage(message, "*");
let pendingPlan: Plan | null = null;
let isWorking = false;

const prompt = $("#prompt") as HTMLTextAreaElement;
const planBox = $("#plan");
const toast = $("#toast");
const inputs = { endpoint: $("#endpoint") as HTMLInputElement, model: $("#model") as HTMLInputElement, apiKey: $("#api-key") as HTMLInputElement };

function notify(message: string, type = "") {
  toast.textContent = message; toast.className = `toast is-visible ${type}`;
  window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
}
function settings(): Settings { return { endpoint: inputs.endpoint.value.trim(), model: inputs.model.value.trim(), apiKey: inputs.apiKey.value.trim() }; }
function isLmStudio(connection: Settings = settings()) { return /^https?:\/\/(localhost|127\.0\.0\.1):1234\/v1\//.test(connection.endpoint); }
function isConfigured(connection: Settings = settings()) { return Boolean(connection.endpoint && connection.model && (connection.apiKey || isLmStudio(connection))); }
function updateConnectionLabel() { const connection = settings(); $("#connection-label").textContent = isConfigured(connection) ? `${isLmStudio(connection) ? "Local ·" : "Ready ·"} ${connection.model}` : "AI not configured"; }
function setWorking(working: boolean, label = "Run to goal") {
  isWorking = working; const button = $("#generate") as HTMLButtonElement; button.disabled = working; button.querySelector("span")!.textContent = label;
  $("#agent-run").toggleAttribute("hidden", !working); ($("#stop-agent") as HTMLButtonElement).disabled = !working;
}
function saveSettings() {
  localStorage.setItem("canvas-copilot-settings", JSON.stringify(settings()));
  updateConnectionLabel();
  notify("AI connection saved locally.");
}
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("canvas-copilot-settings") || "{}") as Partial<Settings>;
    inputs.endpoint.value = saved.endpoint || inputs.endpoint.value; inputs.model.value = saved.model || inputs.model.value; inputs.apiKey.value = saved.apiKey || "";
  } catch { /* ignore corrupt local preferences */ }
  updateConnectionLabel();
}
function renderPlan(plan: Plan) {
  pendingPlan = plan; $("#plan-title").textContent = plan.title; $("#plan-summary").textContent = plan.summary;
  $("#plan-count").textContent = `${plan.operations.length} steps`;
  const list = $("#operations"); list.replaceChildren(...plan.operations.map((operation, index) => {
    const item = document.createElement("li"); item.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><div><strong>${operation.label || operation.tool.replaceAll("_", " ")}</strong><small>${operation.tool}</small></div>`; return item;
  }));
  planBox.classList.remove("is-hidden"); planBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function generate() {
  if (isWorking) return;
  if (!prompt.value.trim()) return notify("Describe a design or select layers to refine.", "is-error");
  const connection = settings(); if (!isConfigured(connection)) return notify("Set up an AI connection, or use LM Studio local mode.", "is-error");
  setWorking(true, "Agent is starting…"); $("#agent-status").textContent = "Agent is reading the canvas"; $("#agent-detail").textContent = "It will keep iterating until the goal is met, or it reaches its safety limit.";
  send({ type: "run-agent", prompt: prompt.value.trim(), settings: connection });
}

$("#generate").addEventListener("click", generate);
prompt.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") generate(); });
$("#save-settings").addEventListener("click", saveSettings);
$("#stop-agent").addEventListener("click", () => { send({ type: "stop-agent" }); $("#agent-status").textContent = "Stopping after this step…"; });
$("#lmstudio-connect").addEventListener("click", () => {
  inputs.endpoint.value = "http://localhost:1234/v1/chat/completions";
  inputs.apiKey.value = "";
  inputs.model.value = "";
  updateConnectionLabel();
  notify("Looking for models in LM Studio…");
  send({ type: "list-lmstudio-models", endpoint: "http://localhost:1234/v1/models" });
});
$("#refresh-context").addEventListener("click", () => send({ type: "get-context" }));
$("#discard").addEventListener("click", () => { pendingPlan = null; planBox.classList.add("is-hidden"); });
$("#apply").addEventListener("click", () => { if (!pendingPlan) return; ($("#apply") as HTMLButtonElement).disabled = true; send({ type: "apply-plan", plan: pendingPlan }); });
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-prompt]")) button.addEventListener("click", () => { prompt.value = button.dataset.prompt || ""; prompt.focus(); });
for (const [buttonId, bodyId] of [["#guide-toggle", "#guide-body"], ["#settings-toggle", "#settings-body"]] as const) $(buttonId).addEventListener("click", () => { const body = $(bodyId); const hidden = body.hasAttribute("hidden"); body.toggleAttribute("hidden", !hidden); $(buttonId).setAttribute("aria-expanded", String(hidden)); });

window.addEventListener("message", (event) => {
  const message = event.data; if (!message || message.source !== "canvas-copilot") return;
  if (message.type === "context") {
    const selected = message.context.selection || []; $("#selection-title").textContent = selected.length ? `${selected.length} layer${selected.length === 1 ? "" : "s"} selected` : `Page: ${message.context.page?.name || "Untitled"}`;
    $("#selection-detail").textContent = selected.length ? selected.map((layer: any) => `${layer.name || layer.type} · ${layer.width}×${layer.height}`).join("  /  ") : `${(message.context.topLevel || []).length} top-level layers available to the assistant`;
  } else if (message.type === "ai-result") { setWorking(false); renderPlan(message.plan); }
  else if (message.type === "agent-progress") {
    $("#agent-status").textContent = `Pass ${message.iteration} · ${message.phase}`;
    $("#agent-detail").textContent = message.detail || "Working on the current canvas state…";
    setWorking(true, "Agent is working…");
  }
  else if (message.type === "agent-complete") { setWorking(false); notify(message.message || "Goal complete."); }
  else if (message.type === "agent-stopped") { setWorking(false); notify("Agent stopped. Changes already applied were kept."); }
  else if (message.type === "lmstudio-models") {
    const models = Array.isArray(message.models) ? message.models : [];
    if (!models.length) return notify("LM Studio is running, but no models are loaded.", "is-error");
    inputs.model.value = String(models[0]); saveSettings(); notify(`LM Studio connected · ${models[0]}`);
  }
  else if (message.type === "apply-result") { ($("#apply") as HTMLButtonElement).disabled = false; notify(message.message); pendingPlan = null; planBox.classList.add("is-hidden"); }
  else if (message.type === "error") { setWorking(false); ($("#apply") as HTMLButtonElement).disabled = false; notify(message.message, "is-error"); }
  else if (message.type === "themechange") document.body.dataset.theme = message.theme;
});

const theme = new URLSearchParams(window.location.search).get("theme"); if (theme) document.body.dataset.theme = theme;
readSettings(); send({ type: "get-context" });
