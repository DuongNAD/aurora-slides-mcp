# Aurora Slides: authoring guide for AI agents

## overview
Aurora Slides turns a JSON deck into one self-contained HTML presentation in the style of an Apple keynote:
big type, glass cards, slow aurora backgrounds, spring animations, Magic Move between slides, and
interactive learning blocks (quiz, flashcards, cloze, notebook pages, exercises with timers, memory palaces and other memory anchors),
and diagrams written in Mermaid (flowcharts, mind maps, sequence and state diagrams…) that build in step by step.
Real code can be traced line by line inside a slide: a `trace` slide embeds a player built by sister project Mira.
The output is made for **self-study**: the learner reads at their own pace with → / Space, writes the key
points into a paper notebook, then practises.

Minimal deck:
```json
{
  "title": "Quang hợp",
  "lang": "vi",
  "theme": "aurora",
  "slides": [
    { "type": "title", "title": "Quang hợp:\n++bếp ăn++ của lá cây", "subtitle": "Cây biến ánh sáng thành đường như thế nào?", "icon": "ph:plant-duotone" },
    { "type": "statement", "text": "Lá cây ++tự nấu thức ăn++ từ ==ánh sáng, nước và CO₂==." },
    { "type": "notebook", "title": "Ý cần nhớ", "lines": ["# Khái niệm", { "term": "Quang hợp", "def": "tổng hợp chất hữu cơ nhờ ánh sáng" }, "= \\ce{6CO2 + 6H2O -> C6H12O6 + 6O2}"] },
    { "type": "quiz", "question": "Khí nào được giải phóng?", "options": ["CO₂", "O₂", "N₂"], "answer": 1, "explanation": "O₂ đến từ nước." }
  ]
}
```

Deck fields: `title` (required), `subtitle`, `author`, `lang` (default "vi"), `theme` (default "aurora"),
`accent`, `background`, `transition` (default "fade"), `font` ("vietnam" = Be Vietnam Pro, "inter", "system"),
`options` {progress, controls, counter, grain, parallax, magicMove, loop, resume}, `slides` (required).
Every slide accepts: `id` (deep link #/id), `theme` (per-slide override), `accent`, `background`,
`transition`, `notes` (study notes the learner opens with N), `morph` (false disables Magic Move into it),
`source` (short citation, e.g. "Khóa học · transcript 02:13", "Mở rộng · <ref>").

Golden rules:
- Write in the user's language: every learner-facing string (titles, text, notes, quiz options, explanations, hooks, notebook lines,
  alt text) uses the language the user wrote the request in, unless they ask for another one. Set `lang` to its code (vi, en, ja…).
  JSON keys, ids, icon ids, Mermaid keywords and image prompts stay in English. The examples in this guide are Vietnamese; follow
  their shape, not their language. Reply to the user in their language too.
- Teaching from real code? Quote it with `file` + `lines`; never retype it from memory.
- One idea per slide. Short lines. Let the layout carry the structure, not paragraphs.
- Put depth in `notes`; keep the slide itself minimal.
- Vary layouts for rhythm; never three identical layouts in a row.
- Check your work visually (aurora_screenshot) and mechanically (aurora_audit) before you finish.

## workflow
1. Call `aurora_guide` once (this page), then `aurora_guide {"topic": "pedagogy"}`. Ask for a type's fields with `{"type": "cycle"}` when unsure.
2. Plan the story as an outline: hook → theory blocks (each ending with memory anchors and a notebook page) → practice → recall walk → summary.
   Big subject? Make a course of small lessons first (topic "course").
3. Pick a theme that suits the subject (topic "themes").
4. Collect visuals in as few calls as possible: `aurora_search_icons {"queries": ["leaf", "sun", "water drop", …]}`.
   Illustrations: make them with your own image tool (topic "media"), or write `"image": {"generate": "<prompt>"}` and make them after the build.
   For photos either write `"image": {"query": "chloroplast microscope"}` (found at build time) or pick one with `aurora_search_images`.
   Processes, structures and overviews are often clearer as a `diagram` slide written in Mermaid (topic "diagram").
5. Build: `aurora_create_deck {"deck": {…}, "dir": "slides/quang-hop"}`. Fix any validation errors it lists and call again.
   If it lists "Pictures for you to make", make each one and add it with `aurora_add_image {"dir": …, "path": …, "for": "<id>"}`.
6. Look: `aurora_screenshot {"dir": …}` returns a contact sheet of every slide; then request up to 6 slides at full size for anything that looks off.
7. Check: `aurora_audit {"dir": …}` reports overflow, clipped text, elements outside the slide, broken images, tiny text and console errors. Fix every ERROR.
8. Refine with `aurora_edit_deck` (replace/insert/delete/move/update ops). Do not resend the whole deck for small changes.
9. Show the learner: `aurora_preview {"dir": …, "open": true}` serves the deck with live reload; every later edit refreshes the open page in place.
10. Optional: `aurora_export_pdf` for a printable copy (one slide per page, all builds visible).

