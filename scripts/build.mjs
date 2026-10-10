#!/usr/bin/env node
/**
 * Build Aurora Slides.
 *
 * node_modules never lives in the project folder: the toolchain is installed in
 * %LOCALAPPDATA%/aurora-slides/toolchain (or ~/.cache/aurora-slides/toolchain),
 * because the project drive may be exFAT with huge clusters.
 *
 *   node scripts/build.mjs             bundle dist/aurora.mjs + generate assets/
 *   node scripts/build.mjs --check     also type-check (tsc, on a copy beside the toolchain)
 *   node scripts/build.mjs --install   (re)install the toolchain first
 */
import { execFileSync } from "node:child_process";
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base =
  process.platform === "win32"
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "aurora-slides")
    : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "aurora-slides");
const TOOL = resolve(process.env.AURORA_TOOLCHAIN ?? join(base, "toolchain"));
const NM = join(TOOL, "node_modules");
const args = new Set(process.argv.slice(2));
const t0 = Date.now();
const log = (m) => console.log(`[build] ${m}`);

const DEPS = {
  "@fontsource-variable/inter": "^5.3.0",
  "@fontsource-variable/jetbrains-mono": "^5.3.0",
  "@fontsource/be-vietnam-pro": "^5.3.0",
  "@modelcontextprotocol/sdk": "^1.32.1",
  "@types/katex": "^0.16.8",
  "@types/node": "^22.20.5",
  esbuild: "^0.28.2",
  katex: "^0.19.0",
  shiki: "^4.5.0",
  typescript: "^7.0.2",
  zod: "^4.6.5",
};

if (args.has("--install") || !existsSync(join(NM, "esbuild"))) {
  log(`installing toolchain into ${TOOL}`);
  mkdirSync(TOOL, { recursive: true });
  writeFileSync(join(TOOL, "package.json"), JSON.stringify({ name: "aurora-slides-toolchain", private: true, type: "module", dependencies: DEPS }, null, 2));
  execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund"], { cwd: TOOL, stdio: "inherit", shell: process.platform === "win32" });
}

const req = createRequire(join(TOOL, "package.json"));
const esbuild = req("esbuild");
const pkgDir = (name) => dirname(req.resolve(`${name}/package.json`));
const ASSETS = join(ROOT, "assets");
mkdirSync(ASSETS, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/* ───────── Runtime (minified) ───────── */
const css = readFileSync(join(ROOT, "runtime", "aurora.css"), "utf8");
const js = readFileSync(join(ROOT, "runtime", "aurora.js"), "utf8");
const cssMin = esbuild.transformSync(css, { loader: "css", minify: true }).code;
const jsMin = esbuild.transformSync(js, { loader: "js", minify: true, target: "es2020" }).code;
writeFileSync(join(ASSETS, "aurora.min.css"), cssMin);
writeFileSync(join(ASSETS, "aurora.min.js"), jsMin);
log(`runtime: css ${kb(cssMin.length)}, js ${kb(jsMin.length)}`);

/* ───────── Fonts → base64 @font-face ───────── */
function fontCss(pkg, files, subsets) {
  const dir = pkgDir(pkg);
  let out = "";
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*{([^}]*)}/g;
    let m;
    while ((m = re.exec(src))) {
      const [, name, body] = m;
      if (!subsets.some((s) => name.includes(`-${s}-`))) continue;
      const url = /url\(\.?\/?(files\/[^)]+\.woff2)\)/.exec(body);
      if (!url) continue;
      const b64 = readFileSync(join(dir, url[1])).toString("base64");
      const rest = body
        .replace(/src:[^;]+;/, `src: url(data:font/woff2;base64,${b64}) format('woff2');`)
        .replace(/\s+/g, " ")
        .trim();
      out += `@font-face{${rest}}\n`;
    }
  }
  return out;
}
const VI = ["vietnamese", "latin-ext", "latin"];
const fonts = {
  "font-vietnam.css": fontCss("@fontsource/be-vietnam-pro", ["400.css", "500.css", "600.css", "700.css", "800.css", "400-italic.css"], VI),
  "font-inter.css": fontCss("@fontsource-variable/inter", ["index.css", "wght-italic.css"], VI),
  "font-mono.css": fontCss("@fontsource-variable/jetbrains-mono", ["index.css"], VI),
};
for (const [name, text] of Object.entries(fonts)) {
  writeFileSync(join(ASSETS, name), text);
  log(`${name}: ${kb(text.length)}`);
}

