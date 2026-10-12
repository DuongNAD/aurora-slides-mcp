/**
 * One entry per slide type: when to use it and a complete, valid example.
 * Feeds aurora_guide and the showcase deck (which doubles as a visual test).
 */
import type { SlideType } from "./schema.js";

export interface CatalogEntry {
  use: string;
  example: Record<string, unknown>;
}

export const CATALOG: Record<SlideType, CatalogEntry> = {
  title: {
    use: "Opening hero. Headline ≤ 7 words (\\n for a line break, ++word++ for gradient), one subtitle sentence. A large duotone icon (painted with the theme gradient, with optional motion) or a photo adds presence. Optional scene or motion overrides the default.",
    example: {
      type: "title",
      eyebrow: "Sinh học 10 · Bài 12",
      title: "Quang hợp:\n++bếp ăn++ của lá cây",
      subtitle: "Cây biến ánh sáng, nước và CO₂ thành đường và oxy như thế nào?",
      meta: "Tự học · 15 phút",
      icon: "ph:plant-duotone",
    },
  },
  agenda: {
    use: "Table of contents. Omit items to list the deck's section slides automatically; repeat it before each section to show progress (the next section is highlighted).",
    example: { type: "agenda", title: "Hôm nay mình học gì?" },
  },
  section: {
    use: "Chapter divider with a huge auto number. Resets attention every 4–7 slides. Optional scene overrides the backdrop for this section and subsequent slides.",
    example: { type: "section", title: "Pha sáng", subtitle: "Lá cây thu năng lượng từ ánh sáng", icon: "solar:sun-2-bold-duotone" },
  },
  statement: {
    use: "One big idea in one sentence (≤ 20 words). kicker (alias: eyebrow) for a lead-in line. Use after a section, as a hook, or to state a rule. effect: spotlight lights words up in reading order.",
    example: {
      type: "statement",
      kicker: "Ý chính",
      text: "Cây không ăn đất: chúng ++tự nấu thức ăn++ từ ==ánh sáng, nước và CO₂==.",
      effect: "spotlight",
    },
  },
  bullets: {
    use: "2–5 short points (≤ 12 words each, details in `detail`). steps:true reveals them one by one. Add icons, or an image/icon on the right.",
    example: {
      type: "bullets",
      eyebrow: "Nguyên liệu",
      title: "Cây cần gì để quang hợp?",
      items: [
        { text: "Ánh sáng mặt trời", detail: "Nguồn năng lượng cho cả quá trình", icon: "solar:sun-bold-duotone" },
        { text: "Nước (H₂O)", detail: "Rễ hút lên, đi theo mạch gỗ tới lá", icon: "solar:waterdrops-bold-duotone" },
        { text: "Khí CO₂", detail: "Đi vào lá qua khí khổng", icon: "solar:wind-bold-duotone" },
      ],
      steps: true,
    },
  },
  split: {
    use: "Text beside a visual (photo, icon or a code window). The workhorse for explaining one concept with a picture.",
    example: {
      type: "split",
      eyebrow: "Bào quan",
      title: "Lục lạp: nhà máy xanh",
      text: "Mỗi tế bào lá có **20–100 lục lạp**. Bên trong, các túi **thylakoid** xếp chồng thành grana, nơi diệp lục bắt ánh sáng.",
      items: ["Màng kép bao bọc", "Có DNA riêng", "Chất nền stroma chứa enzyme"],
      image: { query: "chloroplast plant cell microscope", alt: "Lục lạp dưới kính hiển vi" },
    },
  },
  image: {
    use: "Full-bleed cinematic photo with an overlay title (Ken Burns zoom). Add `zoom` steps to glide the camera into details of the photo, each with a caption, like Apple's product close-ups.",
    example: {
      type: "image",
      image: { query: "green leaf veins macro", alt: "Gân lá cận cảnh" },
      eyebrow: "Nhìn gần hơn",
      title: "Mạng lưới ++mạch dẫn++",
      caption: "Mỗi chiếc lá là một hệ thống ống dẫn thu nhỏ.",
      zoom: [
        { x: 50, y: 52, scale: 2.2, title: "Gân chính", text: "Dẫn nước lên và đưa đường đi khắp cây" },
        { x: 72, y: 34, scale: 3, title: "Gân phụ", text: "Phân nhánh tới từng nhóm tế bào" },
      ],
    },
  },
  bento: {
    use: "Apple-style bento grid of 2–7 cards: an overview of parts, features or facts. The first card is the hero (largest); a card can show a big `stat`.",
    example: {
      type: "bento",
      eyebrow: "Bên trong chiếc lá",
      title: "Những nhân vật chính",
      cards: [
        { title: "Diệp lục", text: "Sắc tố hấp thụ ánh sáng đỏ và xanh lam, phản xạ màu xanh lục.", icon: "ph:leaf-duotone" },
        { title: "Khí khổng", text: "Cửa cho CO₂ vào, O₂ ra.", icon: "ph:wind-duotone" },
        { title: "Thylakoid", text: "Màng chứa chuỗi chuyền electron.", icon: "ph:stack-duotone" },
        { title: "Stroma", text: "Nơi diễn ra chu trình Calvin.", icon: "ph:drop-duotone" },
        { title: "Hiệu suất", stat: "1–2%", text: "Năng lượng ánh sáng thành hoá năng." },
      ],
    },
  },
  stats: {
    use: "1–4 key numbers that count up. Each needs a plain-language label; add a source.",
    example: {
      type: "stats",
      title: "Quang hợp qua những con số",
      stats: [
        { value: 6, label: "phân tử CO₂ cho mỗi phân tử glucose", icon: "ph:atom-duotone" },
        { value: 680, suffix: " nm", label: "bước sóng hấp thụ của tâm phản ứng PSII", icon: "ph:sun-duotone" },
        { value: 3, label: "ATP cho mỗi CO₂ được cố định", icon: "ph:lightning-duotone" },
      ],
      source: "Campbell Biology, 12th ed.",
    },
  },
  quote: {
    use: "A memorable quote (≤ 30 words) with author and role; optional portrait image.",
    example: {
      type: "quote",
      quote: "Không có gì trong sinh học có ý nghĩa nếu không được soi sáng bởi tiến hoá.",
      author: "Theodosius Dobzhansky",
      role: "Nhà di truyền học, 1973",
    },
  },
  code: {
    use: "macOS-style code window with Xcode-like highlighting. ≤ 18 lines, ≤ 60 columns. `steps` walk through lines with explanations; `output` shows a terminal pane.",
    example: {
      type: "code",
      eyebrow: "Mô phỏng",
      title: "Yếu tố giới hạn bằng Python",
      lang: "python",
      filename: "quang_hop.py",
      code:
        'def toc_do(anh_sang, co2, nhiet_do):\n    """Tốc độ quang hợp (đơn vị tương đối)."""\n    gioi_han = min(anh_sang, co2)\n    if nhiet_do > 40:\n        return 0  # enzyme biến tính\n    return round(gioi_han * 0.8, 1)\n\nprint(toc_do(anh_sang=90, co2=60, nhiet_do=28))',
      steps: [
        { lines: "3", text: "Tốc độ bị chặn bởi yếu tố **thiếu nhất** (định luật Liebig)." },
        { lines: "4-5", text: "Quá nóng thì enzyme RuBisCO mất hoạt tính." },
        { lines: "8", text: "Ánh sáng dư, CO₂ mới là giới hạn: kết quả **48.0**." },
      ],
      output: "48.0",
    },
  },
  timeline: {
    use: "2–7 dated events on a horizontal line (history, project phases). steps:true reveals events one by one.",
    example: {
      type: "timeline",
      eyebrow: "Lịch sử khám phá",
      title: "Từ cây liễu đến chu trình Calvin",
      events: [
        { when: "1648", title: "Van Helmont", text: "Cây lớn lên gần như không lấy gì từ đất" },
        { when: "1771", title: "Priestley", text: "Cây bạc hà làm không khí “sống” lại" },
        { when: "1779", title: "Ingenhousz", text: "Quá trình chỉ xảy ra khi có ánh sáng" },
        { when: "1950s", title: "Melvin Calvin", text: "Lần ra đường đi của carbon (Nobel 1961)" },
      ],
    },
  },
  steps: {
    use: "A linear process of 2–6 stages shown as numbered cards with arrows. steps:true builds them one at a time.",
    example: {
      type: "steps",
      eyebrow: "Pha sáng",
      title: "Từ photon đến ATP",
      items: [
        { title: "Hấp thụ ánh sáng", text: "Diệp lục bị kích thích, bật electron", icon: "ph:sun-duotone" },
        { title: "Quang phân li nước", text: "H₂O tách thành H⁺, electron và O₂", icon: "ph:drop-duotone" },
        { title: "Chuyền electron", text: "Bơm H⁺ vào lòng thylakoid", icon: "ph:lightning-duotone" },
        { title: "Tạo ATP, NADPH", text: "Nhiên liệu cho chu trình Calvin", icon: "ph:battery-charging-duotone" },
      ],
      steps: true,
    },
  },
  cycle: {
    use: "A loop of 3–8 stages around a center label (life cycles, feedback loops). Keep each title ≤ 4 words and text ≤ 10 words.",
    example: {
      type: "cycle",
      eyebrow: "Pha tối",
      title: "Chu trình Calvin",
      center: "Chu trình Calvin",
      centerIcon: "ph:arrows-clockwise-duotone",
      items: [
        { title: "Cố định CO₂", text: "RuBisCO gắn CO₂ vào RuBP" },
        { title: "Khử", text: "ATP + NADPH tạo G3P" },
        { title: "Xuất đường", text: "1 G3P rời chu trình tạo glucose" },
        { title: "Tái tạo RuBP", text: "Dùng ATP, chu trình lặp lại" },
      ],
    },
  },
  compare: {
    use: "2–3 columns side by side (A vs B, pros/cons). tone good/bad gives ✓/✕ marks; highlight one column; vs:true adds a VS badge.",
    example: {
      type: "compare",
      title: "Hai pha của quang hợp",
      vs: true,
      columns: [
        { title: "Pha sáng", subtitle: "Trên màng thylakoid", icon: "ph:sun-duotone", tone: "accent", items: ["Cần ánh sáng trực tiếp", "Phân li nước, giải phóng O₂", "Tạo ATP và NADPH"] },
        { title: "Pha tối", subtitle: "Trong chất nền stroma", icon: "ph:moon-stars-duotone", tone: "accent", items: ["Không cần ánh sáng trực tiếp", "Cố định CO₂ nhờ RuBisCO", "Dùng ATP, NADPH để tạo đường"] },
      ],
    },
  },
  table: {
    use: "Small comparison table (≤ 6 columns, ≤ 8 rows). true/false render as ✓/✕; highlight a column.",
    example: {
      type: "table",
      title: "Ba con đường cố định carbon",
      headers: ["", "C3", "C4", "CAM"],
      rows: [
        ["Ví dụ", "Lúa, đậu", "Ngô, mía", "Dứa, xương rồng"],
        ["Mở khí khổng", "Ban ngày", "Ban ngày", "Ban đêm"],
        ["Chịu hạn tốt", false, true, true],
        ["Hô hấp sáng", "Nhiều", "Gần như không", "Rất ít"],
      ],
      highlight: 2,
    },
  },
  quiz: {
    use: "Multiple choice (2–6 options) with instant feedback and an explanation; scores feed the summary ring. Several correct answers → checkbox mode. Keys 1–6 answer.",
    example: {
      type: "quiz",
      question: "Khí nào được giải phóng trong pha sáng?",
      options: ["CO₂", { text: "O₂", explain: "Sinh ra khi quang phân li nước." }, "N₂", "H₂"],
      answer: 1,
      explanation: "O₂ đến từ **quang phân li nước**: $\\ce{2H2O -> 4H+ + 4e- + O2}$.",
    },
  },
  flashcards: {
    use: "1–6 tap-to-flip cards for active recall of terms. Front = prompt, back = answer.",
    example: {
      type: "flashcards",
      title: "Lật thẻ để ôn",
      cards: [
        { front: "Diệp lục a", back: "Sắc tố chính, hấp thụ mạnh ánh sáng đỏ (~680 nm) và xanh lam.", icon: "ph:leaf-duotone" },
        { front: "RuBisCO", back: "Enzyme cố định CO₂, có lẽ là protein nhiều nhất Trái Đất.", icon: "ph:atom-duotone" },
        { front: "Stroma", back: "Chất nền của lục lạp, nơi diễn ra chu trình Calvin.", icon: "ph:drop-duotone" },
      ],
    },
  },
  srs: {
    use: "Spaced-repetition review card produced by Vega (FSRS memory engine). Centered glass card: front with optional hint -> flip to back with memory hook and origin -> rate Quên / Khó / Nhớ / Dễ (keys 1-4) to emit a card event and advance.",
    example: {
      type: "srs",
      card: "card-qa-101",
      eyebrow: "Ôn tập FSRS",
      front: "Lục lạp thực hiện quá trình gì trong tế bào thực vật?",
      back: "**Quang hợp**: Biến ánh sáng, nước và CO₂ thành glucose và oxy.",
      hint: "Quá trình này tạo ra màu xanh của lá cây.",
      hook: "Nhà máy năng lượng mặt trời thu nhỏ đặt trong lá cây.",
      origin: {
        label: "Sinh học 10 · Bài 12 · slide 3",
        href: "01-quang-hop/index.html#/3",
      },
    },
  },
  cloze: {
    use: "Fill-in-the-blank: write [[answer]] inside the text. Each → reveals the next blank; learners can also tap a blank.",
    example: {
      type: "cloze",
      title: "Điền vào chỗ trống",
      text: "Pha sáng diễn ra trên màng [[thylakoid]], còn chu trình Calvin diễn ra trong [[chất nền stroma]]. Sản phẩm của pha sáng là [[ATP]] và [[NADPH]].",
      hint: "Nghĩ về cấu trúc bên trong lục lạp.",
    },
  },
  chart: {
    use: "bar, hbar, line, area or donut chart with animated drawing. The subtitle must state the takeaway; highlight the key label.",
    example: {
      type: "chart",
      eyebrow: "Thí nghiệm",
      title: "Ánh sáng tăng, quang hợp tăng… đến một ngưỡng",
      subtitle: "Sau khoảng 800 đơn vị, đường cong gần như bão hoà.",
      kind: "area",
      labels: ["0", "200", "400", "600", "800", "1000"],
      series: [{ name: "Tốc độ quang hợp", values: [0, 38, 62, 76, 82, 84] }],
      highlight: 4,
      note: "Số liệu minh hoạ (đơn vị tương đối).",
    },
  },
  formula: {
    use: "A centered LaTeX formula with a legend of symbols and a one-line interpretation.",
    example: {
      type: "formula",
      title: "Phương trình tổng quát",
      formula: "\\ce{6CO2 + 6H2O ->[\\text{ánh sáng}] C6H12O6 + 6O2}",
      legend: [
        { symbol: "\\ce{CO2}", meaning: "Khí cacbonic" },
        { symbol: "\\ce{C6H12O6}", meaning: "Glucose" },
        { symbol: "\\ce{O2}", meaning: "Oxy, sản phẩm phụ" },
      ],
      text: "Sáu phân tử CO₂ và sáu phân tử nước tạo ra một phân tử đường.",
    },
  },
  definition: {
    use: "Dictionary-style card for a key term or vocabulary word: kind, pronunciation, definition, example, related words.",
    example: {
      type: "definition",
      term: "Photosynthesis",
      kind: "danh từ · noun",
      phonetic: "/ˌfəʊ.təʊˈsɪn.θə.sɪs/",
      definition: "Quá trình thực vật dùng năng lượng ánh sáng để tổng hợp chất hữu cơ từ CO₂ và nước.",
      example: "*Photosynthesis* releases oxygen into the air.",
      related: ["chlorophyll", "chloroplast", "glucose"],
      icon: "ph:leaf-duotone",
    },
  },
  hotspots: {
    use: "Numbered pins on an image (anatomy, diagrams, UI). x/y are % of the image; verify placement with aurora_screenshot. Pins reveal one per step.",
    example: {
      type: "hotspots",
      title: "Cấu tạo một chiếc lá",
      image: { query: "green leaf veins macro", alt: "Lá cây xanh cận cảnh" },
      points: [
        { x: 50, y: 48, label: "Phiến lá", text: "Bề mặt rộng để đón ánh sáng" },
        { x: 50, y: 24, label: "Gân chính", text: "Dẫn nước và chất dinh dưỡng" },
        { x: 70, y: 62, label: "Gân phụ", text: "Mạng lưới phân phối khắp lá" },
      ],
    },
  },
  summary: {
    use: "Closing takeaways (≤ 7) with check marks, plus the learner's quiz score ring when the deck has quizzes.",
    example: {
      type: "summary",
      title: "Ghi nhớ",
      items: [
        "Quang hợp: ánh sáng + nước + CO₂ → đường + O₂",
        "Pha sáng trên thylakoid tạo ATP, NADPH và O₂",
        "Chu trình Calvin trong stroma biến CO₂ thành đường",
        "Tốc độ bị giới hạn bởi yếu tố thiếu nhất",
      ],
    },
  },
  video: {
    use: "Embedded YouTube/Vimeo or a video file in a macOS window. YouTube needs http (use aurora_preview); from file:// it shows a poster that opens YouTube.",
    example: {
      type: "video",
      title: "Xem thêm: Crash Course",
      src: "https://www.youtube.com/watch?v=sQK3Yr4Sc_k",
      caption: "Photosynthesis: Crash Course Biology #8 (tiếng Anh)",
    },
  },
  explode: {
    use:
      "Apple product-page exploded view: the whole object (optional photo) → the camera zooms in → its 2–7 parts separate into a 3D stack with labels → each part is spotlighted. Scrolling scrubs the animation; → jumps stage by stage. Great for anatomy, devices, layered models (OSI, Earth, leaf tissue).",
    example: {
      type: "explode",
      eyebrow: "Nhìn vào bên trong",
      title: "Một chiếc lá có mấy lớp?",
      image: { query: "green leaf macro backlit", alt: "Lá cây xanh dưới ánh sáng" },
      layers: [
        { label: "Lớp cutin", text: "Lớp sáp mỏng chống mất nước", icon: "ph:drop-half-duotone" },
        { label: "Biểu bì trên", text: "Trong suốt, cho ánh sáng đi qua", icon: "ph:sun-dim-duotone" },
        { label: "Mô giậu", text: "Dày đặc lục lạp, quang hợp mạnh nhất", icon: "ph:leaf-duotone" },
        { label: "Mô xốp", text: "Khoang khí để trao đổi CO₂ và O₂", icon: "ph:wind-duotone" },
        { label: "Biểu bì dưới", text: "Có khí khổng đóng mở", icon: "ph:circles-three-duotone" },
      ],
    },
  },
  notebook: {
    use: "A ruled notebook page with the lines worth copying by hand, revealed one line per → so the learner can write along. Put one after each theory block. Prefix '# ' sub-heading, '= ' formula, '! ' must-remember; {term, def} for definitions.",
    example: {
      type: "notebook",
      title: "Quang hợp: những ý cần nhớ",
      page: "Sinh 10 · Bài 12",
      lines: [
        "# Khái niệm",
        { term: "Quang hợp", def: "dùng năng lượng ánh sáng tổng hợp chất hữu cơ từ CO₂ và H₂O" },
        "= \\ce{6CO2 + 6H2O -> C6H12O6 + 6O2}",
        "# Hai pha",
        "Pha sáng (thylakoid): tạo ATP, NADPH, giải phóng O₂",
        "Pha tối (stroma): chu trình Calvin cố định CO₂ thành đường",
        "! O₂ sinh ra từ nước, không phải từ CO₂",
        "@ Calvin: con kiến tha mồi = cố định, khử, tái sinh",
      ],
    },
  },
  palace: {
    use:
      "Memory palace (method of loci): the learner walks a route they know by heart (their home, the way to school) and leaves one idea at each stop as a vivid scene. " +
      "The camera glides from stop to stop along a drawn path, a card with a leader line shows the idea; scrolling scrubs the walk. Without an image a clean route map is drawn; " +
      'with a picture of the place, give every station x/y. Later in the lesson reuse it with {"type": "palace", "from": "<id>", "mode": "recall"}: ideas hidden, each → reveals one, the learner rates Nhớ / Chưa nhớ.',
    example: {
      type: "palace",
      id: "pha-sang",
      title: "Pha sáng:\nmột vòng quanh nhà",
      subtitle: "Sáu bước, sáu chỗ quen thuộc trong nhà bạn",
      stations: [
        { place: "Cửa ra vào", item: "Diệp lục hấp thụ ánh sáng", hook: "Tấm thảm chùi chân màu xanh lá hút sạch nắng, nóng ran dưới chân", icon: "ph:sun-duotone" },
        { place: "Kệ giày", item: "Quang phân li nước", hook: "Đôi ủng đầy nước bỗng vỡ tung thành bọt khí O₂ bay lên trần nhà", icon: "ph:drop-duotone" },
        { place: "Ghế sofa", item: "Chuyền electron", hook: "Cả nhà ngồi trên sofa chuyền tay nhau một quả bóng tóe lửa điện", icon: "ph:lightning-duotone" },
        { place: "Tủ lạnh", item: "Bơm H⁺ vào thylakoid", hook: "Mở tủ lạnh ra, hàng trăm quả bóng chữ H bị nhồi chật cứng", icon: "ph:arrows-in-duotone" },
        { place: "Bếp", item: "ATP synthase tạo ATP", hook: "Cối xay gió tí hon trên bếp quay tít, nhả ra từng viên pin", icon: "ph:battery-charging-duotone" },
        { place: "Ban công", item: "Tạo NADPH", hook: "Xe tải nhỏ chở đầy electron đậu ngoài ban công, chờ chạy sang chu trình Calvin", icon: "ph:truck-duotone" },
      ],
    },
  },
  anchors: {
    use:
      "Picture anchors: each key idea gets one vivid, concrete picture plus a hook sentence (dual coding). One anchor per →. recall:true shows only the pictures and hooks " +
      "and reveals the ideas, for review later in the lesson or in the next one. A generated or drawn picture with one bold subject works best; icons are the fallback.",
    example: {
      type: "anchors",
      title: "Ba hình ảnh để nhớ lục lạp",
      items: [
        { term: "Thylakoid", hook: "Chồng đồng xu xanh lá, mỗi đồng là một tấm pin mặt trời", meaning: "Màng chứa diệp lục, nơi diễn ra pha sáng", icon: "ph:coins-duotone" },
        { term: "Stroma", hook: "Bể bơi đầy enzyme, đường được nấu ngay trong nước", meaning: "Chất nền, nơi chu trình Calvin diễn ra", icon: "ph:swimming-pool-duotone" },
        { term: "RuBisCO", hook: "Chú thợ chậm chạp nhưng đông nhất hành tinh", meaning: "Enzyme cố định CO₂, chậm nhưng cực nhiều", icon: "ph:person-simple-walk-duotone" },
      ],
    },
  },
  analogy: {
    use: "Anchor a new idea to a system the learner already knows: familiar thing ≈ new idea, matching parts one per →, and always the point where the comparison breaks (`limit`).",
    example: {
      type: "analogy",
      title: "Lục lạp giống một nhà máy điện mặt trời",
      known: { label: "Nhà máy điện mặt trời", icon: "ph:solar-panel-duotone" },
      concept: { label: "Lục lạp", icon: "ph:leaf-duotone" },
      pairs: [
        { known: "Tấm pin mặt trời", concept: "Màng thylakoid chứa diệp lục" },
        { known: "Bình ắc quy được sạc đầy", concept: "ATP" },
        { known: "Xe chở hàng", concept: "NADPH chở electron" },
        { known: "Xưởng lắp ráp", concept: "Chu trình Calvin trong stroma" },
      ],
      limit: "Nhà máy chỉ tạo ra điện; lục lạp còn dùng năng lượng đó để biến CO₂ thành đường.",
    },
  },
  diagram: {
    use:
      "Any diagram written in Mermaid code, drawn at build time and coloured by the theme: flowchart (processes, algorithms), mindmap (overview of a topic), " +
      "sequenceDiagram (protocols, who-talks-to-whom), stateDiagram-v2, classDiagram, erDiagram, timeline, gantt, pie, quadrantChart, xychart, sankey, block. " +
      "Boxes build in and arrows trace between them; steps:true reveals one box per → in the order they first appear in the code (messages one by one in a " +
      "sequence diagram). text/items add a side column; look:\"handDrawn\" gives sketchy whiteboard strokes. Keep it to ≤ 12 boxes with short labels.",
    example: {
      type: "diagram",
      eyebrow: "Sơ đồ",
      title: "Đường đi của năng lượng",
      code: "flowchart LR\n  A([Ánh sáng]) --> B[Diệp lục]\n  B --> C[Chuỗi chuyền electron]\n  C --> D[(ATP, NADPH)]\n  D --> E[Chu trình Calvin]\n  E --> F([Glucose])",
      caption: "Năng lượng ánh sáng được cất vào liên kết hoá học của đường.",
      steps: true,
    },
  },
  mnemonic: {
    use: "A memorable phrase whose chunks decode into the facts (acrostic, rhyme, the classic 'Sin đi học, Cos không hư…'). Bold the letters that carry the meaning in both cue and text. One row per →.",
    example: {
      type: "mnemonic",
      title: "Ba giai đoạn của chu trình Calvin",
      phrase: "**C**on **k**iến **t**ha mồi",
      items: [
        { cue: "**C**on", text: "**C**ố định CO₂: RuBisCO gắn CO₂ vào RuBP" },
        { cue: "**K**iến", text: "**K**hử: ATP và NADPH biến 3-PGA thành G3P" },
        { cue: "**T**ha mồi", text: "**T**ái sinh RuBP để chu trình quay tiếp" },
      ],
    },
  },
  exercise: {
    use: "Practice problem: statement (+ optional code/data), a timer to try alone first, then hints → worked solution steps → final answer, one per →. Order exercises easy → hard after the theory.",
    example: {
      type: "exercise",
      title: "Bài tập 1",
      level: "medium",
      problem: "Một cây hấp thụ **12 phân tử CO₂** để quang hợp. Cây tạo ra bao nhiêu phân tử **glucose** và giải phóng bao nhiêu phân tử **O₂**?",
      time: 120,
      hints: ["Viết phương trình tổng quát và nhìn hệ số của CO₂."],
      solution: [
        "Phương trình: $\\ce{6CO2 + 6H2O -> C6H12O6 + 6O2}$",
        "6 CO₂ tạo 1 glucose, nên 12 CO₂ tạo $12 \\div 6 = 2$ glucose",
        "Mỗi glucose đi kèm 6 O₂, nên giải phóng $2 \\times 6 = 12$ O₂",
      ],
      answer: "**2** phân tử glucose và **12** phân tử O₂",
    },
  },
  predict: {
    use: "Predict-then-run: the learner writes a prediction, runs the code in the slide's terminal, then compares; use it for traces, outputs and edge cases of code you just taught.",
    example: {
      type: "predict",
      eyebrow: "Dự đoán kết quả",
      title: "Hàm sorted() trong Python",
      question: "Đoạn code sau in ra gì trên màn hình?",
      lang: "python",
      code: "xs = [3, 1, 2]\nprint(sorted(xs), xs)",
      command: "python -c 'xs = [3, 1, 2]; print(sorted(xs), xs)'",
      output: "[1, 2, 3] [3, 1, 2]",
      explain: "Hàm `sorted()` trả về **danh sách mới** đã sắp xếp, không làm thay đổi danh sách gốc `xs` (khác với phương thức `xs.sort()` sắp xếp tại chỗ).",
      hints: ["`sorted()` và `.sort()` có điểm gì khác nhau?"],
    },
  },
  html: {
    use: "Escape hatch for a custom layout. Animate with data-a=\"rise|blur|scale|pop|zoom|fade\" and data-d=\"ms\"; style with css (use & for the slide root) and theme variables like var(--accent), var(--fg2).",
    example: {
      type: "html",
      html: '<div class="lab"><div class="lab-ring" data-a="scale"></div><h2 data-a="rise" data-d="200">Tự thiết kế layout riêng</h2><p data-a="rise" data-d="320">Dùng HTML và CSS khi các layout có sẵn chưa đủ.</p></div>',
      css: "& .lab{height:100%;display:grid;place-content:center;justify-items:center;text-align:center;gap:28px} & .lab-ring{width:220px;height:220px;border-radius:50%;background:conic-gradient(from 90deg,var(--accent),var(--accent2),var(--accent));-webkit-mask:radial-gradient(circle,transparent 57%,#000 59%);mask:radial-gradient(circle,transparent 57%,#000 59%)} & h2{font-size:84px;letter-spacing:-.03em} & p{font-size:34px;color:var(--fg2)}",
    },
  },
  order: {
    use: "Put 3–7 items in the correct sequence (chronological, process steps, priority). Drag tiles or use Space/Enter and Arrow keys. Graded on check.",
    example: {
      type: "order",
      eyebrow: "Pha sáng",
      title: "Đường đi của electron trong pha sáng",
      subtitle: "Sắp xếp từ nơi electron xuất phát đến nơi nó dừng lại",
      items: [
        "Nước bị quang phân li, nhường electron",
        "Diệp lục P680 (quang hệ II) nhận electron",
        "Electron qua chuỗi chuyền đến quang hệ I",
        "NADP⁺ nhận electron, tạo NADPH",
      ],
      explanation: "Electron đi một chiều: từ nước, qua quang hệ II và chuỗi chuyền, sang quang hệ I rồi dừng ở NADPH. Ánh sáng kích thích hai quang hệ để đẩy electron đi tiếp.",
    },
  },
  match: {
    use: "Connect 2–6 pairs of related concepts (term ↔ definition, cause ↔ effect, problem ↔ solution). Click or drag between columns to connect. Graded on check.",
    example: {
      type: "match",
      eyebrow: "Nối cặp khái niệm",
      title: "Cấu trúc và chức năng trong lục lạp",
      pairs: [
        { left: "Màng thylakoid", right: "Nơi diễn ra pha sáng và chuỗi chuyền electron", icon: "ph:stack-duotone" },
        { left: "Chất nền stroma", right: "Nơi diễn ra chu trình Calvin cố định CO₂", icon: "ph:drop-duotone" },
        { left: "Khí khổng", right: "Cửa ngõ trao đổi khí CO₂ và thoát hơi nước", icon: "ph:wind-duotone" },
      ],
      explanation: "Thylakoid chứa sắc tố quang hợp cho pha sáng; stroma chứa enzyme cho pha tối; khí khổng điều tiết khí ra vào lá.",
    },
  },
  sort: {
    use: "Classify 4–12 items into 2–4 groups. Drag chips into bins, click chip then bin, or press keys 1–4. Graded on check.",
    example: {
      type: "sort",
      eyebrow: "Phân loại",
      title: "Phân loại các phản ứng quang hợp",
      subtitle: "Xếp mỗi sự kiện vào đúng pha tương ứng",
      groups: [
        {
          label: "Pha sáng",
          icon: "solar:sun-bold-duotone",
          items: ["Quang phân li nước", "Tổng hợp ATP nhờ ánh sáng", "Giải phóng khí O₂"],
        },
        {
          label: "Pha tối (chu trình Calvin)",
          icon: "solar:moon-stars-bold-duotone",
          items: ["Cố định CO₂ nhờ RuBisCO", "Tiêu thụ ATP và NADPH", "Tạo hợp chất G3P tổng hợp glucose"],
        },
      ],
      explanation: "Pha sáng cần ánh sáng trực tiếp trên màng thylakoid để tạo ATP và NADPH; pha tối dùng năng lượng đó trong stroma để biến CO₂ thành đường.",
    },
  },
  trace: {
    use:
      "Embeds a Mira trace player (sister project Mira): a self-contained player, built with mira_build from real Python, that steps through the code line by line " +
      "beside a visualisation and stops at prediction gates where the learner types what will happen. Use it after the theory and code slides of an algorithm " +
      "(loops, recursion, search, sorting), for 3-8 stops; mira_build prints a ready slide JSON, paste it. Give the slide an id: each prediction is relayed to the " +
      "progress log as a predict event with slideId <id>:mira-stop-<k> (Polaris error log, Vega cards). The player loads when the slide opens and keeps its " +
      "place; Esc inside it hands the keyboard back to the deck (the caption should say so). The player file is copied to assets/mira/ next to index.html: " +
      "keep that folder with the deck. A missing or non-Mira player only warns and shows a calm card; printing shows the title, caption and the player's path.",
    example: {
      type: "trace",
      id: "tim-kiem-nhi-phan",
      eyebrow: "Chạy từng dòng",
      title: "Tìm kiếm nhị phân qua từng bước",
      player: "mira/tim-kiem-nhi-phan/index.html",
      caption: "Ở mỗi điểm dừng, hãy đoán giá trị của mid trước khi bấm tiếp. Nhấn Esc để quay lại điều hướng slide.",
    },
  },
};