A deck is a folder: `deck.json` (source) and `index.html` (built, self-contained, works offline from file://
except remote images and YouTube). Local images are paths relative to that folder.

## design
Think Apple keynote, not a document:
- **Headlines carry the message.** ≤ 7 words on title/section slides, ≤ 10 elsewhere. Use `\n` to choose where a long title breaks.
- **One accent moment per slide.** At most one `++gradient++` phrase or one `==marker==` highlight.
- **Whitespace is a feature.** 3–5 bullets, 2–3 compare columns, 4–6 bento cards. Fewer, bigger things.
- **Visual + verbal.** Pair concepts with an icon, diagram or photo (dual coding). Prefer duotone line icons
  (`ph:*-duotone`, `solar:*-bold-duotone`); large hero icons are painted with the theme gradient automatically.
  Avoid emoji-style icons (`fluent-emoji:*`) unless the learner asks for a playful look.
- **Rhythm.** Alternate dense and airy slides: statement → split → bento → image → quiz. Use `section` slides every 4–7 slides.
  A single `"theme": "daylight"` slide inside a dark deck makes a strong pause.
- **Magic Move.** When two consecutive slides share the exact same title, eyebrow, hero icon or image, it morphs smoothly
  (Keynote style). Use it on purpose: agenda → section with the same title, statement → split with the same image.
- **Builds.** `steps: true` (bullets, steps, timeline, cycle) and notebook/exercise/code/cloze/hotspots reveal one item per →.
  Builds pace attention and give the learner time to write. Mouse wheel and trackpad scrolling also move through builds.
- **Apple product-page moments.** Use `explode` to open an object up: the whole thing (photo) → camera zooms in → parts separate
  in 3D with labels → each part is spotlighted; scrolling scrubs it continuously. Use `image` with `zoom` steps to glide the camera
  into details of one photo, and `palace` for a camera walk through a memory palace. One or two such moments per lesson feel
  magical; more feel like a gimmick.
- **Transitions.** Keep the deck-level default `fade`; use `zoom` into sections, `slide` for sequences, `none` between builds of the same idea.
- **Anti-slop.** No emoji bullets, no neon outlines, no purple "SaaS" gradients, no ALL-CAPS eyebrows, no grids of identical cards with identical text lengths.

## themes
Choosing a theme:
- aurora: science, nature, biology, astronomy (the default; calm and cinematic).
- forest: biology, ecology, agriculture. ocean: geography, physics of waves, chemistry of water.
- sunset: history, literature, arts. titanium: engineering, hardware, maths. midnight: programming, tech keynotes.
- daylight: bright classroom look, best for projecting in lit rooms and for printing. paper: reading-heavy humanities, print-friendly.
- liquid: modern, playful, product-style.
Accents re-tint highlights, icons, charts and gradients: one of the named Apple colors or "#RRGGBB".
`background` overrides the theme backdrop per deck or slide: a kind (aurora, mesh, spotlight, grid, dots, stars, glow, plain)
or `{ "image": {"query": "misty forest"}, "dim": 0.55, "blur": 6 }` for a photo backdrop behind text.
Lesson scenes (`scene`: leaves, cells, dna, quantum, waves, molecules, circuit, network, code, orbits, geometry, ink) adapt automatically to the chosen theme, drawing from its gradient and accent variables (`--b1`..`--b4`, `--g1`..`--g3`, `--accent`, `--accent2`, `--c2`..`--c6`).

## scenes
Lesson scenes bring animated, subject-matched background art to your decks: sunlight through leaves for photosynthesis, interference rings and a Bloch sphere for quantum mechanics, PCB traces with travelling pulses for hardware, code token streams for programming, planetary orbits for astronomy, and more.

Scenes are deterministic SVG layers generated at build time, aria-hidden, pointer-events none, styled exclusively with theme color variables (`--b1`..`--b4`, `--g1`..`--g3`, `--accent`, `--accent2`, `--c2`..`--c6`), and modulated by slide density (`data-hero`: opacity 1.0 on title/section/statement/quote, 0.3 on dense code/table/notebook slides, 0.55 on standard content slides).