/* ───────── KaTeX CSS with inlined woff2 fonts ───────── */
{
  const dir = join(pkgDir("katex"), "dist");
  const k = readFileSync(join(dir, "katex.min.css"), "utf8").replace(/src:url\(([^)]+?\.woff2)\)\s*format\("woff2"\)[^;}]*/g, (_, file) => {
    const b64 = readFileSync(join(dir, file)).toString("base64");
    return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
  });
  writeFileSync(join(ASSETS, "katex.css"), k);
  log(`katex.css: ${kb(k.length)}`);
}

/* ───────── Mermaid browser bundle ─────────
   Used at build time (in headless Chrome) to draw diagram slides; it is never embedded in decks.
   Only the one file is taken from the npm tarball, so its ~120 MB of dependencies are not installed. */
{
  const VERSION = "12.1.0";
  const out = join(ASSETS, "mermaid.min.js");
  let have;
  if (existsSync(out)) {
    const fd = openSync(out, "r");
    const head = Buffer.alloc(64);
    readSync(fd, head, 0, 64, 0);
    closeSync(fd);
    have = /mermaid ([\d.]+)/.exec(head.toString("utf8"))?.[1];
  }
  if (have !== VERSION) {
    const dir = join(TOOL, "pack");
    mkdirSync(dir, { recursive: true });
    const tgz = join(dir, `mermaid-${VERSION}.tgz`);
    if (!existsSync(tgz)) {
      log(`downloading mermaid ${VERSION}`);
      execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", `mermaid@${VERSION}`, "--pack-destination", dir, "--silent"], {
        cwd: dir, stdio: "pipe", shell: process.platform === "win32",
      });
    }
    const tar = gunzipSync(readFileSync(tgz));
    const want = "package/dist/mermaid.min.js";
    let data;
    for (let off = 0; off + 512 <= tar.length; ) {
      const name = tar.toString("utf8", off, off + 100).replace(/\0.*$/s, "");
      if (!name) break;
      const prefix = tar.toString("utf8", off + 345, off + 500).replace(/\0.*$/s, "");
      const size = parseInt(tar.toString("utf8", off + 124, off + 136).replace(/\0.*$/s, "").trim() || "0", 8);
      if ((prefix ? `${prefix}/${name}` : name) === want) {
        data = tar.subarray(off + 512, off + 512 + size);
        break;
      }
      off += 512 + Math.ceil(size / 512) * 512;
    }
    if (!data) throw new Error(`${want} not found in ${tgz}`);
    writeFileSync(out, Buffer.concat([Buffer.from(`/*! mermaid ${VERSION} | MIT License | https://mermaid.js.org */\n`), data]));
  }
  log(`mermaid.min.js: ${VERSION} (${kb(statSync(out).size)})`);
}

/* ───────── Type-check (optional) ───────── */
if (args.has("--check")) {
  const work = join(TOOL, "check");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  cpSync(join(ROOT, "src"), join(work, "src"), { recursive: true });
  writeFileSync(
    join(work, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", lib: ["ES2023", "DOM"], strict: true,
          noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, types: ["node"], esModuleInterop: true, resolveJsonModule: true,
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ),
  );
  writeFileSync(join(work, "package.json"), JSON.stringify({ type: "module", private: true }));
  log("type-checking…");
  try {
    execFileSync(process.execPath, [join(NM, "typescript", "bin", "tsc"), "-p", work], { cwd: work, stdio: "pipe" });
    log("types OK");
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    console.log(out.split(work).join(ROOT).trim());
    if (!args.has("--force")) process.exit(1);
  }
}

/* ───────── Bundle ───────── */
const result = await esbuild.build({
  entryPoints: [join(ROOT, "src", "index.ts")],
  outfile: join(ROOT, "dist", "aurora.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  nodePaths: [NM],
  minifySyntax: true,
  minifyWhitespace: true,
  legalComments: "none",
  logLevel: "warning",
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __auroraCR } from 'node:module';\nconst require = __auroraCR(import.meta.url);" },
  metafile: true,
});
const outSize = statSync(join(ROOT, "dist", "aurora.mjs")).size;
log(`dist/aurora.mjs: ${(outSize / 1024 / 1024).toFixed(2)} MB`);
if (args.has("--meta")) writeFileSync(join(TOOL, "meta.json"), JSON.stringify(result.metafile));

/* ───────── JSON Schema for editors ───────── */
const schema = execFileSync(process.execPath, [join(ROOT, "dist", "aurora.mjs"), "schema"], { encoding: "utf8" });
writeFileSync(join(ROOT, "deck.schema.json"), schema);
log(`deck.schema.json: ${kb(schema.length)}`);
log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
