/**
 * Aurora Slides: MCP server (stdio) and CLI.
 *
 *   node dist/aurora.mjs                 → MCP server on stdio (for Claude Code, Antigravity, Cursor…)
 *   node dist/aurora.mjs build <dir>     → CLI (see `help`)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { auditDeck, browserError, closeBrowser, pdfDeck, screenshotDeck, screenshotPage, type SlideAudit } from "./browser.js";
import { showcaseDeck } from "./catalog.js";
import { guideText, TOPICS } from "./guide.js";
import { ICON_STYLES, searchIcons, searchImages, type ImageProvider } from "./media.js";
import { existingPreview, previewUrl, stopPreview } from "./preview.js";
import { deckJsonSchema, SLIDE_TYPES, THEMES, validateDeck } from "./schema.js";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { generateCached, importImage, placeInDeck } from "./imagegen.js";
import {
  applyOps, buildCourse, buildDeck, coerceDeck, coursePaths, deckPaths, isCourseDir, readDeckFile, summarize, summarizeCourse, type EditOp,
} from "./store.js";
import { appDir, errMsg, VERSION } from "./util.js";
import { lintDeck } from "./lint.js";
import { selfTest } from "./selftest.js";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean };

const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) });

async function safe(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    return text(errMsg(e), true);
  }
}

function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", '""', url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args as string[], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

function formatAudit(slides: SlideAudit[], logs: string[], lint: string[]): string {
  const lines: string[] = [];
  let errors = 0;
  let warns = 0;
  for (const s of slides) {
    for (const i of s.issues) {
      if (i.level === "error") errors++;
      else if (i.level === "warn") warns++;
    }
  }
  lines.push(`Layout audit: ${slides.length} slides, ${errors} error(s), ${warns} warning(s).`);
  for (const s of slides) {
    const shown = s.issues.filter((i) => i.level !== "info");
    if (!shown.length) continue;
    lines.push(`- slide ${s.slide} (${s.type})${s.title ? ` "${s.title.slice(0, 50)}"` : ""}:`);
    shown.forEach((i) => lines.push(`    ${i.level === "error" ? "ERROR" : "warn "} ${i.msg}`));
  }
  if (!errors && !warns) lines.push("No layout problems found.");
  if (logs.length) {
    lines.push("", "Browser console:");
    [...new Set(logs)].slice(0, 15).forEach((l) => lines.push(`  - ${l}`));
  }
  if (lint.length) {
    lines.push("", "Content notes:");
    lint.slice(0, 20).forEach((l) => lines.push(`  - ${l}`));
  }
  return lines.join("\n");
}

/* ───────────────────────── MCP server ───────────────────────── */

// Shared by the server instructions and the lesson/course prompts so every entry point gives the same rules.
const LANGUAGE_RULE =
  "Language: write every learner-facing string (titles, body text, notes, quiz options and explanations, exercise steps, hooks, " +
  "notebook lines, alt text) in the user's language, i.e. the language the user wrote the request in, unless they ask for another one. " +
  'Set the deck "lang" to its BCP-47 code (vi, en, ja…). Keep JSON keys, ids, icon ids, Mermaid keywords and image prompts in English. ' +
  "Write natively, as a good teacher speaks that language, not as a translation. Reply to the user in their language as well.";
const ACCURACY_RULE =
  "Accuracy: the user's materials are the source of truth. Quote code with `file` + `lines` (never retype it), tag slides with `source` " +
  '("Mở rộng" for extensions), say what is simulated, never invent numbers or overclaim, and make quiz distractors real misconceptions ' +
  '(aurora_guide topic "accuracy").';
const PICTURE_RULE =
  "Pictures: make them with YOUR OWN image tool when you have one (e.g. Antigravity) and import the file with aurora_add_image; Aurora never " +
  'spends the user\'s API keys. Or write "image": {"generate": "<English prompt>"} in a slide: the build lists it under "Pictures for you to make", ' +
  'and you fill each one with aurora_add_image {"dir", "path", "for": "<id>"}. Use one style suffix for the whole lesson and never ask for text ' +
  "inside a picture. Real photos: {\"query\"} or aurora_search_images. Simple drawings: inline SVG. aurora_generate_image is only a fallback " +
  "for agents that cannot make images.";
const DONE_RULE =
  'Done when: the build reports no errors and no "Pictures for you to make", aurora_audit reports no ERROR, and you have looked at the ' +
  "aurora_screenshot contact sheet. Then tell the user, in their language, where the HTML is (or the aurora_preview link) and how to study with it.";