### The 12 scenes
- `leaves`: Sunlight shafts shining from the top-left at ~28°, swaying leaf silhouettes entering from corners, rising light motes (photosynthesis, botany, plants, ecology, agriculture).
- `cells`: Translucent floating cells with visible nuclei and organelles, soft bokeh cell disks behind (cytology, microbiology, immunology, bacteria, viruses).
- `dna`: Double helix on the right third, flowing seamlessly along its axis with alternating base-pair rungs and background helix depth (genetics, evolution, molecular biology, heredity).
- `quantum`: Concentric interference rings expanding from dual sources, wireframe Bloch sphere with oscillating meridian and precessing state vector, probability dot cloud (qubits, quantum theory, atomic physics).
- `waves`: 4-layer undulating sine waves across the lower 40% with translucent water surface fill (wave mechanics, oscillation, acoustics, optics, signal processing).
- `molecules`: Floating ball-and-stick molecules (benzene, water, CO2, methane, carbon chain) and faint hexagonal crystal lattice (chemistry, reactions, molecular physics, materials).
- `circuit`: Orthogonal PCB traces with 45° chamfers, integrated chip package with pins, light pulses travelling along traces (electronics, microprocessors, hardware, CPU, transistors).
- `network`: Seeded graph nodes with interconnecting edges, transmitting data pulses, softly firing neural nodes (AI, machine learning, neural networks, graph algorithms).
- `code`: Abstract code editor window on the right with colored syntax token bars, blinking caret, and seamlessly scrolling lines (software engineering, algorithms, Python, JavaScript, databases).
- `orbits`: Tilted elliptical planetary orbits around a radiant star glow with moving celestial bodies (astronomy, astrophysics, gravitation, space).
- `geometry`: Inscribed equilateral triangle slowly revolving within a construction circle, self-drawing sine curve, tangent line, background grid (mathematics, geometry, algebra, calculus).
- `ink`: Soft breathing ink-wash blooms, sweeping self-drawing calligraphic brush stroke, subtle paper fiber texture (history, philosophy, literature, humanities, law).

### Auto-detection & scoping
- **Deck level (`scene`)**: `"auto"` (default), explicit scene name, or `"none"`.
  When `"auto"`, Aurora folds diacritics and performs whole-word matching across English and Vietnamese keywords from deck title, subtitle, and section titles. The build output reports the chosen scene and keyword (e.g. `Scene: leaves (auto: 'quang hợp')`).
- **Course level**: Lessons in `course.json` can specify `scene: "..."` which lesson decks inherit automatically.
- **Section level**: Setting `scene` on a `section` slide applies to that section and all subsequent slides until another section overrides it.
- **Slide level**: Setting `scene` on any individual slide overrides the scene for that slide only. Set `"scene": "none"` to suppress scenes on visually demanding slides.

### Icon motion
Hero icons on `title`, `section`, `bullets`, `split`, `quiz`, and `definition` slides automatically receive a gentle, Apple-like motion loop matched to the icon's meaning:
- `sway`: leaf, plant, tree, flower, seedling, grass
- `spin`: gear, cog, fan, settings
- `rays`: sun (halo of thin rotating rays behind icon)
- `orbit`: atom, planet, globe, molecule (small dot orbiting on tilted ellipse)
- `ripple`: drop, water, droplet (expanding water rings below)
- `beat`: heart, pulse
- `float`: cloud, rocket, feather, bubble, balloon, fish, airplane
- `flicker`: flame, fire, lightning, bolt, candle (subtle opacity and scale jitter)
- `bob`: book, pencil, notebook, lightbulb, lamp, brain
- `none`: default for other icons or explicit override via slide field `"motion": "..."`.

### Photo backdrops and scenes
Photo backdrops (`"background": { "image": "...", "dim": 0.55, "blur": 6 }`) default to slow Ken Burns drift (`"motion": "kenburns"`). A dimmed photo backdrop pairs beautifully with subject scenes like `leaves`, `waves`, or `circuit` floating softly over the image.

## markup
Inline markup works in every text field:
- `**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[link](https://…)`, `<sub>`, `<sup>`, `<kbd>`, `<u>`.
- `++gradient phrase++` (theme gradient text), `==marker==` (highlighter sweep).
- `$inline math$` and `$$display math$$` in LaTeX (KaTeX). Chemistry with mhchem: `$\ce{2H2O -> 4H+ + 4e- + O2}$`.
  Inside JSON strings escape backslashes: `"$\\frac{a}{b}$"`, `"\\ce{CO2}"`.
- `[[answer]]` creates a blank in `cloze` slides.
- `\n` forces a line break (titles); in `text`/`notes`/`explanation`, a blank line starts a new paragraph and lines starting with `- ` become a list.
- Escape a literal marker with a backslash: `\*`, `\$`, `\[`.
Formula slides take raw LaTeX without `$`. Notebook lines: `# ` sub-heading, `= ` formula (LaTeX), `! ` must-remember, `@ ` memory anchor (the hook), `{term, def}` definitions.

**Math in JSON**: one backslash per command, typed as two in JSON text (`"\\text"`, `"\\frac"`), never four. Four backslashes make a LaTeX line break (`\\`), which stacks the formula over following lines. Aurora repairs doubled backslashes and reports them in the build notes. Real line breaks in aligned or matrix rows are followed by a space (`\\ `).

## media
Icons: any Iconify id `prefix:name`. Good sets: `ph` (Phosphor, use `-duotone`), `solar` (`-bold-duotone`), `lucide`, `tabler`,
`logos` / `skill-icons` (brands and programming languages), `fluent-emoji` (3D emoji, playful only).
Find several at once: `aurora_search_icons {"queries": ["photosynthesis", "leaf", "microscope"], "style": "duotone"}`.
Unknown ids render as a blank square and produce a warning; fix them before finishing.
Hero icons (on `title`, `section`, `bullets`, `split`, `quiz`, `definition`) automatically receive slow Apple-like motion loops based on the icon's meaning (`sway`, `spin`, `rays`, `orbit`, `ripple`, `beat`, `float`, `flicker`, `bob`, or override with slide-level `"motion": "..."`).

