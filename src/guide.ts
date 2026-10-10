/**
 * Agent-facing documentation: hand-written guide sections (guide/GUIDE.md) plus
 * per-type references generated from the schema and the catalog, so the docs
 * can never disagree with what the validator accepts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CATALOG } from "./catalog.js";
import { THEME_META } from "./render.js";
import { ACCENTS, BACKGROUNDS, deckJsonSchema, SLIDE_TYPES, SlideSchema, THEMES, TRANSITIONS, type SlideType } from "./schema.js";
import { PKG_ROOT } from "./util.js";

export const TOPICS = ["overview", "workflow", "types", "themes", "markup", "media", "diagram", "course", "pedagogy", "memory", "qa", "schema"] as const;
export type Topic = (typeof TOPICS)[number];

let sections: Map<string, string> | undefined;

async function loadSections(): Promise<Map<string, string>> {
  if (sections) return sections;
  sections = new Map();
  let md = "";
  try {
    md = await readFile(join(PKG_ROOT, "guide", "GUIDE.md"), "utf8");
  } catch {
    md = "## overview\nAurora Slides builds animated HTML decks from JSON. Call aurora_guide with topic \"types\" to see the slide types.";
  }
  let key = "overview";
  let buf: string[] = [];
  const flush = () => {
    if (buf.join("").trim()) sections!.set(key, buf.join("\n").trim());
    buf = [];
  };
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^##\s+([a-z]+)/i.exec(line);
    if (m) {
      flush();
      key = m[1]!.toLowerCase();
      buf.push(line);
    } else if (!/^#\s/.test(line)) buf.push(line);
  }
  flush();
  return sections;
}

type JsonNode = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonNode[];
  oneOf?: JsonNode[];
  items?: JsonNode;
  properties?: Record<string, JsonNode>;
  required?: string[];
  description?: string;
  default?: unknown;
  minItems?: number;
  maxItems?: number;
};

function typeOf(n: JsonNode | undefined, depth = 0): string {
  if (!n) return "any";
  if (n.const !== undefined) return JSON.stringify(n.const);
  if (n.enum) return n.enum.map((e) => JSON.stringify(e)).join(" | ");
  const alts = n.anyOf ?? n.oneOf;
  if (alts) return alts.map((a) => typeOf(a, depth)).filter((v, i, arr) => arr.indexOf(v) === i).join(" | ");
  if (n.type === "array") {
    const range = n.minItems !== undefined || n.maxItems !== undefined ? ` (${n.minItems ?? 0}–${n.maxItems ?? "∞"})` : "";
    const inner = typeOf(n.items, depth + 1);
    return `${inner.includes(" ") ? `(${inner})` : inner}[]${range}`;
  }
  if (n.type === "object" && n.properties) {
    if (depth > 1) return "object";
    const req = new Set(n.required ?? []);
    return `{ ${Object.keys(n.properties).map((k) => (req.has(k) ? k : `${k}?`)).join(", ")} }`;
  }
  return Array.isArray(n.type) ? n.type.join(" | ") : (n.type ?? "any");
}

const COMMON = ["id", "theme", "accent", "background", "transition", "notes", "morph"];

function variantOf(type: SlideType): JsonNode | undefined {
  const schema = z.toJSONSchema(SlideSchema, { io: "input", unrepresentable: "any" }) as JsonNode;
  const all = schema.oneOf ?? schema.anyOf ?? [];
  return all.find((v) => v.properties?.type?.const === type);
}

export function typeReference(type: SlideType): string {
  const v = variantOf(type);
  const entry = CATALOG[type];
  const lines = [`## ${type}`, entry.use, "", "Fields (? = optional):"];
  if (v?.properties) {
    const req = new Set(v.required ?? []);
    for (const [k, node] of Object.entries(v.properties)) {
      if (k === "type" || COMMON.includes(k)) continue;
      const desc = node.description ? ` — ${node.description}` : "";
      lines.push(`- ${k}${req.has(k) ? "" : "?"}: ${typeOf(node)}${desc}`);
    }
  }
  lines.push(`- common to every slide: ${COMMON.map((k) => `${k}?`).join(", ")} (see topic "themes" and "pedagogy")`);
  lines.push("", "Example:", "```json", JSON.stringify(entry.example, null, 2), "```");
  return lines.join("\n");
}

function typesTable(): string {
  const lines = ["## types", `${SLIDE_TYPES.length} slide types. Call aurora_guide {"type": "<name>"} for fields and a full example.`, ""];
  for (const t of SLIDE_TYPES as SlideType[]) lines.push(`- **${t}**: ${CATALOG[t].use}`);
  return lines.join("\n");
}

function themesTable(extra: string | undefined): string {
  const lines = ["## themes", ...THEMES.map((t) => `- **${t}** (${THEME_META[t].tone}): ${THEME_META[t].label}`)];
  lines.push("", `Accents: ${ACCENTS.join(", ")} or "#RRGGBB". Backgrounds: ${BACKGROUNDS.join(", ")} or {kind, image, dim, blur, colors}. Transitions: ${TRANSITIONS.join(", ")}.`);
  if (extra) lines.push("", extra.replace(/^##\s+themes\s*\n?/i, ""));
  return lines.join("\n");
}

export async function guideText(topic?: string, type?: string): Promise<string> {
  if (type) {
    if (!(SLIDE_TYPES as string[]).includes(type)) return `Unknown slide type "${type}". Types: ${SLIDE_TYPES.join(", ")}`;
    return typeReference(type as SlideType);
  }
  const s = await loadSections();
  switch (topic) {
    case undefined:
    case "overview":
      return [s.get("overview") ?? "", "", typesTable(), "", `Other topics: ${TOPICS.filter((t) => t !== "overview").join(", ")}.`].join("\n");
    case "types":
      return typesTable();
    case "themes":
      return themesTable(s.get("themes"));
    case "schema":
      return "Full JSON Schema of a deck (input form):\n```json\n" + JSON.stringify(deckJsonSchema(), null, 1) + "\n```";
    default:
      return s.get(topic) ?? `No guide section "${topic}". Topics: ${TOPICS.join(", ")}`;
  }
}
