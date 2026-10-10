/**
 * Deck schema: the JSON contract between AI agents and the renderer.
 * Every slide type is a strict object so typos ("subtitel") surface as
 * actionable validation errors instead of silently disappearing.
 */
import { z } from "zod";

export const THEMES = ["aurora", "midnight", "daylight", "titanium", "ocean", "sunset", "forest", "paper", "liquid"] as const;
export const ACCENTS = ["blue", "purple", "pink", "red", "orange", "yellow", "green", "mint", "teal", "cyan", "indigo"] as const;
export const TRANSITIONS = ["fade", "slide", "zoom", "blur", "cube", "none"] as const;
export const BACKGROUNDS = ["auto", "aurora", "mesh", "spotlight", "grid", "dots", "stars", "glow", "plain"] as const;
export const FONTS = ["vietnam", "inter", "system"] as const;

const md = (description: string) => z.string().min(1).describe(description);
const optMd = (description: string) => z.string().optional().describe(description);

export const IconSchema = z
  .string()
  .min(1)
  .describe('Iconify id "prefix:name" — e.g. "ph:atom-duotone", "solar:leaf-bold-duotone", "fluent-emoji:seedling", "logos:python"');

export const AccentSchema = z
  .union([z.enum(ACCENTS), z.string().regex(/^#[0-9a-fA-F]{6}$/, "accent must be a named accent or #RRGGBB")])
  .describe(`Accent color: one of ${ACCENTS.join(", ")} or "#RRGGBB"`);

const ImageObject = z
  .strictObject({
    src: z.string().min(1).optional().describe("URL, or a path relative to the deck folder (e.g. images/x.png from aurora_add_image)"),
    query: z.string().min(2).optional().describe("Web search phrase; a matching photo is found automatically at build time"),
    generate: z
      .string()
      .min(3)
      .optional()
      .describe(
        "Prompt for a picture. By default the build lists it as a picture request: make it with your own image tool and add it with aurora_add_image {for: id} (saved as images/gen-<id>.*). An image API is called only when the user sets AURORA_IMAGE_PROVIDER",
      ),
    transparent: z.boolean().optional().describe("With generate: ask for a transparent background (cut-out parts, objects for explode slides)"),
    svg: z.string().min(20).optional().describe("Inline <svg>…</svg> you drew yourself (diagrams, simple illustrations)"),
    alt: z.string().optional(),
    credit: z.string().optional().describe("Attribution shown in small print, e.g. 'Ảnh: Jane Doe / Unsplash'"),
    fit: z.enum(["cover", "contain"]).optional(),
    position: z.string().optional().describe("CSS object-position, e.g. '50% 30%'"),
    frame: z
      .enum(["none", "rounded", "glow", "window", "circle"])
      .optional()
      .describe("rounded = soft card, glow = ambient light bleed (Apple TV style), window = macOS window, circle = avatar"),
  })
  .refine((v) => Boolean(v.src || v.query || v.generate || v.svg), {
    message: "image needs one of `src` (URL/file), `query` (web search), `generate` (AI prompt) or `svg` (inline drawing)",
  });

export const ImageSchema = z
  .union([z.string().min(1), ImageObject])
  .describe("Image: a URL/relative path string, or {src|query|generate|svg, alt, credit, fit, position, frame}");

export const BackgroundSchema = z
  .union([
    z.enum(BACKGROUNDS),
    z.strictObject({
      kind: z.enum(BACKGROUNDS).optional(),
      image: ImageSchema.optional().describe("Full-bleed background photo"),
      dim: z.number().min(0).max(0.95).optional().describe("Darken a background image (0..0.95, default 0.45)"),
      blur: z.number().min(0).max(60).optional().describe("Blur a background image in px"),
      colors: z.array(z.string()).min(2).max(4).optional().describe("Custom blob/gradient colors (CSS colors)"),
    }),
  ])
  .describe(`Background: ${BACKGROUNDS.join(" | ")} or {kind, image, dim, blur, colors}`);

const base = {
  id: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "id may only contain letters, digits, - and _")
    .optional()
    .describe("Stable id (deep link #/id)"),
  theme: z.enum(THEMES).optional().describe("Per-slide theme override, e.g. one 'daylight' slide in a dark deck for rhythm"),
  accent: AccentSchema.optional(),
  background: BackgroundSchema.optional(),
  transition: z.enum(TRANSITIONS).optional(),
  notes: optMd("Study notes for this slide (press N). Put depth here, keep the slide itself minimal."),
  morph: z.boolean().optional().describe("false disables automatic Magic Move into this slide"),
  source: optMd("Where this slide's facts come from (e.g. 'Khóa học · transcript 02:13', 'Mở rộng · arXiv 2210.03629', 'chưa xác minh')"),
};

const eyebrow = optMd("Small colored label above the title, sentence case (e.g. 'Chương 2: Hoá học')");

const BulletItem = z.union([
  z.string().min(1),
  z.strictObject({
    text: md("Main line"),
    detail: optMd("Smaller secondary line"),
    icon: IconSchema.optional(),
  }),
]);

const TitleSlide = z.strictObject({
  type: z.literal("title"),
  ...base,
  eyebrow,
  title: md("Huge headline, ≤ 7 words. Use \\n for a deliberate line break and ++text++ for gradient."),
  subtitle: optMd("One supporting sentence"),
  meta: optMd("Small footer line: author, date, course"),
  image: ImageSchema.optional().describe("Hero visual (photo or illustration)"),
  icon: IconSchema.optional().describe("Big floating hero icon (great with fluent-emoji:*)"),
  align: z.enum(["center", "left"]).optional(),
});

const SectionSlide = z.strictObject({
  type: z.literal("section"),
  ...base,
  number: z.union([z.string(), z.number()]).optional().describe("Chapter number; auto-numbered if omitted"),
  eyebrow,
  title: md("Chapter title"),
  subtitle: optMd("One line teaser"),
  icon: IconSchema.optional(),
  image: ImageSchema.optional(),
});

const StatementSlide = z.strictObject({
  type: z.literal("statement"),
  ...base,
  kicker: optMd("Small lead-in line above the statement"),
  text: md("One big idea, ≤ 20 words. Highlight a key phrase with ++gradient++ or ==marker=="),
  by: optMd("Attribution or source"),
  effect: z
    .enum(["words", "spotlight", "fade"])
    .optional()
    .describe("words = blur-in word by word (default); spotlight = dim words light up in reading order"),
  size: z.enum(["md", "lg", "xl"]).optional(),
});

const BulletsSlide = z.strictObject({
  type: z.literal("bullets"),
  ...base,
  eyebrow,
  title: md("Slide title"),
  subtitle: optMd("Short lead sentence"),
  items: z.array(BulletItem).min(1).max(8).describe("2–5 items is ideal; each ≤ 12 words"),
  steps: z.boolean().optional().describe("Reveal items one by one on → (Keynote builds)"),
  columns: z.union([z.literal(1), z.literal(2)]).optional(),
  image: ImageSchema.optional().describe("Optional visual on the right"),
  icon: IconSchema.optional().describe("Optional large icon on the right (used if no image)"),
});

const CodeObject = z
  .strictObject({
    lang: z
      .string()
      .optional()
      .describe(
        "python, javascript, typescript, java, c, cpp, csharp, go, rust, sql, html, css, bash, json, yaml… (defaults from file extension when file is used, otherwise text)",
      ),
    code: z.string().min(1).optional().describe("Source code string"),
    file: z.string().min(1).optional().describe("Path relative to the deck folder, or absolute"),
    lines: z
      .string()
      .regex(/^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/, 'lines like "129-161" or "129-140,147-161"')
      .optional()
      .describe('1-based line ranges to quote, e.g. "129-161" or "129-140,147-161" (default: whole file)'),
    dedent: z.boolean().default(true).describe("Remove common leading indentation from quoted lines (default true)"),
    filename: z.string().optional().describe("Window title, e.g. main.py (defaults to file basename when file is used)"),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.file), {
    message: "code requires exactly one of `code` (inline string) or `file` (path to source file)",
  });

const SplitSlide = z.strictObject({
  type: z.literal("split"),
  ...base,
  eyebrow,
  title: md("Title"),
  text: optMd("Paragraph (≤ 45 words). **bold** words appear brighter."),
  items: z.array(BulletItem).max(6).optional(),
  image: ImageSchema.optional(),
  icon: IconSchema.optional(),
  code: CodeObject.optional().describe("Show a code window as the media"),
  side: z.enum(["left", "right"]).optional().describe("Which side the media sits on (default right)"),
});

const ImageSlide = z.strictObject({
  type: z.literal("image"),
  ...base,
  image: ImageSchema,
  eyebrow,
  title: optMd("Overlay title"),
  caption: optMd("Overlay caption"),
  place: z.enum(["bottom-left", "bottom", "center", "top-left", "left"]).optional(),
  overlay: z.enum(["dark", "light", "none"]).optional(),
  kenburns: z.boolean().optional().describe("Slow cinematic zoom (default true)"),
  zoom: z
    .array(
      z.strictObject({
        x: z.number().min(0).max(100).describe("Focus point, % from left"),
        y: z.number().min(0).max(100).describe("Focus point, % from top"),
        scale: z.number().min(1.1).max(6).optional().describe("Zoom factor (default 2.4)"),
        title: optMd("Caption title for this detail"),
        text: optMd("One line about this detail"),
      }),
    )
    .max(6)
    .optional()
    .describe("Camera moves: each → glides into a detail of the photo with its caption (Apple product-page style)"),
});

const BentoCard = z.strictObject({
  title: md("Card title (≤ 5 words)"),
  text: optMd("One short sentence"),
  icon: IconSchema.optional(),
  image: ImageSchema.optional(),
  stat: z.union([z.string(), z.number()]).optional().describe("Big number/word shown huge in the card"),
  size: z.enum(["sm", "wide", "tall", "lg"]).optional().describe("Grid span; give the most important card 'lg' or 'wide'"),
  accent: AccentSchema.optional(),
});

const BentoSlide = z.strictObject({
  type: z.literal("bento"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  subtitle: optMd("Lead"),
  cards: z.array(BentoCard).min(2).max(7),
});

const Stat = z.strictObject({
  value: z.union([z.number(), z.string()]).describe("Numbers count up; strings are shown as-is"),
  prefix: z.string().optional(),
  suffix: z.string().optional().describe("e.g. '%', ' tỷ', '×'"),
  decimals: z.number().int().min(0).max(4).optional(),
  label: md("What the number means"),
  detail: optMd("Tiny footnote"),
  icon: IconSchema.optional(),
});

const StatsSlide = z.strictObject({
  type: z.literal("stats"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  stats: z.array(Stat).min(1).max(4),
  source: optMd("Data source"),
});

const QuoteSlide = z.strictObject({
  type: z.literal("quote"),
  ...base,
  quote: md("The quote (≤ 30 words)"),
  author: optMd("Who said it"),
  role: optMd("Their role / year"),
  image: ImageSchema.optional().describe("Portrait (shown as a circle)"),
});

const CodeStep = z.strictObject({
  lines: z
    .string()
    .regex(/^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/, 'lines like "1-3,5"')
    .describe('Lines to highlight, e.g. "2-4,7"'),
  text: optMd("Explanation shown while these lines are highlighted"),
});

const CodeSlide = z
  .strictObject({
    type: z.literal("code"),
    ...base,
    eyebrow,
    title: optMd("Title"),
    lang: z
      .string()
      .optional()
      .describe(
        "python, javascript, typescript, java, c, cpp, csharp, go, rust, sql, html, css, bash, json, yaml… (defaults from file extension when file is used, otherwise text)",
      ),
    code: z.string().min(1).optional().describe("Source code (keep it ≤ 18 lines; no horizontal scrolling)"),
    file: z.string().min(1).optional().describe("Path relative to the deck folder, or absolute"),
    lines: z
      .string()
      .regex(/^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/, 'lines like "129-161" or "129-140,147-161"')
      .optional()
      .describe('1-based line ranges to quote, e.g. "129-161" or "129-140,147-161" (default: whole file)'),
    dedent: z.boolean().default(true).describe("Remove common leading indentation from quoted lines (default true)"),
    filename: optMd("Window title, e.g. main.py (defaults to file basename when file is used)"),
    text: optMd("Explanation beside the code"),
    steps: z.array(CodeStep).max(10).optional().describe("Walk through the code: each → highlights lines and swaps the explanation"),
    output: optMd("Terminal output shown under the code"),
  })
  .refine((v) => Boolean(v.code) !== Boolean(v.file), {
    message: "code slide requires exactly one of `code` (inline string) or `file` (path to source file)",
  });

const TimelineSlide = z.strictObject({
  type: z.literal("timeline"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  events: z
    .array(z.strictObject({ when: md("Date/label"), title: md("Event"), text: optMd("One line"), icon: IconSchema.optional() }))
    .min(2)
    .max(7),
  steps: z.boolean().optional(),
});

const ProcessItem = z.strictObject({ title: md("Step title"), text: optMd("One line"), icon: IconSchema.optional() });

const StepsSlide = z.strictObject({
  type: z.literal("steps"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  items: z.array(ProcessItem).min(2).max(6),
  steps: z.boolean().optional().describe("Reveal steps one by one"),
});

const CycleSlide = z.strictObject({
  type: z.literal("cycle"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  center: optMd("Label in the middle of the cycle"),
  centerIcon: IconSchema.optional(),
  items: z.array(ProcessItem).min(3).max(8),
  steps: z.boolean().optional(),
});

const CompareColumn = z.strictObject({
  title: md("Column title"),
  subtitle: optMd("Small line under the title"),
  icon: IconSchema.optional(),
  items: z.array(z.string().min(1)).min(1).max(6),
  tone: z.enum(["good", "bad", "neutral", "accent"]).optional().describe("good = ✓ bullets, bad = ✕ bullets"),
  highlight: z.boolean().optional().describe("Emphasize this column"),
});

const CompareSlide = z.strictObject({
  type: z.literal("compare"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  columns: z.array(CompareColumn).min(2).max(3),
  vs: z.boolean().optional().describe("Show a VS badge between two columns"),
});

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const TableSlide = z.strictObject({
  type: z.literal("table"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  headers: z.array(z.string()).min(2).max(6),
  rows: z.array(z.array(Cell)).min(1).max(8).describe("true/false render as ✓ / ✕"),
  highlight: z.number().int().min(0).optional().describe("Column index to emphasize"),
});

const QuizOption = z.union([
  z.string().min(1),
  z.strictObject({ text: md("Option"), correct: z.boolean().optional(), explain: optMd("Why this option is right/wrong") }),
]);

const QuizSlide = z.strictObject({
  type: z.literal("quiz"),
  ...base,
  eyebrow,
  question: md("Question"),
  options: z.array(QuizOption).min(2).max(6),
  answer: z
    .union([z.number().int().min(0), z.array(z.number().int().min(0)).min(1)])
    .optional()
    .describe("0-based index (or indices) of the correct option(s); or mark options with correct:true"),
  explanation: optMd("Shown after answering"),
  image: ImageSchema.optional(),
  icon: IconSchema.optional(),
});

const FlashcardsSlide = z.strictObject({
  type: z.literal("flashcards"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  cards: z
    .array(z.strictObject({ front: md("Prompt / term"), back: md("Answer"), icon: IconSchema.optional(), hint: optMd("Hint") }))
    .min(1)
    .max(6),
});

const ClozeSlide = z.strictObject({
  type: z.literal("cloze"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  text: md("Sentence(s) with [[blanks]]: 'Quang hợp diễn ra ở [[lục lạp]].' Each → reveals the next blank."),
  hint: optMd("Hint line"),
});

const ChartSlide = z
  .strictObject({
    type: z.literal("chart"),
    ...base,
    eyebrow,
    title: optMd("Title"),
    subtitle: optMd("Takeaway sentence — say what the chart proves"),
    kind: z.enum(["bar", "hbar", "line", "area", "donut"]),
    labels: z.array(z.string()).min(1).max(12),
    series: z
      .array(z.strictObject({ name: z.string().optional(), values: z.array(z.number()).min(1), color: z.string().optional() }))
      .min(1)
      .max(4),
    unit: z.string().optional().describe("Suffix for values, e.g. '%'"),
    max: z.number().optional(),
    highlight: z.number().int().min(0).optional().describe("Index of the label to emphasize"),
    note: optMd("Source / footnote"),
  })
  .superRefine((s, ctx) => {
    s.series.forEach((ser, i) => {
      if (ser.values.length !== s.labels.length) {
        ctx.addIssue({
          code: "custom",
          path: ["series", i, "values"],
          message: `series[${i}] has ${ser.values.length} values but there are ${s.labels.length} labels`,
        });
      }
    });
  });

const FormulaSlide = z.strictObject({
  type: z.literal("formula"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  formula: md("LaTeX (no $ delimiters), e.g. 'E = mc^2'"),
  legend: z
    .array(z.strictObject({ symbol: md("LaTeX symbol, e.g. 'm'"), meaning: md("Meaning") }))
    .max(6)
    .optional(),
  text: optMd("One-line interpretation"),
});

const DefinitionSlide = z.strictObject({
  type: z.literal("definition"),
  ...base,
  term: md("Term"),
  phonetic: optMd("Pronunciation, e.g. /ˌfəʊtəʊˈsɪnθəsɪs/"),
  kind: optMd("Part of speech or category, e.g. 'danh từ'"),
  definition: md("Definition (≤ 30 words)"),
  example: optMd("Example usage"),
  related: z.array(z.string()).max(6).optional(),
  icon: IconSchema.optional(),
  image: ImageSchema.optional(),
});

const HotspotsSlide = z.strictObject({
  type: z.literal("hotspots"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  image: ImageSchema,
  points: z
    .array(
      z.strictObject({
        x: z.number().min(0).max(100).describe("% from left"),
        y: z.number().min(0).max(100).describe("% from top"),
        label: md("Label"),
        text: optMd("Explanation"),
      }),
    )
    .min(1)
    .max(8),
  steps: z.boolean().optional().describe("Reveal points one by one (default true)"),
});

const AgendaSlide = z.strictObject({
  type: z.literal("agenda"),
  ...base,
  eyebrow,
  title: optMd("Title (default: 'Nội dung')"),
  items: z.array(z.string()).max(8).optional().describe("Omit to auto-list the deck's section slides"),
  current: z.number().int().min(0).optional().describe("Index of the item to highlight"),
});

const SummarySlide = z.strictObject({
  type: z.literal("summary"),
  ...base,
  eyebrow,
  title: md("Title, e.g. 'Ghi nhớ'"),
  items: z.array(z.string().min(1)).min(1).max(7),
  score: z.boolean().optional().describe("Show the learner's quiz score ring (default: true when the deck has quizzes)"),
});

const VideoSlide = z.strictObject({
  type: z.literal("video"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  src: md("YouTube/Vimeo URL or a video file path/URL"),
  caption: optMd("Caption"),
  poster: z.string().optional(),
});

const HtmlSlide = z.strictObject({
  type: z.literal("html"),
  ...base,
  html: md('Custom HTML for the slide body. Add data-a="rise|blur|scale|pop|words|wipe" and data-d="ms" to animate.'),
  css: z.string().optional().describe("Extra CSS scoped to this slide (use & for the slide root)"),
});

const NoteLine = z.union([
  z
    .string()
    .min(1)
    .describe("A line to copy (markup allowed). Prefix '# ' = sub-heading, '= ' = formula line (LaTeX), '! ' = must-remember line, '@ ' = memory anchor (the hook, written in the margin)"),
  z.strictObject({ term: md("Term"), def: md("Its definition") }),
]);

const NotebookSlide = z.strictObject({
  type: z.literal("notebook"),
  ...base,
  eyebrow,
  title: md("What this page of notes covers, e.g. 'Pha sáng'"),
  lines: z.array(NoteLine).min(1).max(10).describe("2–8 short lines worth copying into a paper notebook"),
  steps: z.boolean().optional().describe("Reveal lines one by one so the learner can write at their own pace (default true)"),
  page: z.string().optional().describe("Small page label in the corner, e.g. 'Bài 12' or a date"),
});

const ExplodeLayer = z.strictObject({
  label: md("Part name"),
  text: optMd("One line about this part"),
  icon: IconSchema.optional().describe("Icon printed on the part's plate"),
  image: ImageSchema.optional().describe("Picture of this part laid on its plate (cut-out PNG/SVG or a top-down photo)"),
  color: z.string().optional().describe("Plate color (CSS); default: shades of the accent"),
});

const ExplodeSlide = z.strictObject({
  type: z.literal("explode"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  subtitle: optMd("One supporting line"),
  image: ImageSchema.optional().describe("The whole object shown first; the camera zooms into it before its parts separate"),
  layers: z.array(ExplodeLayer).min(2).max(7).describe("Parts from top to bottom (2–7)"),
  focus: z.boolean().optional().describe("After exploding, spotlight each part in turn (default true)"),
});

const ExerciseSlide = z.strictObject({
  type: z.literal("exercise"),
  ...base,
  eyebrow,
  title: optMd("Exercise title, e.g. 'Bài tập 2'"),
  level: z.enum(["easy", "medium", "hard"]).optional().describe("Difficulty shown as 1–3 dots"),
  problem: md("The task statement ($math$ and markup allowed)"),
  code: CodeObject.optional().describe("Starter code or data shown under the problem"),
  time: z.number().int().min(10).max(3600).optional().describe("Seconds to try alone first; shows a timer the learner can start"),
  hints: z.array(md("Hint")).max(4).optional().describe("Revealed one per → before the solution"),
  solution: z.array(md("Solution step")).max(8).optional().describe("Worked solution, revealed one step per →"),
  answer: optMd("Final answer, revealed last"),
});

const PredictSlide = z
  .strictObject({
    type: z.literal("predict"),
    ...base,
    eyebrow,
    title: md("Title"),
    question: md("What the learner must predict"),
    lang: z
      .string()
      .optional()
      .describe(
        "python, javascript, typescript, java, c, cpp, csharp, go, rust, sql, html, css, bash, json, yaml… (defaults from file extension when file is used, otherwise text)",
      ),
    code: z.string().min(1).optional().describe("Source code string (≤ 18 lines)"),
    file: z.string().min(1).optional().describe("Path relative to the deck folder, or absolute"),
    lines: z
      .string()
      .regex(/^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/, 'lines like "129-161" or "129-140,147-161"')
      .optional()
      .describe('1-based line ranges to quote, e.g. "129-161" or "129-140,147-161" (default: whole file)'),
    dedent: z.boolean().default(true).describe("Remove common leading indentation from quoted lines (default true)"),
    filename: optMd("Window title, e.g. main.py (defaults to file basename when file is used)"),
    command: z.string().optional().describe("CLI command shown in the terminal, e.g. python script.py"),
    output: z.string().describe("Real program output, shown verbatim"),
    explain: md("Why the result is what it is"),
    hints: z.array(md("Hint")).max(3).optional().describe("Hints revealed before running (at most 3)"),
    input: z.boolean().optional().describe("Show the prediction textarea (default true)"),
  })
  .refine((v) => !(v.code && v.file), {
    message: "predict slide cannot specify both `code` and `file`",
  });

/* Memory anchors: tie each idea to something the learner already knows (a place, a picture, a system, a phrase). */

const PalaceStation = z.strictObject({
  place: md("A spot on a route the learner knows by heart, e.g. 'Cửa ra vào', 'Kệ giày', 'Ghế sofa'"),
  item: md("The idea stored at this spot (≤ 8 words), e.g. 'Chồng chập'"),
  hook: optMd("The vivid scene that ties the idea to the spot: concrete, exaggerated, moving, a bit absurd"),
  icon: IconSchema.optional().describe("Icon for the idea, shown on the map marker and in the card"),
  image: ImageSchema.optional().describe("Picture of the hook scene, shown in the card (a generated surreal picture works well)"),
  x: z.number().min(0).max(100).optional().describe("% from left on the palace image (set it when the slide has an image; auto-laid out on the drawn map)"),
  y: z.number().min(0).max(100).optional().describe("% from top on the palace image"),
});

const PalaceSlide = z
  .strictObject({
    type: z.literal("palace"),
    ...base,
    eyebrow,
    title: optMd("Name of the route, e.g. 'Một vòng quanh nhà'"),
    subtitle: optMd("One line: what this route stores"),
    image: ImageSchema.optional().describe("Wide picture of a familiar place (home, classroom, street). Without one a clean route map is drawn"),
    stations: z.array(PalaceStation).min(2).max(10).optional().describe("Stops in walking order, one idea each (5–9 is ideal)"),
    mode: z
      .enum(["learn", "recall"])
      .optional()
      .describe("learn (default) = walk the route and place each idea; recall = walk it again with the ideas hidden: each stop asks, the next → reveals, the learner rates Nhớ / Chưa nhớ"),
    from: z.string().optional().describe('id of a palace slide in this deck to reuse (image and stations), e.g. {"type": "palace", "from": "nha", "mode": "recall"} near the end'),
    zoom: z.number().min(1).max(4).optional().describe("Camera zoom at each stop (default 2 with an image, 1.6 on the drawn map)"),
  })
  .superRefine((s, ctx) => {
    if (!s.stations && !s.from) ctx.addIssue({ code: "custom", path: ["stations"], message: "palace needs `stations`, or `from` with the id of another palace slide" });
  });

const AnchorItem = z.strictObject({
  term: md("The idea to remember, e.g. 'Chồng chập'"),
  hook: optMd("The memorable picture in words: concrete, exaggerated, moving, e.g. 'Đồng xu quay tít: vừa sấp vừa ngửa'"),
  meaning: optMd("Plain one-line meaning"),
  image: ImageSchema.optional().describe("The anchor picture: one vivid subject, no text (generated, drawn or a photo)"),
  icon: IconSchema.optional().describe("Used when there is no image"),
});

const AnchorsSlide = z.strictObject({
  type: z.literal("anchors"),
  ...base,
  eyebrow,
  title: optMd("Title, e.g. 'Ba hình ảnh để nhớ'"),
  items: z.array(AnchorItem).min(1).max(6).describe("1–6 anchors (3–4 is ideal), revealed one per →"),
  recall: z.boolean().optional().describe("Review mode: show the pictures and hooks only; each → reveals the idea behind one picture"),
});

const AnalogySide = z.strictObject({
  label: md("Name"),
  icon: IconSchema.optional(),
  image: ImageSchema.optional(),
});

const AnalogySlide = z.strictObject({
  type: z.literal("analogy"),
  ...base,
  eyebrow,
  title: optMd("The analogy as a sentence, e.g. 'Qubit giống một đồng xu đang quay'"),
  known: AnalogySide.describe("The familiar thing the learner already understands"),
  concept: AnalogySide.describe("The new idea being anchored to it"),
  pairs: z
    .array(z.strictObject({ known: md("A part of the familiar thing"), concept: md("The matching part of the new idea"), note: optMd("Why they match") }))
    .min(1)
    .max(5)
    .describe("Corresponding parts, revealed one per →"),
  limit: optMd("Where the analogy breaks; always say it so the anchor does not mislead"),
  steps: z.boolean().optional().describe("Reveal one pair per → (default true)"),
});

const MnemonicSlide = z.strictObject({
  type: z.literal("mnemonic"),
  ...base,
  eyebrow,
  title: optMd("What it helps to remember, e.g. 'Ba giai đoạn của chu trình Calvin'"),
  phrase: optMd("The whole memorable line, e.g. 'Sin đi học, Cos không hư, Tan đoàn kết, Cot kết đoàn'"),
  items: z
    .array(
      z.strictObject({
        cue: md("A chunk of the phrase; put the letters that carry the meaning in **bold**, e.g. 'Sin **đ**i **h**ọc'"),
        text: md("What it stands for, with the same letters in bold, e.g. 'sin = **đ**ối / **h**uyền'"),
      }),
    )
    .min(2)
    .max(8),
  steps: z.boolean().optional().describe("Reveal one line per → (default true)"),
});

const DiagramSlide = z.strictObject({
  type: z.literal("diagram"),
  ...base,
  eyebrow,
  title: optMd("Title"),
  subtitle: optMd("One line: what the diagram shows"),
  code: md(
    "Mermaid code, drawn at build time and coloured by the theme: flowchart, mindmap, sequenceDiagram, stateDiagram-v2, classDiagram, erDiagram, " +
      "timeline, gantt, pie, quadrantChart, xychart, sankey, block… Vietnamese labels are fine; quote labels that contain punctuation: A[\"Pha sáng (thylakoid)\"]",
  ),
  text: optMd("Short explanation beside the diagram (≤ 40 words)"),
  items: z.array(BulletItem).max(5).optional().describe("Key points beside the diagram"),
  caption: optMd("One line under the diagram"),
  side: z.enum(["left", "right"]).optional().describe("Side of the text column when text/items are given (default left)"),
  look: z.enum(["classic", "handDrawn"]).optional().describe("handDrawn = sketchy whiteboard strokes (Excalidraw-like); default classic"),
  steps: z
    .boolean()
    .optional()
    .describe("Reveal the boxes one per → in the order they first appear in the code; arrows appear with their boxes (flowchart, state, class, ER, mindmap)"),
});

export const SlideSchema = z.discriminatedUnion("type", [
  TitleSlide,
  SectionSlide,
  StatementSlide,
  BulletsSlide,
  SplitSlide,
  ImageSlide,
  BentoSlide,
  StatsSlide,
  QuoteSlide,
  CodeSlide,
  TimelineSlide,
  StepsSlide,
  CycleSlide,
  CompareSlide,
  TableSlide,
  QuizSlide,
  FlashcardsSlide,
  ClozeSlide,
  ChartSlide,
  FormulaSlide,
  DefinitionSlide,
  HotspotsSlide,
  AgendaSlide,
  SummarySlide,
  VideoSlide,
  HtmlSlide,
  NotebookSlide,
  ExerciseSlide,
  PredictSlide,
  ExplodeSlide,
  PalaceSlide,
  AnchorsSlide,
  AnalogySlide,
  MnemonicSlide,
  DiagramSlide,
]);

export const SLIDE_TYPES: string[] = SlideSchema.options.map((o) => String(o.shape.type.value));

export const DeckSchema = z.strictObject({
  $schema: z.string().optional(),
  title: md("Deck title (browser tab + metadata)"),
  subtitle: z.string().optional(),
  author: z.string().optional(),
  lang: z.string().default("vi").describe("BCP-47 language of the content: the user's language (vi, en, ja…). Default vi"),
  theme: z.enum(THEMES).default("aurora"),
  accent: AccentSchema.optional(),
  background: BackgroundSchema.optional(),
  transition: z.enum(TRANSITIONS).default("fade"),
  font: z.enum(FONTS).default("vietnam").describe("vietnam = Be Vietnam Pro (default), inter = Inter, system = OS font (SF Pro on Apple)"),
  options: z
    .strictObject({
      progress: z.boolean().optional().describe("Thin progress bar (default true)"),
      controls: z.boolean().optional().describe("Floating glass control pill (default true)"),
      counter: z.boolean().optional().describe("Slide counter (default true)"),
      grain: z.boolean().optional().describe("Film-grain texture overlay (default true)"),
      parallax: z.boolean().optional().describe("Subtle pointer parallax on hero visuals (default true)"),
      magicMove: z.boolean().optional().describe("Morph identical titles/icons/images between consecutive slides (default true)"),
      loop: z.boolean().optional(),
      wheel: z.boolean().optional().describe("Mouse wheel / trackpad scroll moves through builds and slides (default true)"),
      resume: z.boolean().optional().describe("Offer to resume where the learner stopped (default true)"),
    })
    .optional(),
  slides: z.array(SlideSchema).min(1),
});

export type Deck = z.output<typeof DeckSchema>;
export type DeckInput = z.input<typeof DeckSchema>;
export type Slide = z.output<typeof SlideSchema>;
export type SlideType = Slide["type"];
export type SlideOf<T extends SlideType> = Extract<Slide, { type: T }>;
export type ImageInput = z.output<typeof ImageSchema>;
export type BackgroundInput = z.output<typeof BackgroundSchema>;
export type BulletItemInput = z.output<typeof BulletItem>;

export interface ValidationResult {
  ok: boolean;
  deck?: Deck;
  errors: string[];
}

/** Agent-friendly error lines like `slides[3] (bullets).items[0]: Invalid input`. */
export function validateDeck(raw: unknown): ValidationResult {
  const parsed = DeckSchema.safeParse(raw);
  if (parsed.success) return { ok: true, deck: parsed.data, errors: [] };
  const slides = (raw as { slides?: Array<{ type?: string }> } | null)?.slides;
  const typeAt = (i: unknown): string | undefined =>
    typeof i === "number" && Array.isArray(slides) ? slides[i]?.type : undefined;
  const issues = parsed.error.issues;
  const errors = issues.slice(0, 25).map((issue) => {
    let where = "";
    issue.path.forEach((seg, i) => {
      if (typeof seg === "number") {
        where += `[${seg}]`;
        if (i === 1 && issue.path[0] === "slides") {
          const t = typeAt(seg);
          if (t) where += ` (${t})`;
        }
      } else where += where ? `.${String(seg)}` : String(seg);
    });
    let msg = issue.message;
    if (issue.code === "unrecognized_keys" && (issue.path[0] === "slides" || issue.path.length === 0)) {
      const t = issue.path.length ? typeAt(issue.path[1]) : "deck";
      const allowed = issue.path.length ? allowedKeys(t) : Object.keys(DeckSchema.shape);
      const keys = (issue as { keys?: string[] }).keys ?? [];
      const hints = keys.map((k) => [k, closest(k, allowed)] as const).filter(([, s]) => s);
      if (hints.length) msg += ` (did you mean ${hints.map(([k, s]) => `"${s}" for "${k}"`).join(", ")}?)`;
      if (allowed.length) msg += ` — allowed keys for "${t}": ${allowed.join(", ")}`;
    }
    const isTypeIssue =
      issue.path[0] === "slides" &&
      (issue.path.length === 2 || (issue.path.length === 3 && issue.path[2] === "type")) &&
      (issue.code === "invalid_union" || /discriminator/i.test(issue.message));
    if (isTypeIssue) {
      const t = typeAt(issue.path[1]);
      const guess = t ? closest(t, SLIDE_TYPES) : undefined;
      msg = SLIDE_TYPES.includes(t ?? "")
        ? `Invalid "${t}" slide: ${msg}`
        : `Unknown slide type "${t ?? "(missing)"}".${guess ? ` Did you mean "${guess}"?` : ""} Use one of: ${SLIDE_TYPES.join(", ")}`;
      where = where.replace(/\.type$/, "");
    }
    return `${where || "(root)"}: ${msg}`;
  });
  if (issues.length > 25) errors.push(`…and ${issues.length - 25} more issues`);
  return { ok: false, errors };
}

/** Closest candidate by edit distance (typos like "subtitel", "bulets"), or undefined if nothing is near. */
function closest(word: string, candidates: string[]): string | undefined {
  const w = word.toLowerCase();
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const a = w;
    const b = c.toLowerCase();
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    const d = row[b.length]!;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= Math.max(2, Math.floor(w.length / 3)) ? best : undefined;
}

function allowedKeys(type: string | undefined): string[] {
  const opt = SlideSchema.options.find((o) => o.shape.type.value === type);
  return opt ? Object.keys(opt.shape) : [];
}

/* ───────────────────────── Courses ───────────────────────── */

export const CourseLessonSchema = z.strictObject({
  title: md("Lesson title, e.g. 'Cổng lượng tử'"),
  summary: optMd("One line: what this lesson covers"),
  when: optMd("When this lesson takes place, e.g. 'Tuần 2 · Thứ Ba 20/10'"),
  dir: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/, "dir is a plain folder name like 02-cong-luong-tu")
    .optional()
    .describe("Folder name of this lesson inside the course (default: 01-<slug>, 02-<slug>, …)"),
  icon: IconSchema.optional(),
  theme: z.enum(THEMES).optional().describe("Theme of this lesson's deck; give each lesson its own look"),
  accent: AccentSchema.optional(),
  minutes: z.number().int().min(1).max(240).optional().describe("Estimated study time"),
});

export const CourseSchema = z.strictObject({
  $schema: z.string().optional(),
  title: md("Course title, e.g. 'Máy tính lượng tử'"),
  subtitle: optMd("One line promise of the course"),
  author: z.string().optional(),
  lang: z.string().default("vi"),
  theme: z.enum(THEMES).default("midnight").describe("Theme of the course home page"),
  accent: AccentSchema.optional(),
  font: z.enum(FONTS).default("vietnam"),
  lessons: z.array(CourseLessonSchema).min(1).max(40).describe("Small lessons in study order; each becomes its own deck"),
});

export type Course = z.output<typeof CourseSchema>;
export type CourseLesson = z.output<typeof CourseLessonSchema>;

export function validateCourse(raw: unknown): { ok: boolean; course?: Course; errors: string[] } {
  const parsed = CourseSchema.safeParse(raw);
  if (parsed.success) return { ok: true, course: parsed.data, errors: [] };
  return {
    ok: false,
    errors: parsed.error.issues.slice(0, 20).map((i) => `${i.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`)).join("").replace(/^\./, "") || "(root)"}: ${i.message}`),
  };
}

export function deckJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DeckSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
}