Images: `"image": "https://…"`, a local path relative to the deck folder, or an object
`{ "src" | "query" | "generate" | "svg", "alt", "credit", "fit": "cover|contain", "position": "50% 30%", "frame": "rounded|glow|window|circle|none" }`.
Aurora never spends the user's API keys on pictures: by default (AURORA_IMAGE_PROVIDER=agent) **you, the coding agent, make them**.
Ways to get a picture, in order of preference:
1. **Make it yourself** with your own image tool (Antigravity can generate images). Two ways to wire it in:
   - Make it first, then `aurora_add_image {"dir": …, "path": "<the file you made>"}` copies it into the deck's images/ folder and
     returns the `src` to put in the slide.
   - Or write `"image": {"generate": "<prompt>"}` in the slide. The build does not call any API: the slide shows a soft placeholder and
     the result lists "Pictures for you to make" with an id, slide number, shape (landscape 16:9, portrait 3:4, square 1:1) and prompt.
     Make each picture with your tool, then `aurora_add_image {"dir": …, "path": "<your file>", "for": "<id>"}`: it is saved as
     images/gen-<id>.* and the deck rebuilds. Calling it again with the same `for` replaces the picture. This keeps the prompts in
     deck.json, so the lesson can be re-made later and every picture shares one style suffix.
2. **Real photos from the web**: `{"query": "chloroplast microscope"}` (found at build time; credit kept automatically) or pick one with
   `aurora_search_images`. Unsplash/Pexels are used when UNSPLASH_ACCESS_KEY / PEXELS_API_KEY are set, else Openverse and Wikimedia.
   Use specific English nouns. Diagrams/anatomy: `aurora_search_images {"kind": "diagram"}` (Wikimedia).
3. **Draw it**: `{"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"…\">…</svg>"}` for clean diagrams (axes, circuits, cells, Bloch spheres).
   Use `currentColor` or theme-neutral colors that work on dark and light backgrounds.
4. **Fallback when you cannot make images** (e.g. a text-only agent): `aurora_generate_image` uses free, keyless Pollinations (lower
   quality, small watermark). Pass the same prompt, orientation, transparent and `dir` as the slide's `generate` and it fills that
   request on the next `aurora_build`. OpenAI / Gemini are used only when the user sets AURORA_IMAGE_PROVIDER=auto|openai|gemini;
   in that mode `generate` prompts are made at build time and `"transparent": true` gives cut-out objects (OpenAI).

Prompt recipe for generated images, so a deck looks like one family: `<subject>, <composition>, <style suffix>`, keeping the same style
suffix for the whole lesson, e.g. "minimal 3D render, soft studio lighting, deep navy background, subtle teal glow, Apple keynote style,
no text". Never ask for words or labels inside the image (they come out garbled, especially Vietnamese); put text on the slide instead.
For explode parts ask for "top-down view, isolated object, transparent background".

- Full-bleed photos belong in `image` slides (cinematic, Ken Burns zoom); text sits on an automatic gradient shade.
- Photo backdrops (`"background": { "image": "...", "dim": 0.55, "blur": 6 }`) default to slow Ken Burns drift (`"motion": "kenburns"`, disable with `"motion": "none"`). Photos pair especially well with dimmed subject scenes like `leaves`, `waves`, or `circuit` (at `dim: 0.6`) floating softly over the image.
- Always check images in the screenshot: replace irrelevant results with another query, prompt or a fixed `src`.
Video: YouTube/Vimeo URLs embed when served over http (aurora_preview); from file:// a poster links to the video.
Mira trace player (`trace` slide): a player is one self-contained `index.html` that Mira builds with its tool `mira_build` from real Python
(it steps through the code line by line beside a visualisation and stops at prediction gates, where the learner types what will happen).
`mira_build` prints a ready slide JSON: paste it. A trace slide is full-bleed: the player fills the slide, scaled from its 1280px design size,
and the slide needs no other text. `title` and `caption` feed the outline, the print page, and accessibility rather than being shown on screen.
Use it for any Python quoted from a file, not only loops and recursion (loops, recursion, search, sorting, parsers, agent loops). Use it after the theory
and code slides, for 3-8 stops, give the slide an `id` and provide `caption` for print and outline. The build copies the player to
`assets/mira/<folder>-<6 hex>.html` next to index.html (keep that folder with the deck) and embeds it in an iframe that loads when
the slide opens and stays loaded, so the learner keeps their place. **Esc inside the player hands the keyboard back to the deck**, so
→ / ← move through slides again (mention Esc in notes or caption for print). A missing player (or a page without the `mira-player` meta tag) only
warns and shows a calm card; print and PDF show the title, the caption and the path of the interactive version.
Fields and a Vietnamese example: `aurora_guide {"type": "trace"}`. The predictions flow into the progress log (topic "progress").

