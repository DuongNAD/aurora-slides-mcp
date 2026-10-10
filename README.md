# Aurora Slides MCP

MCP server để các AI coding agent (Google Antigravity, Claude Code, Cursor…) soạn **slide tự học đẹp như Apple Keynote**:
chữ lớn, kính mờ, nền cực quang trôi chậm, hiệu ứng lò xo, Magic Move, **exploded view kiểu trang giới thiệu Mac**
(vật thể nguyên vẹn → zoom vào → linh kiện tách lớp khi cuộn chuột), cùng các khối học tương tác: quiz, lật thẻ,
điền khuyết, **trang ghi vào vở**, **bài tập có bấm giờ** và **neo trí nhớ** (cung điện ký ức, neo hình ảnh, phép so sánh, mẹo nhớ).
Mỗi bài là **một file HTML tự chứa**: mở bằng trình duyệt là học được.

Thiết kế theo cách học **lý thuyết → neo trí nhớ → chép vào vở → thực hành → ôn lại**, và theo **khoá học chia nhỏ**:
một chủ đề lớn (ví dụ Máy tính lượng tử) tách thành nhiều bài nhỏ, **mỗi bài một phong cách riêng**, có trang chủ khoá học
theo dõi tiến độ.

Phiên bản hiện tại: **0.4.0**. Tác giả: **DuongNAD**.

## Điểm nổi bật

- **Agent tự vẽ ảnh, không tốn API key**: ảnh minh hoạ do chính agent tạo (Antigravity có công cụ tạo ảnh riêng) rồi nạp vào
  bài. Slide chỉ cần ghi `"image": {"generate": "<mô tả>"}`; lúc build Aurora **không gọi API nào**, mà trả về danh sách
  "ảnh cần tạo" để agent vẽ và nạp lại. Key OpenAI/Gemini có trong máy cũng bị bỏ qua, trừ khi bạn tự bật (xem bên dưới).
- **Đúng ngôn ngữ của bạn**: hướng dẫn gửi cho agent (system prompt của MCP, hai prompt `lesson`/`course`, `aurora_guide`) viết
  bằng tiếng Anh cho agent hiểu chính xác, nhưng bắt buộc nội dung bài học và câu trả lời của agent dùng ngôn ngữ bạn viết yêu cầu
  (hỏi bằng tiếng Việt thì ra slide tiếng Việt, `lang: "vi"`). Prompt tạo ảnh, id và từ khoá Mermaid vẫn giữ tiếng Anh.
- **34 loại slide**: title, section, agenda, statement, bullets, split, image (có camera zoom), explode, bento, stats, quote,
  code, timeline, steps, cycle, compare, table, chart, formula, definition, hotspots, notebook, exercise, quiz, flashcards,
  cloze, summary, video, html, palace, anchors, analogy, mnemonic, diagram.
- **Neo trí nhớ**: `palace` là cung điện ký ức. Camera đi dọc lộ trình trong một nơi quen thuộc (căn nhà của bạn, đường tới
  trường), mỗi trạm cất một ý kèm một cảnh để hình dung, có đường nối từ điểm neo tới thẻ; cuộn chuột để "đi". Có thể dùng
  sơ đồ tự vẽ hoặc ảnh căn nhà. Cuối bài có vòng ôn: các ý bị che, đến mỗi trạm tự nhớ rồi chấm Nhớ / Chưa nhớ.
  Ngoài ra: `anchors` (mỗi khái niệm một hình ảnh), `analogy` (neo vào điều đã biết, kèm chỗ không giống),
  `mnemonic` (câu thần chú kiểu "Sin đi học, Cos không hư…"), dòng `@ ` trên trang vở để ghi móc nhớ.
