# Aurora Slides MCP - plan and status

MCP server (TypeScript, stdio) that lets AI coding agents (Claude Code, Antigravity, Cursor) build
Apple-keynote-style animated, interactive HTML slide decks and small-lesson courses for self-study (Vietnamese first).

## Status (2026-10-10): v0.4 agent-made pictures
- The learner mostly builds decks with Antigravity, which can generate images itself, and does not want API keys spent.
  AURORA_IMAGE_PROVIDER (src/imagegen.ts `imageMode`) defaults to `agent`: builds never call an image API; a slide's
  `generate` prompt becomes a picture request (id = genKey of prompt/shape/transparent) listed in the build output
  ("Pictures for you to make") with a glass placeholder on the slide. `aurora_add_image {for: id}` saves images/gen-<id>.*
  (replacing an earlier one) and rebuilds the deck. Pictures already in images/gen-<id>.* or the cache are reused in every mode.
  OpenAI/Gemini keys are ignored unless the mode is auto|openai|gemini; aurora_generate_image is the Pollinations fallback.
- Agent-facing text is English and shared: src/index.ts LANGUAGE_RULE, PICTURE_RULE and DONE_RULE feed the server
  instructions (Workflow / Rules / Done when) and the lesson/course prompts. Content and replies follow the user's language
  (the language of the request; deck `lang` set to it); GUIDE.md golden rules and pedagogy say the same.
- Registered as `aurora-slides` in Antigravity (~/.gemini/antigravity/mcp_config.json) and Claude Code (user scope).
- Git: private repo github.com/DuongNAD/aurora-slides-mcp; dist/ and assets/ are committed so a clone runs without a build.
  The git dir lives on C: (C:/Users/Admin/.git-dirs/aurora_slides_mcp.git; `.git` here is a pointer file) so loose objects
  never land on the exFAT drive. Not under %LOCALAPPDATA%: the Claude desktop app is packaged (MSIX) and redirects writes
  there into its own Packages/Claude_*/LocalCache, which would vanish with the app.

## v0.3 (2026-10-10): Mermaid diagrams
- New `diagram` slide: Mermaid 12 code rendered to SVG at build time in headless Chrome (src/diagrams.ts), themed from the
  slide theme (hex palette per theme + themeCSS: rounded boxes, shadows, label weights), cached in AURORA_HOME/cache/diagrams
  (key: mermaid version + RENDER_REV + code + theme), inlined into the deck. Runtime builds it in (boxes blur in, arrows trace,
  sequence messages one by one, bars grow); `steps` reveals boxes in code order with arrows matched to boxes geometrically.
  Syntax errors become warnings + an error card. Sankey labels are swapped for ASCII tokens (its parser is ASCII-only).
- The build takes only dist/mermaid.min.js out of the npm tarball (no dependency install) into assets/mermaid.min.js (5.3 MB).
- Guide topic "diagram"; audit warns when diagram labels get too small; examples: quang-hop mind map, Bell-state flowchart.

## v0.2 (2026-10-10): memory anchors
- The learner wants to study with memory anchors (method of loci). New types: palace (memory palace: camera walks a route
  through a familiar place, one idea per stop, leader-line cards, wheel-scrubbed; drawn map or a picture with x/y; recall mode
  with Nhớ / Chưa nhớ rating and score; `from` reuses a palace), anchors (picture per idea, recall mode), analogy (with limit),
  mnemonic (bold letters decode). Notebook `@ ` anchor lines. Course page marks lessons due for spaced review (1/3/7/16/35 days).
- Pedagogy default is now theory → anchors → notebook → practice → recall walk (guide topic "memory", lint suggestions, prompts).
- Examples: quantum lesson 1 has a palace on an SVG floor plan (tools to regenerate it are not part of the project), lesson 2
  opens with a recall walk and has a mnemonic; quang-hop has analogy, palace, mnemonic and a recall walk.

## v0.1 (2026-10-10): complete and tested
- 29 slide types incl. notebook (ruled paper, line-by-line), exercise (timer, hints, solution, answer),
  explode (Apple product-page exploded view, wheel-scrubbed), image camera zoom.
- Courses: course.json + course home page (lesson cards in each lesson's theme, progress), lessons get breadcrumb,
  next-lesson button and theme plan automatically.
- Images: web search (Openverse/Wikimedia keyless, Unsplash/Pexels with keys), AI generation (OpenAI/Gemini keys,
  Pollinations fallback), inline SVG, aurora_add_image for files the agent made itself (e.g. Antigravity).
- 14 MCP tools + prompts `lesson` and `course`; CLI (build, serve, shot, audit, pdf, images, icons, generate,
  showcase, selftest).
- QA: tsc clean; `node dist/aurora.mjs selftest` (drives runtime in headless Chrome) passes; `node scripts/e2e.mjs`
  (real MCP stdio client, every tool) passes; examples audit with 0 issues.

## Layout
- src/: schema, markup, highlight, charts, media, imagegen, diagrams, render, course, lint, store, preview, browser, guide,
  catalog, selftest, index (MCP + CLI).
- runtime/aurora.css + aurora.js (minified into assets/ by the build), guide/GUIDE.md (agent docs),
  examples/quang-hop, examples/may-tinh-luong-tu (course: lessons 1, 2, 5 written; 3, 4 planned).

## Ideas for later
- Write lessons 3-4 of the example course; verify OpenAI/Gemini generation once (not run, to avoid spending API credits).
- PDF size: glass shadows still rasterise (about 0.6 MB per slide).
- Optional: per-deck offline mode that downloads remote photos into images/.

## Hard constraints
- D: is exFAT with 512 KB clusters: never create node_modules on D:. Toolchain in %LOCALAPPDATA%/aurora-slides/toolchain.
- Default font Be Vietnam Pro; keep padding so Vietnamese diacritics never clip.
- Anti-slop: no emoji icons by default, no neon, no purple SaaS gradients, no all-caps eyebrows, no identical card grids.
- Edit/Write tools cannot write to D: in auto mode here: write in the scratchpad and `cp` (Bash works).