## diagram
`diagram` slides draw a Mermaid diagram at build time (in the headless Chrome also used for screenshots), coloured by the slide's
theme and accent and inlined as SVG: no network at study time, small files. Boxes build in and arrows trace between them;
`steps: true` reveals one box per → in the order the boxes first appear in the code (one message per → in a sequence diagram).
`look: "handDrawn"` gives sketchy whiteboard strokes. A syntax error never stops the build: the slide shows the error and the
build warnings quote Mermaid's message (line and expected token); fix the code and build again.

Pick the diagram by the idea:
- process, algorithm, decision → `flowchart LR` (wide slide) or `flowchart TD` (tall; use it beside a `text`/`items` column)
- overview of a topic, revision map → `mindmap`
- who talks to whom: protocols, requests, a conversation → `sequenceDiagram`
- states and transitions: automata, life cycle of an object → `stateDiagram-v2`
- structure: classes, database tables → `classDiagram`, `erDiagram`
- dates → `timeline` (or the `timeline` slide for ≤ 7 events); schedules → `gantt`
- flows of quantities (energy, money, mass) → `sankey-beta`; 2×2 comparisons → `quadrantChart`
- plain bar/line/area/donut data → prefer the `chart` slide (animated, bigger type); `xychart-beta` or `pie` when needed
- a loop of 3–8 stages → prefer `cycle`; 2–6 linear steps → prefer `steps`

Syntax that works (Vietnamese labels are fine):
```
flowchart LR
  A([Bắt đầu]) --> B[Đọc dữ liệu]
  B --> C{Hợp lệ?}
  C -->|có| D[(Lưu)]
  C -->|không| B
```
Shapes: `[hộp]`, `(bo tròn)`, `([viên thuốc])`, `{quyết định}`, `[(cơ sở dữ liệu)]`, `((tròn))`. Arrows: `-->`, `-.->` (dashed),
`==>` (thick), `-->|nhãn|`. Group boxes with `subgraph Tên` … `end`.
```
mindmap
  root((Quang hợp))
    Nguyên liệu
      Ánh sáng
      Nước
    Sản phẩm
      Glucose
      O₂
```
Indentation is the tree; `(bo tròn)` and `((tròn))` work for mind-map nodes too.
`sequenceDiagram`: `participant A as Máy khách`, `A->>B: SYN`, `B-->>A: SYN-ACK`, `Note over A,B: ghi chú`.
`stateDiagram-v2`: a state with spaces needs an alias: `state "Chuẩn bị" as CB`, then `[*] --> CB`, `CB --> CC: cổng H`.
`sankey-beta`: lines `nguồn,đích,giá trị` (Vietnamese names are handled automatically).

Rules:
- ≤ 12 boxes and labels ≤ 4 words; explanations go in `text`, `caption` or `notes`. The audit warns when labels get too small.
- Quote a label with punctuation or brackets: `A["Pha sáng (thylakoid)"]`. Avoid `;` and `#` inside labels.
- Never set colours, themes or `classDef` fills: the slide theme colours the diagram. Front matter config works for layout tweaks.
- Check with aurora_screenshot; for `steps`, also look at a middle step: `{"slides": [n], "step": 2}`.

## code
`code` slides (and code objects in `split` and `exercise`) render a macOS-style window with syntax highlighting and line numbers.

Quote verbatim from real source files:
- `file`: path relative to the deck folder (e.g. `"quang_hop.py"`) or absolute.
- `lines`: 1-based inclusive range or comma-separated ranges (e.g. `"129-161"` or `"129-140,147-161"`). Defaults to the entire file (warns if >40 lines). Non-contiguous ranges insert a gap row (`⋯`).
- `dedent`: boolean (default `true`), removes common leading indentation of the cut lines.
- `steps`: `[{"lines": "147-151", "text": "..."}]` refers to real source line numbers to highlight and explain lines one by one.
- `lang` and `filename` default automatically from the file extension and basename.
- Missing files or out-of-bounds line ranges produce build warnings and render an error card on the slide without failing the build.

For inline snippets not backed by a real file, use `code: "..."` with `lang`.

## course
Learners study a big subject as a **course of small lessons**: one focused part per lesson, 12–20 slides, 15–25 minutes.
Example "Máy tính lượng tử": 1 Lý thuyết lượng tử (qubit, chồng chập, đo lường) → 2 Cổng lượng tử → 3 Rối lượng tử →
4 Mạch & thuật toán đầu tiên → 5 Phần cứng thật. Each lesson is its own deck **with its own look**, so the learner feels they
entered a new chapter.