- **Sơ đồ bằng Mermaid** (`diagram`): agent viết code [Mermaid](https://mermaid.js.org) cho lưu đồ, bản đồ tư duy, sơ đồ tuần tự,
  trạng thái, lớp, ER, dòng thời gian, gantt, sankey, biểu đồ cột/tròn… Aurora vẽ sẵn thành SVG lúc build bằng Chrome/Edge,
  tô màu theo theme của bài, nên bài học vẫn nhẹ và mở offline được. Khi trình chiếu, các hộp hiện dần, mũi tên tự vẽ nối
  giữa chúng; `steps` cho hiện từng hộp mỗi lần nhấn →; `look: "handDrawn"` cho nét vẽ tay. Viết sai cú pháp thì slide báo
  lỗi kèm dòng sai để agent sửa.
- **9 theme**: aurora, midnight, daylight, titanium, ocean, sunset, forest, paper, liquid (Liquid Glass).
- **Khoá học**: `course.json` + trang chủ khoá học (thẻ bài mang màu theme của từng bài, vòng tiến độ, nút "Học tiếp");
  trong mỗi bài có đường dẫn về khoá học và nút "Bài tiếp theo". Trang khoá học nhắc **lịch ôn ngắt quãng**: bài đã học
  hiện "Đến hạn ôn" sau 1, 3, 7, 16, 35 ngày.
- **Agent tự kiểm tra**: chụp ảnh slide (contact sheet, từng slide, từng nấc hiệu ứng), audit bố cục, gợi ý sư phạm,
  lỗi JSON kèm gợi ý sửa ("ý bạn là…").
- Công thức toán (KaTeX) và hoá học `\ce{...}`; code highlight kiểu Xcode; xem trước có live reload; xuất PDF;
  font **Be Vietnam Pro** nhúng sẵn, không lỗi dấu tiếng Việt.

## Ảnh: agent tự tạo là ưu tiên số 1

Thứ tự Aurora khuyên agent dùng (ghi trong hướng dẫn và mô tả tool, nên agent tự làm theo):

1. **Agent tự tạo ảnh** bằng công cụ của nó (Antigravity: tạo ảnh ngay trong cuộc trò chuyện). Có hai cách nối vào bài:
   - Tạo ảnh trước, rồi `aurora_add_image {"dir": …, "path": "<file ảnh>"}` để chép vào thư mục `images/` của bài.
   - Hoặc ghi `"image": {"generate": "<prompt>"}` ngay trong slide. Build xong, kết quả có mục
     **"Pictures for you to make"**: mỗi ảnh có mã (id), số slide, khung hình (ngang 16:9, dọc 3:4, vuông 1:1) và prompt.
     Agent tạo từng ảnh rồi gọi `aurora_add_image {"dir": …, "path": "<file ảnh>", "for": "<id>"}`: ảnh được lưu thành
     `images/gen-<id>.png` và bài tự build lại. Khi ảnh chưa có, slide hiện một ô kính mờ ghi prompt thay cho ảnh.
     Cách này giữ prompt trong `deck.json`, nên lần sau làm lại bài vẫn ra cùng một phong cách.
2. **Ảnh thật trên mạng**: `{"query": "chloroplast microscope"}` hoặc `aurora_search_images` (Openverse, Wikimedia miễn phí;
   Unsplash/Pexels nếu có key).
3. **Agent tự vẽ SVG** (`{"svg": "<svg …>"}`) cho hình đơn giản: trục toạ độ, mạch điện, tế bào, quả cầu Bloch.
4. **Dự phòng** cho agent không tạo được ảnh: `aurora_generate_image` dùng Pollinations (miễn phí, không cần key, chất lượng
   thấp hơn).

Muốn Aurora tự gọi OpenAI/Gemini lúc build (tốn tiền), đặt biến `AURORA_IMAGE_PROVIDER`:

| Giá trị | Ý nghĩa |
|---|---|
| `agent` (mặc định) | Không gọi API ảnh nào khi build; prompt thành danh sách ảnh để agent tạo. Key trong máy bị bỏ qua |
| `pollinations` | Tạo lúc build bằng Pollinations (miễn phí, có watermark nhỏ) |
| `openai` / `gemini` | Tạo lúc build bằng OpenAI gpt-image / Gemini (cần `OPENAI_API_KEY` / `GEMINI_API_KEY`, tốn tiền) |
| `auto` | Cách cũ: OpenAI, rồi Gemini (nếu có key), rồi Pollinations |

Ảnh đã có trong `images/gen-<id>.*` của bài luôn được dùng lại ở mọi chế độ, nên không bao giờ phải trả tiền hai lần.

## Cài đặt

Yêu cầu: Node.js 22.4+ và Google Chrome hoặc Microsoft Edge (để vẽ sơ đồ, chụp ảnh, audit, xuất PDF).

`dist/aurora.mjs` đã được build sẵn trong repo: clone về là chạy được, không cần cài gì thêm.

```bash
git clone https://github.com/DuongNAD/aurora-slides-mcp.git
```

Khi sửa mã nguồn (`src/`, `runtime/`, `guide/`) thì build lại:

```bash
node scripts/build.mjs --install --check
```

Lệnh trên cài toolchain (TypeScript, esbuild, MCP SDK, KaTeX, Shiki…) vào `%LOCALAPPDATA%\aurora-slides\toolchain`
(Linux/macOS: `~/.cache/aurora-slides/toolchain`) rồi build ra `dist/aurora.mjs`. Lần đầu nó cũng tải gói Mermaid từ npm nhưng
chỉ lấy đúng một file `assets/mermaid.min.js` (khoảng 5 MB, chỉ dùng lúc build, không nhúng vào bài).
Những lần sau chỉ cần `node scripts/build.mjs --check`.

> **Đừng chạy `npm install` trong thư mục dự án.** Dự án cố ý không có `node_modules`: mọi dependency nằm ở toolchain bên ngoài,
> repo chỉ giữ một file bundle. Nhờ vậy có thể đặt dự án trên ổ exFAT hay USB (cluster lớn) mà không sinh hàng nghìn file nhỏ.

## Kết nối với agent

Đăng ký Aurora với tên `aurora-slides`, rồi tải lại danh sách MCP (hoặc mở lại Antigravity / Claude Code) để agent nhìn thấy
các tool. Thay `C:/path/to/aurora-slides-mcp` bằng thư mục bạn đã clone.

**Google Antigravity**: thêm vào `mcpServers` trong `%USERPROFILE%\.gemini\antigravity\mcp_config.json`
(Cursor dùng cùng định dạng trong `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "aurora-slides": {
      "command": "node",
      "args": ["C:/path/to/aurora-slides-mcp/dist/aurora.mjs"]
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add aurora-slides --scope user -- node "C:/path/to/aurora-slides-mcp/dist/aurora.mjs"
```

Biến môi trường tuỳ chọn (đặt trong khối `"env"` của cấu hình MCP):

| Biến | Tác dụng |
|---|---|
| `AURORA_IMAGE_PROVIDER` | Cách xử lý `generate`: `agent` (mặc định), `pollinations`, `openai`, `gemini`, `auto` (xem mục Ảnh) |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | Chỉ được dùng khi `AURORA_IMAGE_PROVIDER` là `openai`, `gemini` hoặc `auto` |
| `AURORA_OPENAI_IMAGE_MODEL`, `AURORA_GEMINI_IMAGE_MODEL` | Đổi model tạo ảnh |
| `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY` | Ảnh Unsplash/Pexels đẹp hơn thay vì Openverse/Wikimedia |
| `AURORA_DECKS_DIR` | Thư mục mặc định chứa bài (mặc định `./slides` của dự án agent đang mở) |
| `AURORA_BROWSER` | Đường dẫn Chrome/Edge nếu không tự tìm thấy |
| `AURORA_PORT` | Cổng server xem trước (mặc định 4747) |
| `AURORA_HOME` | Thư mục cache icon/ảnh/sơ đồ (mặc định `%LOCALAPPDATA%\aurora-slides`) |

## Dùng thế nào

Chỉ cần nói với agent. Ví dụ một bài học trong ngày, giao cho Antigravity:

> Dùng aurora-slides làm bài học hôm nay về **Định luật Ôm** cho mình: lý thuyết → neo trí nhớ → trang ghi vở → bài tập từ dễ
> đến khó → ôn lại. Ảnh minh hoạ thì **tự tạo bằng công cụ tạo ảnh của bạn**, cùng một phong cách cho cả bài, không có chữ
> trong ảnh, rồi nạp vào bằng `aurora_add_image`. Xong thì chụp ảnh kiểm tra, sửa lỗi audit và mở bản xem trước.

Hoặc cả một khoá học:

> Dùng aurora-slides làm khoá học **Máy tính lượng tử** gồm 5 bài nhỏ: lý thuyết lượng tử, cổng lượng tử, rối lượng tử,
> mạch và thuật toán, phần cứng. Mỗi bài một theme khác nhau, có trang ghi vở sau phần lý thuyết và bài tập từ dễ đến khó.
> Bài phần cứng làm exploded view bên trong máy tính lượng tử. Mỗi bài có một cung điện ký ức trong căn nhà của mình
> để nhớ các ý chính, cuối bài đi lại một vòng để ôn. Ảnh tự tạo rồi nạp vào. Xong thì chụp ảnh kiểm tra và mở bản xem trước.

Trong Claude Code còn có prompt dựng sẵn: `/mcp__aurora-slides__course` và `/mcp__aurora-slides__lesson`.

Bài học được lưu vào `./slides/<tên-bài>/` của dự án agent đang mở (gồm `deck.json`, `index.html` và `images/`).
Mở `index.html` bằng trình duyệt là học được.

Các tool agent dùng:

| Tool | Việc |
|---|---|
| `aurora_guide` | Hướng dẫn viết slide, từng loại slide kèm ví dụ JSON, cách chia khoá học, cách lấy ảnh |
| `aurora_create_course` | Tạo/sửa khoá học: danh sách bài, theme từng bài, trang chủ khoá học |
| `aurora_create_deck` | Tạo/ghi đè một bài (deck.json + index.html), báo lỗi chính xác nếu JSON sai, liệt kê ảnh cần tạo |
| `aurora_edit_deck` | Sửa từng slide: replace, insert, delete, move, update, deck |
| `aurora_get_deck`, `aurora_build` | Đọc lại deck; build lại deck hoặc cả khoá học |
| `aurora_add_image` | Nạp ảnh agent tự tạo/tìm (file, URL, base64) vào bài; `for` điền đúng ảnh slide đang chờ rồi tự build lại |
| `aurora_search_icons`, `aurora_search_images` | Tìm icon (Iconify, hơn 200 nghìn mẫu) và ảnh trên mạng |
| `aurora_generate_image` | Dự phòng cho agent không tự tạo được ảnh (Pollinations miễn phí) |
| `aurora_screenshot`, `aurora_audit` | Agent tự nhìn slide (cả từng nấc hiệu ứng) và kiểm tra lỗi bố cục |
| `aurora_preview` | Server xem trước 127.0.0.1 có live reload (deck hoặc cả khoá học) |
| `aurora_export_pdf` | Xuất PDF 16:9 |

## Khi học

| Thao tác | Việc |
|---|---|
| → / Space / cuộn xuống | Tiếp theo (từng ý, từng dòng vở, từng bước lời giải, từng nấc exploded view) |
| ← / cuộn lên | Quay lại |
| N | Ghi chú chi tiết của slide |
| O / Esc | Tổng quan toàn bài |
| F | Toàn màn hình |
| T | Bật/tạm dừng đồng hồ bài tập |
| 1–6 | Chọn đáp án quiz |
| 1 / 2 | Nhớ / Chưa nhớ khi ôn cung điện ký ức |

Trên slide exploded view và cung điện ký ức, cuộn chuột/trackpad sẽ "tua" hiệu ứng liên tục như trang Apple. Bài học nhớ
chỗ đang học, trang khoá học hiện tiến độ từng bài và những bài đến hạn ôn.

## CLI

```bash
node dist/aurora.mjs build examples/quang-hop             # build một bài (in ra cả danh sách ảnh cần tạo nếu có)
node dist/aurora.mjs build examples/may-tinh-luong-tu     # build cả khoá học
node dist/aurora.mjs serve examples/may-tinh-luong-tu --open
node dist/aurora.mjs shot examples/quang-hop --sheet      # contact sheet
node dist/aurora.mjs shot examples/quang-hop --slides 8 --step 2
node dist/aurora.mjs audit examples/quang-hop
node dist/aurora.mjs pdf examples/quang-hop
node dist/aurora.mjs images "chloroplast microscope"      # tìm ảnh
node dist/aurora.mjs icons leaf atom --style duotone      # tìm icon
node dist/aurora.mjs generate "glowing qubit chip, dark navy, soft light, no text"   # Pollinations miễn phí
node dist/aurora.mjs showcase --theme forest              # deck mẫu dùng mọi layout
node dist/aurora.mjs selftest                             # chạy thử runtime trong Chrome headless
node scripts/e2e.mjs                                      # kiểm thử MCP end-to-end (mọi tool, kể cả luồng ảnh của agent)
```

## Ví dụ có sẵn

- `examples/quang-hop`: bài "Quang hợp" (lý thuyết → neo trí nhớ → ghi vở → thực hành → ôn lại): cung điện "Pha sáng:
  một vòng quanh nhà", phép so sánh lục lạp với nhà máy điện mặt trời, mẹo nhớ "Con kiến tha mồi", bản đồ tư duy toàn cảnh
  vẽ bằng Mermaid.
- `examples/may-tinh-luong-tu`: khoá học "Máy tính lượng tử" 5 bài (3 bài đã viết, 2 bài "Sắp có"), mỗi bài một theme;
  bài 1 có cung điện ký ức vẽ trên sơ đồ một căn hộ (7 ý về qubit, 7 góc trong nhà), bài 2 mở đầu bằng vòng ôn bài 1 và có
  lưu đồ Mermaid đi từng bước qua mạch tạo trạng thái Bell, bài 5 có exploded view tủ lạnh pha loãng.

## Cấu trúc

```
src/        TypeScript: schema, render, course, imagegen, MCP tools, CLI
runtime/    aurora.css + aurora.js chạy trong trình duyệt
guide/      GUIDE.md cho agent
examples/   bài và khoá học mẫu
assets/     runtime đã minify, font và KaTeX nhúng base64, mermaid.min.js (sinh bởi build)
dist/       aurora.mjs: một file duy nhất chứa toàn bộ server (build sẵn, có trong repo)
scripts/    build.mjs (toolchain nằm ngoài dự án), e2e.mjs (kiểm thử MCP)
PLAN.md     trạng thái, ý tưởng tiếp theo, ràng buộc
```

## Lịch sử phiên bản

- **0.4.0** (10/10/2026): agent tự tạo ảnh là mặc định. `generate` thành danh sách ảnh cần tạo, `aurora_add_image {for}`
  điền ảnh và tự build lại, key OpenAI/Gemini chỉ dùng khi bật `AURORA_IMAGE_PROVIDER`. System prompt cho agent viết lại
  bằng tiếng Anh (Workflow / Rules / Done when), nội dung và câu trả lời theo ngôn ngữ của người dùng.
- **0.3.0**: slide `diagram` vẽ từ Mermaid lúc build, tô theo theme, hiện từng bước.
- **0.2.0**: neo trí nhớ: `palace`, `anchors`, `analogy`, `mnemonic`, dòng `@ ` trong vở, lịch ôn ngắt quãng.
- **0.1.0**: 29 loại slide, khoá học, 14 tool MCP, ảnh, CLI, selftest và e2e.

## Tác giả, giấy phép và thư viện

Aurora Slides do **DuongNAD** ([github.com/DuongNAD](https://github.com/DuongNAD)) xây dựng. Mã nguồn trong `src/`, `runtime/`, `guide/` và `scripts/`
được viết riêng cho dự án này và phát hành theo **giấy phép MIT** (xem [LICENSE](LICENSE)): ai cũng được dùng, sửa, phân phối,
kể cả cho mục đích thương mại, miễn là giữ lại thông báo bản quyền và giấy phép.

Aurora dùng các thư viện mã nguồn mở, mỗi thư viện giữ giấy phép của tác giả: Model Context Protocol SDK, zod, KaTeX, Shiki,
Mermaid, esbuild, TypeScript (MIT / Apache-2.0), font Be Vietnam Pro, Inter, JetBrains Mono (SIL Open Font License).
Icon lấy từ Iconify và ảnh lấy từ Openverse, Wikimedia, Unsplash, Pexels có giấy phép riêng của từng tác giả; Aurora tự ghi
nguồn ảnh dưới mỗi tấm.