const INSTRUCTIONS = `Aurora Slides builds Apple-keynote-style, animated, interactive HTML lessons for self-study from deck JSON.

Workflow
1. Call aurora_guide once (overview), then the topics you need: "pedagogy", "memory", "accuracy", "media", "course", "diagram".
2. Big subject: aurora_create_course first (small lessons, each with its own theme), then one aurora_create_deck per lesson folder.
3. Collect visuals in few calls: aurora_search_icons for icons; pictures as described below.
4. Build with aurora_create_deck. Fix every validation error it lists and call again; fill the pictures it lists.
5. Check with aurora_screenshot and aurora_audit; refine with aurora_edit_deck (small ops, never resend the whole deck).

Rules
- ${LANGUAGE_RULE}
- ${ACCURACY_RULE}
- Teach for memory: theory → memory anchors (palace walk, anchors, analogy, mnemonic) → notebook page → practice (exercises easy → hard) → recall walk → summary.
- One idea per slide, short lines, varied layouts; the full explanation goes in "notes".
- Processes, structures and overviews (flowcharts, mind maps, sequence, state, timelines…): a "diagram" slide with Mermaid code.
- ${PICTURE_RULE}

${DONE_RULE}`;

async function startMcp(): Promise<void> {
  const server = new McpServer({ name: "aurora-slides", version: VERSION }, { instructions: INSTRUCTIONS });
  const dirArg = z.string().describe("Deck folder (or path to its .json). Same value you passed to aurora_create_deck.");
  const ref = z.union([z.number().int(), z.string()]);

  server.registerTool(
    "aurora_guide",
    {
      title: "Aurora Slides guide",
      description:
        "READ FIRST. How to write beautiful learning decks: workflow, every slide type with JSON examples, memory anchors (memory palace, picture anchors, analogy, mnemonic), themes, inline markup (**bold**, ++gradient++, ==marker==, $math$, [[cloze]]), icons/images, pedagogy and QA. No arguments = overview + type list; pass `type` for one layout's fields and example.",
      inputSchema: {
        topic: z.enum(TOPICS).optional().describe(TOPICS.join(" | ")),
        type: z.enum(SLIDE_TYPES as [string, ...string[]]).optional().describe("Slide type to document"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ topic, type }) => safe(async () => text(await guideText(topic, type))),
  );

  server.registerTool(
    "aurora_create_deck",
    {
      title: "Create or overwrite a deck",
      description:
        "Validate a deck and build it into one self-contained animated HTML presentation (writes deck.json + index.html into `dir`, overwriting them). Returns the outline, content notes and paths, or precise errors to fix. Images can be {query: \"…\"} (found automatically) or {generate: \"prompt\"} (listed as a picture request for you to make with your own image tool) and icons are Iconify ids like \"ph:leaf-duotone\". dryRun only validates.",
      inputSchema: {
        deck: z.union([z.record(z.string(), z.unknown()), z.string()]).describe('Deck JSON: {"title", "theme"?, "lang"?, "slides": [{"type": …}]}. See aurora_guide.'),
        dir: z.string().optional().describe("Output folder (default ./slides/<slug-of-title>)"),
        embed: z.boolean().optional().describe("Inline local images as data URIs so the HTML is fully portable"),
        dryRun: z.boolean().optional().describe("Validate and lint only; write nothing"),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ deck, dir, embed, dryRun }) =>
      safe(async () => {
        const c = coerceDeck(deck);
        if (c.error) return text(c.error, true);
        if (dryRun) {
          const v = validateDeck(c.value);
          if (!v.ok) return text(`Invalid deck:\n${v.errors.map((e) => `  - ${e}`).join("\n")}`, true);
          const lint = lintDeck(v.deck!);
          return text(`Valid deck with ${v.deck!.slides.length} slides.${lint.length ? `\nContent notes:\n${lint.map((l) => `  - ${l}`).join("\n")}` : ""}`);
        }
        const title = typeof c.value === "object" && c.value ? String((c.value as { title?: unknown }).title ?? "deck") : "deck";
        const p = deckPaths(dir, title);
        const b = await buildDeck(c.value, p, { embed });
        const live = b.ok ? existingPreview(p.dir) : undefined;
        return text(summarize(b, live ? [`Preview: ${live} (live reload)`] : []), !b.ok);
      }),
  );

  server.registerTool(
    "aurora_edit_deck",
    {
      title: "Edit slides of a deck",
      description:
        "Apply edits to a saved deck and rebuild it. Slides are referenced by 1-based number or by id. Ops run in order: {op:\"replace\", at, slide} | {op:\"insert\", at?, slides:[…]} (before `at`, or append) | {op:\"delete\", at} | {op:\"move\", from, to} | {op:\"update\", at, set:{field: value|null}} (null removes a field) | {op:\"deck\", set:{theme, accent, title, …}}.",
      inputSchema: {
        dir: dirArg,
        ops: z
          .array(
            z.object({
              op: z.enum(["replace", "insert", "delete", "move", "update", "deck"]),
              at: ref.optional(),
              from: ref.optional(),
              to: z.number().int().optional(),
              slide: z.record(z.string(), z.unknown()).optional(),
              slides: z.array(z.record(z.string(), z.unknown())).optional(),
              set: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .min(1),
      },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ dir, ops }) =>
      safe(async () => {
        const p = deckPaths(dir);
        const raw = await readDeckFile(p);
        const missing = ops
          .map((o, k) => {
            const need: Record<string, string[]> = { replace: ["at", "slide"], insert: ["slides"], delete: ["at"], move: ["from", "to"], update: ["at", "set"], deck: ["set"] };
            const lack = (need[o.op] ?? []).filter((f) => (o as Record<string, unknown>)[f] === undefined);
            return lack.length ? `ops[${k}] (${o.op}) is missing ${lack.join(", ")}` : "";
          })
          .filter(Boolean);
        if (missing.length) return text(missing.join("\n"), true);
        const { deck, errors } = applyOps(raw, ops as EditOp[]);
        if (errors.length) return text(`No changes saved:\n${errors.map((e) => `  - ${e}`).join("\n")}`, true);
        const b = await buildDeck(deck, p);
        const live = b.ok ? existingPreview(p.dir) : undefined;
        return text((b.ok ? `Applied ${ops.length} edit(s).\n` : "Edits produce an invalid deck; nothing was saved.\n") + summarize(b, live ? [`Preview: ${live} (live reload)`] : []), !b.ok);
      }),
  );

  server.registerTool(
    "aurora_get_deck",
    {
      title: "Read a deck",
      description: "Return the saved deck JSON (or one slide's JSON with `slide`) plus its outline. Use before editing a deck you did not just create.",
      inputSchema: { dir: dirArg, slide: ref.optional().describe("1-based number or id of one slide") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ dir, slide }) =>
      safe(async () => {
        const p = deckPaths(dir);
        const raw = (await readDeckFile(p)) as { slides?: Array<Record<string, unknown>> };
        if (slide !== undefined) {
          const list = raw.slides ?? [];
          const i = typeof slide === "number" || /^\d+$/.test(String(slide)) ? Number(slide) - 1 : list.findIndex((s) => s.id === slide);
          if (i < 0 || i >= list.length) return text(`No slide ${slide} (deck has ${list.length}).`, true);
          return text(`Slide ${i + 1} of ${list.length}:\n${JSON.stringify(list[i], null, 2)}`);
        }
        return text(`${p.json}\n${JSON.stringify(raw, null, 2)}`);
      }),
  );

  server.registerTool(
    "aurora_create_course",
    {
      title: "Create a course of small lessons",
      description:
        "Split a big subject into small lessons (each its own deck with its own theme) and build an Apple-style course home page with the learner's progress. " +
        "Writes course.json + index.html in `dir` and returns one folder per lesson: then build each lesson with aurora_create_deck using that folder as `dir` " +
        "(lessons get the course theme plan, a breadcrumb, shared progress and a next-lesson button). Call again to rename, reorder or add lessons.",
      inputSchema: {
        course: z
          .union([z.record(z.string(), z.unknown()), z.string()])
          .describe('{"title", "subtitle"?, "theme"? (home page), "lessons": [{"title", "summary"?, "theme"?, "icon"?, "minutes"?, "dir"?}]}'),
        dir: z.string().optional().describe("Course folder (default ./slides/<slug-of-title>)"),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ course, dir }) =>
      safe(async () => {
        const c = coerceDeck(course);
        if (c.error) return text(c.error.replace("deck", "course"), true);
        const title = typeof c.value === "object" && c.value ? String((c.value as { title?: unknown }).title ?? "course") : "course";
        const ref = coursePaths(dir, title);
        const o = await buildCourse(c.value, ref, { rebuildLessons: true });
        const live = o.ok ? existingPreview(ref.dir) : undefined;
        return text(summarizeCourse(o) + (live ? `\nPreview: ${live}` : ""), !o.ok);
      }),
  );

  server.registerTool(
    "aurora_generate_image",
    {
      title: "Generate an image with AI (fallback)",
      description:
        "Fallback for agents WITHOUT their own image tool. If you can make images yourself (Antigravity can), do that and import the file with aurora_add_image instead. " +
        "Makes an illustration with free, keyless Pollinations (lower quality); OpenAI/Gemini are used only when the user opts in with AURORA_IMAGE_PROVIDER. " +
        "Returns the image so you can look at it. With `dir` it goes into that deck's images/ folder; with the same prompt, orientation and transparent as a slide's `generate`, it fills that slide on the next aurora_build. Cached by prompt.",
      inputSchema: {
        prompt: z.string().min(3).describe("Describe subject, style, lighting and background. Avoid asking for text inside the image."),
        orientation: z.enum(["landscape", "portrait", "square"]).optional(),
        transparent: z.boolean().optional().describe("Transparent background (cut-out objects, explode parts); OpenAI only"),
        provider: z.enum(["auto", "openai", "gemini", "pollinations"]).optional().describe("openai/gemini only work when the user set AURORA_IMAGE_PROVIDER to allow them"),
        dir: z.string().optional().describe("Deck folder to place the image in"),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ prompt, orientation, transparent, provider, dir }) =>
      safe(async () => {
        const r = await generateCached({ prompt, orientation, transparent, provider });
        const src = dir ? await placeInDeck(r.file, deckPaths(dir).dir, `gen-${r.key}`) : undefined;
        const data = await readFile(r.file);
        const ext = extname(r.file).slice(1).replace("jpg", "jpeg");
        const how = r.cached ? "from cache" : `made with ${r.provider} (${r.model})`;
        const lines = [
          `Image ${how}: ${r.file}`,
          src ? `Use in the deck: "image": {"src": "${src}", "alt": "…"}` : `Use with "image": {"generate": ${JSON.stringify(prompt)}} or pass dir to copy it into a deck.`,
        ];
        const content: Content[] = [{ type: "text", text: lines.join("\n") }];
        if (data.length < 4_500_000) content.push({ type: "image", data: data.toString("base64"), mimeType: `image/${ext}` });
        return { content };
      }),
  );

  server.registerTool(
    "aurora_add_image",
    {
      title: "Add your own image to a deck",
      description:
        "The preferred way to get pictures: make them with your own image-generation tool, then copy the file (or a URL, or base64) into the deck's images/ folder with this tool. " +
        "Returns the `src` to use in slides and shows the image back so you can check it. " +
        "With `for` (an id from a build's \"Pictures for you to make\" list) it fills that slide's `generate` picture and rebuilds the deck.",
      inputSchema: {
        dir: dirArg,
        path: z.string().optional().describe("Local file path (absolute or relative to the working directory)"),
        url: z.string().url().optional(),
        base64: z.string().optional().describe("Base64 data (a data: URL is fine)"),
        name: z.string().optional().describe("Short file name, e.g. 'qubit-bloch'"),
        for: z.string().optional().describe("Picture request id from the build output (e.g. \"3f2a9c41b0d7e865\"); replaces any earlier picture for it"),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ dir, path, url, base64, name, for: slot }) =>
      safe(async () => {
        const p = deckPaths(dir);
        const r = await importImage({ path, url, base64, name, slot }, p.dir);
        const ext = extname(r.file).slice(1).replace("jpg", "jpeg").replace("svg", "svg+xml");
        const lines = [`Saved ${r.file} (${(r.bytes / 1024).toFixed(0)} KB).`];
        if (r.id) {
          const b = existsSync(p.json) ? await buildDeck(await readDeckFile(p), p, { saveJson: false }) : undefined;
          if (!b?.ok) lines.push("Run aurora_build on the deck to use it.");
          else {
            const left = b.result!.imageRequests;
            lines.push(
              b.result!.genIds.includes(r.id)
                ? `Filled picture request ${r.id}; the deck was rebuilt.`
                : `No slide asks for picture "${r.id}" (check the id in the build output); the file is saved but unused.`,
              left.length
                ? `Still waiting (${left.length}): ${left.map((q) => `${q.id} (slide ${q.slides.join(", ")})`).join(", ")}.`
                : "All requested pictures are in. Next: aurora_screenshot to look at them.",
            );
          }
        } else lines.push(`Use in the deck: "image": {"src": "${r.src}", "alt": "…"}`);
        const content: Content[] = [{ type: "text", text: lines.join("\n") }];
        if (r.bytes < 4_500_000 && ext !== "svg+xml") content.push({ type: "image", data: (await readFile(r.file)).toString("base64"), mimeType: `image/${ext}` });
        return { content };
      }),
  );

  server.registerTool(
    "aurora_build",
    {
      title: "Rebuild a deck or course",
      description:
        "Rebuild index.html from deck.json on disk (after editing the file directly, or to retry icons/images). Given a course folder, rebuilds every lesson and the course page.",
      inputSchema: { dir: dirArg, embed: z.boolean().optional() },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ dir, embed }) =>
      safe(async () => {
        if (isCourseDir(dir)) {
          const ref = coursePaths(dir);
          const raw = JSON.parse((await readFile(ref.json, "utf8")).replace(/^﻿/, ""));
          return text(summarizeCourse(await buildCourse(raw, ref, { rebuildLessons: true, saveJson: false })));
        }
        const p = deckPaths(dir);
        const raw = await readDeckFile(p);
        const b = await buildDeck(raw, p, { embed, saveJson: false });
        const live = b.ok ? existingPreview(p.dir) : undefined;
        return text(summarize(b, live ? [`Preview: ${live} (live reload)`] : []), !b.ok);
      }),
  );

  server.registerTool(
    "aurora_search_icons",
    {
      title: "Search icons",
      description:
        "Find Iconify icon ids for slides. Pass several `queries` at once (English words work best). style: duotone (ph/solar, best for slides), line, color (fluent-emoji, 3D-ish), logos (brands/tech), all.",
      inputSchema: {
        queries: z.array(z.string().min(1)).min(1).max(20).describe('e.g. ["leaf", "sun", "water drop"]'),
        style: z.enum(Object.keys(ICON_STYLES) as [string, ...string[]]).optional(),
        limit: z.number().int().min(1).max(32).optional().describe("Results per query (default 8)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ queries, style, limit }) =>
      safe(async () => {
        const rows = await Promise.all(
          queries.map(async (q) => {
            try {
              const wanted = (style ?? "all") as keyof typeof ICON_STYLES;
              let r = await searchIcons(q, wanted, limit ?? 8);
              let note = "";
              if (!r.length && wanted !== "all") {
                r = await searchIcons(q, "all", limit ?? 8);
                if (r.length) note = ` (no ${wanted} match; from all sets)`;
              }
              if (!r.length) {
                const wide = await searchIcons(q, "any" as keyof typeof ICON_STYLES, limit ?? 8).catch(() => []);
                if (wide.length) {
                  r = wide;
                  note = " (from less common sets)";
                }
              }
              return `${q}: ${r.length ? r.map((x) => x.id).join(", ") + note : "(nothing; try a synonym or a broader English word)"}`;
            } catch (e) {
              return `${q}: error ${errMsg(e)}`;
            }
          }),
        );
        return text(rows.join("\n") + "\n\nUse ids as-is in icon fields. -duotone / -bold-duotone sets read best on large slides; fluent-emoji:* adds friendly color.");
      }),
  );

  server.registerTool(
    "aurora_search_images",
    {
      title: "Search images",
      description:
        "Search free photos/illustrations (Unsplash/Pexels when API keys are set, otherwise Openverse and Wikimedia Commons). Returns URLs with credits to paste into image fields. Tip: slides can also use {\"query\": \"…\"} and Aurora picks the top result.",
      inputSchema: {
        query: z.string().min(2).describe("English keywords work best, e.g. 'chloroplast microscope'"),
        orientation: z.enum(["landscape", "portrait", "square", "any"]).optional(),
        kind: z.enum(["photo", "illustration", "diagram", "any"]).optional(),
        count: z.number().int().min(1).max(15).optional(),
        provider: z.enum(["auto", "unsplash", "pexels", "openverse", "wikimedia"]).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ query, orientation, kind, count, provider }) =>
      safe(async () => {
        const r = await searchImages({ query, orientation, kind, count: count ?? 6, provider: (provider ?? "auto") as ImageProvider | "auto" });
        if (!r.results.length) return text(`No images for "${query}" (${r.providers.join(", ")}). ${r.errors.join("; ")} Try simpler English keywords.`, true);
        const lines = r.results.map((x, i) => {
          const snippet = JSON.stringify({ src: x.url, alt: x.title?.slice(0, 80) ?? query, credit: x.credit });
          return `${i + 1}. ${x.title ?? "(untitled)"}${x.width ? ` (${x.width}×${x.height})` : ""}\n   ${snippet}${x.page ? `\n   page: ${x.page}` : ""}`;
        });
        return text(`${r.results.length} result(s) from ${r.providers.join(", ")}:\n${lines.join("\n")}${r.errors.length ? `\n(${r.errors.join("; ")})` : ""}`);
      }),
  );

  server.registerTool(
    "aurora_preview",
    {
      title: "Live preview",
      description: "Serve a deck on http://127.0.0.1 with live reload (every create/edit/build refreshes the open page and keeps the current slide). open:true also opens the system browser.",
      inputSchema: { dir: dirArg, open: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ dir, open }) =>
      safe(async () => {
        if (isCourseDir(dir)) {
          const ref = coursePaths(dir);
          const url = await previewUrl(ref.dir, "index.html");
          if (open) openInBrowser(url);
          return text(`Course preview: ${url}\nLessons open from the course page; every rebuild reloads open pages.`);
        }
        const p = deckPaths(dir);
        await readDeckFile(p);
        const url = await previewUrl(p.dir, p.html.split(/[\\/]/).pop());
        if (open) openInBrowser(url);
        return text(`Preview: ${url}\nKeys: → / Space next, ← back, O overview, N notes, F fullscreen, ? shortcuts.`);
      }),
  );

  server.registerTool(
    "aurora_screenshot",
    {
      title: "Look at slides",
      description:
        "Render slides in headless Chrome/Edge and return images so you can check the design. Without `slides`: one contact sheet of the whole deck. With `slides` (≤ 6): full-size shots of those slides in their final built state.",
      inputSchema: {
        dir: dirArg,
        slides: z.array(z.number().int().min(1)).max(40).optional().describe("1-based slide numbers"),
        sheet: z.boolean().optional().describe("Force a contact sheet (thumbnails grid)"),
        width: z.number().int().min(640).max(1920).optional().describe("Image width (default 1280; sheet 1500)"),
        state: z.enum(["final", "start"]).optional().describe("final = all builds shown (default); start = before the first build"),
        step: z.number().int().min(0).optional().describe("Capture at this build step instead (e.g. each stage of an explode slide or each camera zoom)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ dir, slides, sheet, width, state, step }) =>
      safe(async () => {
        if (isCourseDir(dir)) {
          try {
            const r = await screenshotPage(coursePaths(dir).html, width ?? 1440);
            return { content: [{ type: "text", text: "Course home page (full page)." }, { type: "image", data: r.shot.data.toString("base64"), mimeType: r.shot.mime }] };
          } catch (e) {
            return text(browserError(e), true);
          }
        }
        const p = deckPaths(dir);
        const useSheet = (sheet ?? !slides?.length) && step === undefined;
        if (!useSheet && slides && slides.length > 6) return text("Ask for at most 6 individual slides per call (or use sheet:true).", true);
        if (!useSheet && !slides?.length) return text("Pass `slides` together with `step`.", true);
        try {
          const r = await screenshotDeck(p.html, { slides, sheet: useSheet, width, state, step });
          const content: Content[] = [
            { type: "text", text: useSheet ? `Contact sheet of ${r.total} slides (read left→right, top→bottom).` : `Slides ${r.shots.map((s) => s.slide).join(", ")} of ${r.total}.` },
          ];
          for (const s of r.shots) content.push({ type: "image", data: s.data.toString("base64"), mimeType: s.mime });
          if (r.logs.length) content.push({ type: "text", text: `Browser console:\n${[...new Set(r.logs)].slice(0, 10).join("\n")}` });
          return { content };
        } catch (e) {
          return text(browserError(e), true);
        }
      }),
  );

  server.registerTool(
    "aurora_audit",
    {
      title: "Audit layout",
      description:
        "Load the deck in headless Chrome/Edge at 1920×1080 and report overflowing or clipped text, elements outside the slide, overlapping cycle labels, broken images, tiny text, dense slides and console errors, plus content notes.",
      inputSchema: { dir: dirArg },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ dir }) =>
      safe(async () => {
        const p = deckPaths(dir);
        const raw = await readDeckFile(p);
        const v = validateDeck(raw);
        try {
          const r = await auditDeck(p.html);
          return text(formatAudit(r.slides, r.logs, v.ok ? lintDeck(v.deck!) : v.errors));
        } catch (e) {
          return text(browserError(e), true);
        }
      }),
  );

  server.registerTool(
    "aurora_export_pdf",
    {
      title: "Export PDF",
      description: "Print the deck to a 16:9 PDF (one slide per page, all builds visible) with headless Chrome/Edge.",
      inputSchema: { dir: dirArg, out: z.string().optional().describe("PDF path (default: next to index.html)") },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ dir, out }) =>
      safe(async () => {
        const p = deckPaths(dir);
        const target = resolve(out ?? p.html.replace(/\.html$/i, ".pdf"));
        try {
          const r = await pdfDeck(p.html, target);
          return text(`PDF written: ${r.path} (${(r.bytes / 1024 / 1024).toFixed(1)} MB)`);
        } catch (e) {
          return text(browserError(e), true);
        }
      }),
  );

  server.registerPrompt(
    "lesson",
    {
      title: "Build a learning deck",
      description: "Plan and build an Aurora deck that teaches a topic",
      argsSchema: {
        topic: z.string().describe("What to teach"),
        audience: z.string().optional().describe("Who is learning, e.g. 'grade 10 student'"),
        language: z.string().optional().describe("Content language, e.g. vi or en (default: the language the request is written in)"),
        slides: z.string().optional().describe("Approximate number of slides (default 16–24)"),
      },
    },
    ({ topic, audience, language, slides }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Build an Aurora Slides lesson that teaches: ${topic}`,
              `Learner: ${audience ?? "a self-study learner"}. Length: about ${slides ?? "16–24"} slides.`,
              `Content language: ${language ?? "the language this request is written in (the topic above shows it)"}.`,
              "",
              "The learner studies theory first, copies the key points by hand into a paper notebook, then practises. Structure the deck that way:",
              "1. Opening: a title slide (a question or a surprising angle) and an agenda.",
              "2. Theory, as one or more sections titled in the content language: short concept slides (statement, split, definition, formula, " +
                "steps, compare, diagram…). After each block: memory anchors for its key ideas (a palace walk through a place the learner knows " +
                "for an ordered list; anchors, analogy or mnemonic for separate terms), then a notebook slide with the 4–8 lines worth copying by hand.",
              "3. Practice section: start practice with predict slides for the code just taught, then exercise slides from easy to hard (time to try alone, hints, worked solution, answer), then quiz, cloze or " +
                "flashcards, and the recall walk of the palace.",
              "4. Closing: a summary slide with 3–6 takeaways.",
              "",
              "Steps: aurora_guide (overview, then topics \"pedagogy\", \"accuracy\" and \"memory\") → aurora_search_icons → aurora_create_deck → make the pictures " +
                "it lists → aurora_screenshot and aurora_audit → fix with aurora_edit_deck.",
              "",
              LANGUAGE_RULE,
              ACCURACY_RULE,
              PICTURE_RULE,
              DONE_RULE,
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "course",
    {
      title: "Build a course of small lessons",
      description: "Split a subject into short lessons, each a deck with its own look",
      argsSchema: {
        topic: z.string().describe("Subject, e.g. 'Quantum computing'"),
        audience: z.string().optional(),
        lessons: z.string().optional().describe("How many lessons (default 4–8)"),
        language: z.string().optional().describe("Content language, e.g. vi or en (default: the language the request is written in)"),
      },
    },
    ({ topic, audience, lessons, language }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Build an Aurora Slides course about: ${topic}`,
              `Learner: ${audience ?? "a self-study learner"}. Content language: ${language ?? "the language this request is written in (the topic above shows it)"}.`,
              "",
              "1. Read aurora_guide topics \"course\", \"pedagogy\", \"accuracy\" and \"memory\".",
              `2. Split the subject into ${lessons ?? "4–8"} small lessons, each one focused part (e.g. theory first, then building blocks, then ` +
                "applications) of about 12–20 slides, and give every lesson its own theme that fits its content.",
              "3. aurora_create_course with that outline.",
              "4. For each lesson folder, in order: aurora_create_deck (recall of the previous lesson → theory → memory anchors → notebook pages → " +
                "practice → recall walk → summary), make the pictures it lists, then aurora_screenshot and aurora_audit, and fix problems.",
              "5. aurora_preview the course folder for the learner.",
              "",
              LANGUAGE_RULE,
              ACCURACY_RULE,
              PICTURE_RULE,
              DONE_RULE,
            ].join("\n"),
          },
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  const shutdown = async () => {
    stopPreview();
    await closeBrowser();
    process.exit(0);
  };
  process.stdin.on("close", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

/* ───────────────────────── CLI ───────────────────────── */

const HELP = `Aurora Slides ${VERSION}
Usage: node aurora.mjs [command] [options]

  (no command) | mcp            run the MCP server on stdio
  build <dir|deck.json> [--embed]
  serve <dir> [--open]          live preview with reload
  shot <dir> [--slides 1,3] [--sheet] [--width 1280] [--out folder]
  audit <dir>
  pdf <dir> [--out file.pdf]
  showcase [dir] [--theme aurora]   build a deck that uses every layout
  selftest [dir]                drive a deck in headless Chrome and report runtime errors
  schema [--out deck.schema.json]
  images <query> [--orientation …] [--kind …]   search photos
  generate <prompt> [--dir deck] [--orientation …]  make a picture (free Pollinations; OpenAI/Gemini only with AURORA_IMAGE_PROVIDER)
  icons <word> [word…] [--style duotone]         search icons
  guide [topic|type]
  version | help`;

function flags(argv: string[]): { pos: string[]; opt: Record<string, string | true> } {
  const pos: string[] = [];
  const opt: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      const nextVal = argv[i + 1];
      if (v !== undefined) opt[k!] = v;
      else if (nextVal !== undefined && !nextVal.startsWith("--") && !["embed", "open", "sheet", "transparent"].includes(k!)) {
        opt[k!] = nextVal;
        i++;
      } else opt[k!] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

async function cli(cmd: string, argv: string[]): Promise<number> {
  const { pos, opt } = flags(argv);
  const target = pos[0];
  switch (cmd) {
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return 0;
    case "version":
    case "--version":
      console.log(VERSION);
      return 0;
    case "schema": {
      const json = JSON.stringify(deckJsonSchema(), null, 2) + "\n";
      if (typeof opt.out === "string") {
        await writeFile(opt.out, json, "utf8");
        console.error(`Schema written to ${opt.out}`);
      } else process.stdout.write(json);
      return 0;
    }
    case "images": {
      const q = pos.join(" ");
      if (!q) throw new Error("Usage: images <query> [--orientation landscape|portrait|square|any] [--kind photo|illustration|diagram|any]");
      const r = await searchImages({
        query: q,
        count: 8,
        orientation: (typeof opt.orientation === "string" ? opt.orientation : "landscape") as "landscape",
        kind: (typeof opt.kind === "string" ? opt.kind : "photo") as "photo",
      });
      r.results.forEach((x, i) => console.log(`${i + 1}. ${x.width ?? "?"}×${x.height ?? "?"}  ${x.source}  ${x.url}\n   ${x.credit}`));
      if (!r.results.length) console.log("No results.");
      if (r.errors.length) console.error(r.errors.join("\n"));
      return r.results.length ? 0 : 1;
    }
    case "generate": {
      const prompt = pos.join(" ");
      if (!prompt) throw new Error("Usage: generate <prompt> [--provider openai|gemini|pollinations] [--orientation landscape|portrait|square] [--dir deck]");
      const r = await generateCached({
        prompt,
        provider: (typeof opt.provider === "string" ? opt.provider : "auto") as "auto",
        orientation: (typeof opt.orientation === "string" ? opt.orientation : "landscape") as "landscape",
        transparent: !!opt.transparent,
      });
      console.log(`${r.cached ? "cached" : `generated with ${r.provider} (${r.model})`}: ${r.file}`);
      if (typeof opt.dir === "string") console.log(`src: ${await placeInDeck(r.file, deckPaths(opt.dir).dir, `gen-${r.key}`)}`);
      return 0;
    }
    case "icons": {
      for (const q of pos) {
        const r = await searchIcons(q, (typeof opt.style === "string" ? opt.style : "all") as keyof typeof ICON_STYLES, 10);
        console.log(`${q}: ${r.map((x) => x.id).join(", ") || "(none)"}`);
      }
      return 0;
    }
    case "guide":
      console.log(await guideText(target && !(SLIDE_TYPES as string[]).includes(target) ? target : undefined, target && (SLIDE_TYPES as string[]).includes(target) ? target : undefined));
      return 0;
    case "build": {
      if (isCourseDir(target ?? ".")) {
        const ref = coursePaths(target ?? ".");
        const raw = JSON.parse((await readFile(ref.json, "utf8")).replace(/^﻿/, ""));
        const o = await buildCourse(raw, ref, { rebuildLessons: true, saveJson: false });
        console.log(summarizeCourse(o));
        return o.ok ? 0 : 1;
      }
      const p = deckPaths(target ?? ".");
      const b = await buildDeck(await readDeckFile(p), p, { embed: !!opt.embed, saveJson: false });
      console.log(summarize(b));
      return b.ok ? 0 : 1;
    }
    case "showcase": {
      const theme = typeof opt.theme === "string" ? opt.theme : "aurora";
      if (!(THEMES as readonly string[]).includes(theme)) throw new Error(`Unknown theme ${theme}. Themes: ${THEMES.join(", ")}`);
      const p = deckPaths(target ?? join(appDir("showcase"), theme));
      const b = await buildDeck(showcaseDeck(theme), p);
      console.log(summarize(b));
      return b.ok ? 0 : 1;
    }
    case "serve": {
      if (isCourseDir(target ?? ".")) {
        const url = await previewUrl(coursePaths(target ?? ".").dir, "index.html");
        console.log(`Course preview: ${url}  (Ctrl+C to stop)`);
        if (opt.open) openInBrowser(url);
        await new Promise(() => {});
      }
      const p = deckPaths(target ?? ".");
      await readDeckFile(p);
      const url = await previewUrl(p.dir, p.html.split(/[\\/]/).pop());
      console.log(`Preview: ${url}  (Ctrl+C to stop)`);
      if (opt.open) openInBrowser(url);
      const { watch } = await import("node:fs");
      let t: NodeJS.Timeout | undefined;
      watch(p.json, () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          try {
            const b = await buildDeck(await readDeckFile(p), p, { saveJson: false });
            console.log(b.ok ? `Rebuilt ${new Date().toLocaleTimeString()}` : summarize(b));
          } catch (e) {
            console.error(errMsg(e));
          }
        }, 150);
      });
      await new Promise(() => {});
      return 0;
    }
    case "shot": {
      if (isCourseDir(target ?? ".")) {
        const r = await screenshotPage(coursePaths(target ?? ".").html, typeof opt.width === "string" ? +opt.width : 1440, "png");
        const outDir = resolve(typeof opt.out === "string" ? opt.out : appDir("shots"));
        await mkdir(outDir, { recursive: true });
        const f = join(outDir, "course.png");
        await writeFile(f, r.shot.data);
        console.log(f);
        await closeBrowser();
        return 0;
      }
      const p = deckPaths(target ?? ".");
      const slides = typeof opt.slides === "string" ? opt.slides.split(",").map((x) => parseInt(x, 10)).filter((n) => n > 0) : undefined;
      const step = typeof opt.step === "string" ? +opt.step : undefined;
      const r = await screenshotDeck(p.html, { slides, step, sheet: (!!opt.sheet || !slides) && step === undefined, width: typeof opt.width === "string" ? +opt.width : undefined, format: "png" });
      const suffix = step === undefined ? "" : `-step${step}`;
      const outDir = resolve(typeof opt.out === "string" ? opt.out : appDir("shots"));
      await mkdir(outDir, { recursive: true });
      for (const s of r.shots) {
        const f = join(outDir, `slide-${s.slide}${suffix}.png`);
        await writeFile(f, s.data);
        console.log(f);
      }
      r.logs.forEach((l) => console.error(`console: ${l}`));
      await closeBrowser();
      return 0;
    }
    case "audit": {
      const p = deckPaths(target ?? ".");
      const raw = await readDeckFile(p);
      const v = validateDeck(raw);
      const r = await auditDeck(p.html);
      console.log(formatAudit(r.slides, r.logs, v.ok ? lintDeck(v.deck!) : v.errors));
      await closeBrowser();
      return r.slides.some((s) => s.issues.some((i) => i.level === "error")) ? 2 : 0;
    }
    case "selftest": {
      let p = deckPaths(target ?? join(appDir("showcase"), "selftest"));
      if (!target) {
        const b = await buildDeck(showcaseDeck(typeof opt.theme === "string" ? opt.theme : "aurora"), p);
        if (!b.ok) throw new Error(summarize(b));
        p = b.paths;
      }
      const r = await selfTest(p.html);
      for (const c of r.checks) console.log(`${c.ok ? "ok  " : "FAIL"} ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
      r.logs.forEach((l) => console.log(`LOG  ${l}`));
      console.log(r.ok ? "Self-test passed." : "Self-test FAILED.");
      await closeBrowser();
      return r.ok ? 0 : 1;
    }
    case "pdf": {
      const p = deckPaths(target ?? ".");
      const out = resolve(typeof opt.out === "string" ? opt.out : p.html.replace(/\.html$/i, ".pdf"));
      const r = await pdfDeck(p.html, out);
      console.log(`${r.path} (${(r.bytes / 1024 / 1024).toFixed(1)} MB)`);
      await closeBrowser();
      return 0;
    }
    default:
      console.error(`Unknown command "${cmd}".\n${HELP}`);
      return 1;
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === "mcp") {
  startMcp().catch((e) => {
    console.error(`[aurora] fatal: ${errMsg(e)}`);
    process.exit(1);
  });
} else {
  cli(cmd, rest).then(
    (code) => process.exit(code),
    async (e) => {
      console.error(errMsg(e));
      await closeBrowser();
      process.exit(1);
    },
  );
}