1. `aurora_create_course {"course": {"title", "subtitle", "theme": "midnight", "lessons": [{"title", "summary", "theme", "icon", "minutes"}, …]}, "dir": "slides/may-tinh-luong-tu"}`.
   It writes course.json and a course home page (Apple-style lesson cards in each lesson's colors, learner progress, a continue button),
   and returns one folder per lesson.
2. Build the lessons in order with `aurora_create_deck {"deck": …, "dir": "<lesson folder>"}`. A lesson deck may omit `theme`: it takes
   the theme planned in the course. Every lesson gets a breadcrumb back to the course, a "next lesson" button on its last slide and
   progress that the course page shows.
3. Choose themes by content and keep neighbours different: theory/abstract → aurora or midnight; building blocks and circuits →
   titanium; waves, fields, data → ocean; history and people → sunset; life sciences → forest; playful practice or recap → liquid;
   printable reference → paper or daylight. Repeat a theme only when lessons are far apart.
   Lesson cards preview each lesson's scene faintly in the background. Pick scenes so neighbouring lessons do not look identical (e.g. quantum → circuit → network, never two identical scenes back-to-back).
4. Each lesson still follows theory → notebook → practice → summary (topic "pedagogy"), and recalls the previous lesson in 1–2 slides.
5. `aurora_preview {"dir": "<course folder>"}` serves the whole course; `aurora_build` on the course folder rebuilds everything.
6. Polaris lesson outlines: when building a lesson in a course and `<subject>/polaris/lessons/<lesson>.outline.md` exists, follow it and cite its sources in `source`.

## pedagogy
Default learner: the user, a self-learner who **studies theory first, copies the key points into a paper notebook, then practises**.
Shape every lesson deck for that habit (section titles in the deck language, e.g. Vietnamese "Lý thuyết", "Thực hành"):

1. **Opening**: `title` (a question or a surprising angle) → `agenda` (lists the sections automatically).
2. **Theory**: one `section` per big idea. Inside, short concept slides: `statement`, `definition`, `split`,
   `steps`, `cycle`, `compare`, `formula`, `chart`, `hotspots`, `code`, `diagram`.
3. **Memory anchors**: after a theory block, tie its key ideas to something the learner already knows: a `palace`
   walk for an ordered list, `anchors` (one vivid picture per term), `analogy` or `mnemonic` (topic "memory"). The learner wants
   to study this way: every lesson gets at least one anchor slide, usually a palace.
4. **Notebook**: close every block with a `notebook` slide holding the 4–8 lines worth writing down (definitions, formulas,
   rules, one must-remember line, and an `@ ` anchor line with the hook). Notebook lines reveal one per → so the learner can copy at
   their own pace; keep each line copyable in one go (≤ 18 words).
5. **Practice**: a `section`, then start practice with `predict` slides for the code just taught (predict-then-run: the learner writes a prediction, runs the code in the slide's terminal, then compares and copies gaps into their error log), followed by `exercise` slides from easy to hard: a self-contained problem, `time` to try alone
   (60–300 s), 1–2 `hints` that nudge without giving it away, a worked `solution` in short steps, and a final `answer`.
   Follow with hands-on practice: `order` for processes and sequences 3–7 steps, `match` for term ↔ meaning 2–6 pairs,
   `sort` for classification 2–4 groups (4–12 items), `cloze` with `input: true` for exact recall of key terms, `quiz` (with explanations),
   `flashcards`, and the recall walk of the lesson's palace (`{"type": "palace", "from": "<id>", "mode": "recall"}`) or `anchors` with `recall: true`.
6. **Closing**: `summary` with 3–6 takeaways; it also shows the learner's quiz score.

Teaching rules:
- Concrete before abstract: an example, image or everyday comparison first, then the definition.
- One idea per slide; the slide shows the idea, `notes` hold the explanation in full sentences.
- When the deck language is not English, introduce technical terms in that language with the English term in parentheses on
  first use: "lục lạp (chloroplast)".
- Wrong answers must teach: give quiz `explanation` and per-option `explain`.
- Spread active recall: some check (quiz, cloze, flashcards, exercise, order, match, sort) every 5–7 slides.
- Natural language: write as a good teacher speaks the deck language, not as a translation. For Vietnamese: correct diacritics,
  no mixed-up tones.
- **Code slides need a trace**: when a deck quotes Python from a file, follow it with a Mira trace slide (mira_record → mira_build) so the learner steps through real execution rather than static text or simulated output.

## practice
Hands-on practice interactions test comprehension and active recall with instant grading:
- **order**: sequence 3–7 steps (processes, timelines, algorithms). Drag tiles or use Space/Enter and Arrow keys.
- **match**: connect 2–6 pairs (term ↔ meaning, cause ↔ effect). Click or drag between columns; Bézier curves connect them.
- **sort**: classify 4–12 items into 2–4 groups. Drag chips into bins or press keys 1–4.
- **cloze** (with `input: true`): exact recall of terms. Accepts alternatives `[[shown|alt 1|alt 2]]`; diacritic variations trigger accent reminders.
- **quiz**: multiple choice (2–6 options) with "Làm lại" / "Try again" to retry after seeing feedback.
All graded slides share a common footer with "Kiểm tra" / "Check", instant score, "Làm lại" / "Try again", "Xem đáp án" / "Show answer", and report mistakes through the standard `quiz` progress event for Polaris error logs.

## memory
Memory anchors make theory stick: tie each key idea to something the learner already knows, then make them recall it later.
Place them after a theory block, before its notebook page: theory → anchors → notebook → practice → recall walk → summary.

Pick the anchor by the shape of the content:
- **palace** (method of loci) for an ordered list of 4–9 ideas: steps of a process, stages, postulates, a list to know by heart.
  The learner walks a route they know (their home: cửa ra vào → kệ giày → sofa → TV → bàn ăn → tủ lạnh → bếp → ban công; the way
  to school; their classroom) and leaves one idea at each stop. The camera glides from stop to stop and draws the path; scrolling
  scrubs the walk; each stop shows a card tied to its anchor point by a leader line.
- **anchors** for 1–6 separate terms that need a face: one vivid picture plus one hook sentence per term.
- **analogy** for a new system that works like a familiar one (lục lạp ≈ nhà máy điện mặt trời, qubit ≈ đồng xu đang quay).
  Always fill `limit`: where the comparison breaks.
- **mnemonic** for facts that compress into a phrase: acrostics and rhymes ("Sin đi học, Cos không hư, Tan đoàn kết, Cot kết đoàn";
  "Con kiến tha mồi" = cố định, khử, tái sinh). Bold the letters that carry the meaning in both the cue and the text.

Writing hooks (the part that makes or breaks an anchor):
- Concrete and visual: something you can see, not an abstract word. Exaggerate size, number, colour, sound, motion; a bit absurd is good.
- Tie the hook's key feature to the idea's meaning (đồng xu quay: vừa sấp vừa ngửa = chồng chập), not only to how the word sounds.
- Put the learner in the scene ("bạn mở tủ lạnh ra…"); one hook per idea, one line (≤ 16 words).
- Use places from the learner's everyday life that they surely know (for a Vietnamese learner: their home, the street market, the
  way to school); never make them learn a new place first. Hooks are written in the deck language.

Palace recipe:
1. Give the learn palace an `id` and 5–9 `stations` {place, item (≤ 6 words), hook, icon?, image?}. Without `image` a clean route
   map is drawn and the stops are laid out automatically on the right, beside the title.
2. Optional picture of the place: generate a wide image (prompt: "cozy Vietnamese apartment seen from above, isometric cutaway,
   <the stops> clearly separated, soft warm light, no text, no people") or draw an SVG floor plan. Look at it, set x/y (% of the
   picture) for every station, then check with `aurora_screenshot {"slides": [n], "step": k}` (step k = stop k; the last step is
   the whole map with every idea).
3. Later in the same lesson (after the practice) add the recall walk: `{"type": "palace", "from": "<id>", "mode": "recall"}`.
   The ideas are hidden; at each stop the learner recalls, presses → to check, and rates Nhớ / Chưa nhớ (keys 1 / 2); the end shows
   the score and the stops to review.
4. Open the next lesson with a recall walk of the previous lesson's palace (copy its stations) and use a new route for new material.
   Finished recall walks feed the course page's spaced review: done lessons show "Đến hạn ôn" after 1, 3, 7, 16 and 35 days.

On the notebook page add an anchor line `@ <hook> = <idea>`: the learner writes the hook next to the idea in the margin.
Anchor pictures: one bold subject, no text, the same style suffix for the whole lesson (topic "media"). Your own image tool
(then aurora_add_image) or `generate` give the most vivid results; icons are the fallback.

## accuracy
The user's course materials (transcripts, code, official notebooks, their own roadmap) are the source of truth.

Rules for grounded, reliable lessons:
- **Quote, never retype**: quote code with `file` + `lines` (and `dedent: true`), never retype it from memory.
- **Predict-then-run**: for code, prefer `predict` slides with real output captured by running it.
- **Tag slides with `source`**: tag slides with `source` (e.g. `"Khóa học · transcript 02:13"`, `"Khóa học · Lab 1 dòng 129-161"`), marking external extensions `"Mở rộng · <source>"` and unverifiable claims `"chưa xác minh"`.
- **State what is simulated**: clearly state what is simulated (mock LLMs, toy datasets, dummy APIs, heuristic approximations) rather than real production behavior.
- **Never invent numbers or dates**: benchmark metrics, latencies, dates, paper citations, and version numbers must be exact.
- **No overclaims**: avoid sweeping overclaims ("100%", "always", "works on every model").
- **Real quiz distractors**: quiz distractors must be real, plausible misconceptions, never absurd or impossible options.
- **Learner-centered author**: the deck `author` is the learner (or omitted), never the course provider.
- **Calibrate level**: calibrate the level to the learner's own materials (their roadmap's outcomes and Definition of Done).