/** Showcase order: a coherent mini-lesson that exercises every layout. */
export const SHOWCASE_ORDER: SlideType[] = [
  "title", "agenda", "section", "statement", "bullets", "split", "image", "explode", "bento", "stats", "definition",
  "section", "steps", "diagram", "compare", "cycle", "formula", "code", "chart", "table", "timeline", "hotspots",
  "section", "palace", "analogy", "anchors", "mnemonic", "notebook",
  "section", "exercise", "predict", "order", "match", "sort", "quiz", "palace", "flashcards", "srs", "cloze", "quote", "video", "html", "summary",
];

export function showcaseDeck(theme = "aurora"): Record<string, unknown> {
  let sec = 0;
  let palaces = 0;
  const slides = SHOWCASE_ORDER.map((t) => {
    const ex = structuredClone(CATALOG[t].example);
    if (t === "section") {
      sec++;
      if (sec === 2) Object.assign(ex, { title: "Pha tối", subtitle: "Biến CO₂ thành đường trong stroma", icon: "solar:moon-stars-bold-duotone" });
      if (sec === 3) Object.assign(ex, { title: "Neo trí nhớ", subtitle: "Gắn mỗi ý vào một chỗ, một hình ảnh bạn đã quen", icon: "ph:anchor-simple-duotone", scene: "none" });
      if (sec === 4) Object.assign(ex, { title: "Thực hành", subtitle: "Làm bài từ dễ đến khó, rồi tự kiểm tra", icon: "ph:pencil-simple-line-duotone" });
    }
    // The second palace is the recall walk of the first one.
    if (t === "palace" && palaces++ > 0) return { type: "palace", from: "pha-sang", mode: "recall" };
    if (t === "cloze") {
      Object.assign(ex, {
        input: true,
        eyebrow: "Điền từ",
        text: "Pha sáng diễn ra trên màng [[thylakoid|mang thylakoid]], còn chu trình Calvin diễn ra trong [[chất nền stroma|stroma]].",
        explanation: "Pha sáng xảy ra tại màng thylakoid; pha tối (chu trình Calvin) xảy ra ở chất nền stroma.",
      });
    }
    return ex;
  });
  return { title: "Aurora Slides: showcase", author: "Aurora Slides", lang: "vi", theme, scene: "leaves", slides };
}