## qa
Before you report a deck as done:
1. `aurora_screenshot` (contact sheet): is the rhythm varied? Any slide visibly crowded, empty, or off-balance? Any wrong-looking image?
2. Zoom in: `aurora_screenshot {"slides": [n, m]}` for dense slides, charts, cycles, hotspots (pins must sit on the right spots).
3. `aurora_audit`: fix every ERROR. Typical fixes:
   - "overflows" / "clipped" → shorten text, drop an item, split the slide, or switch layout (bullets → bento, split → statement + split).
   - "Text auto-shrunk to 80%" → trim; the slide is too full.
   - "extends beyond the slide" → fewer items or shorter labels.
   - "Cycle labels overlap" → titles ≤ 4 words, text ≤ 10 words, or fewer stages.
   - Broken image → a different query or src.
   - "A formula could not be parsed" → check LaTeX: one backslash per command, written `\\text` in JSON.
   - "A notebook formula is taller than its row" → split or shorten the formula so it does not overlap adjacent lines.
   - "A notebook formula takes N ruled lines" / "shrunk to N%" → split or shorten wide/tall notebook formulas.
4. Content notes from the build (pedagogy, rhythm, word counts) are advice: follow them unless you have a reason not to.
5. Tell the learner how to study with it: → / Space next, ← back, N notes, O overview, F fullscreen, T timer on exercises, 1–6 answers quizzes.

## progress
Aurora records interactive learning events during self-study:
- `quiz`: submitted answer with question (plain text, max 200 chars), chosen option indices (`chosen`), chosen option texts (`chosenText`, string array, max 160 chars each, optional), correct answer indices (`answer`), correct answer texts (`answerText`, string array, max 160 chars each, optional), explanation (`explanation`, plain text, max 300 chars, optional), and boolean `correct`.
- `predict`: prediction title, learner's typed prediction text (max 2000 chars), self-rating ("right" or "different"), and real terminal output snippet (max 300 chars).
  Predictions made in a Mira player embedded by a `trace` slide arrive as `predict` events too (one per prediction gate): `slideId` is `<slide id>:mira-stop-<k>`
  (`trace-<slide number>:mira-stop-<k>` when the slide has no id). The player speaks the `mira-embed.v1` protocol (`ready`, `event`, `blur` messages; Aurora answers `ready` with a
  `hello` carrying the theme and accent); only `predict` events are relayed, the player's own `complete` is ignored because Aurora sends its own.
- `recall`: memory palace id, station index, place, item, and rating ("got" or "missed").
- `card`: spaced repetition review card id (`card`, max 100 chars), rating ("again", "hard", "good", or "easy"), and review duration in milliseconds (`ms`, integer 0..86400000, optional).
- `complete`: total slide count, quiz accuracy (`x/y` or null), prediction accuracy (`x/y` or null) — sent once per visit on the last slide.

### Where events are saved
1. **LocalStorage buffer**: ring buffer of the last 1000 events (`aurora:course:<key>:events` or `aurora:<deck>:events`).
2. **Export button**: "Xuất tiến độ" / "Export progress" in the help panel (`?`) and on the course home page downloads `aurora-progress-<slug>.jsonl`.
3. **Live preview server**: when running under `aurora_preview`, events POST to `/__aurora/progress` and append to `<course folder>/progress.jsonl` (or `<deck folder>/progress.jsonl`).

### Progress summary (`aurora_progress`)
Call `aurora_progress {"dir": "<course or deck folder>", "file"?: "<optional exported .jsonl>"}`:
- Last activity timestamp per lesson.
- Quiz accuracy percentage and wrong answers with chosen vs correct texts.
- Predictions (counts of right vs different, listing different predictions with snippets).
- Predictions made in Mira trace players, listed apart under the sub-heading `Dò code (Mira)` with their own right/different counts.
- Missed memory palace stations (`place -> item`).
- Spaced repetition reviews (counts per rating: again, hard, good, easy).
- Completed lessons with completion dates and spaced reviews due (+1, +3, +7, +16, +35 days).

### Sister projects
- **Polaris** (https://github.com/DuongNAD/polaris-mcp) reads Aurora's `progress.jsonl` via `polaris_progress_sync` to automatically populate the learner's error log ("Sổ lỗi") and update the spaced review schedule.
- **Vega** (https://github.com/DuongNAD/vega-mcp, FSRS memory engine) generates daily review decks (`deck.json` composed of `srs` slides) and reads `card` progress events via `vega_sync` to reschedule each card with FSRS.

Also in the ecosystem (each has its own MCP server):
- Orion: practice labs checked by real tests, tutoring-ladder hints, predict-then-run, attempt tracking.
- SmartDrive: SSD governance and learning-aware search; Aurora asks it to re-index a folder after every write.
- Constellation: one manifest, registration into the coding agents, health checks, drift doctor and the shared contracts (aurora-progress-event.v1).
- Mira: code trace players: real Python execution traces in a self-contained player that a `trace` slide embeds; its predictions arrive in this progress log (mira-embed.v1), so Polaris and Vega need no change.
- Sirius: execution loop - deadlines, triage, today router, session timer, weekly review
