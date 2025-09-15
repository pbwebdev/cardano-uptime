// scripts/build-html.mjs
import { promises as fs } from "node:fs";
import path from "node:path";
import { minify } from "html-minifier-terser";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, process.env.HTML_SRC_DIR || "src");
const OUT_DIR = path.join(ROOT, process.env.HTML_OUT_DIR || "dist");

const MINIFY_EXT = new Set([".html", ".htm"]);
const COPY_AS_IS = new Set([
    ".png",".jpg",".jpeg",".webp",".gif",".svg",".ico",
    ".css",".js",".mjs",".map",".json",".txt",".xml",".pdf",".wasm",".woff",".woff2",".ttf",".otf"
]);

// load options (optional file)
async function loadOptions() {
    const p = path.join(ROOT, "htmlmin.config.json");
    try {
        const raw = await fs.readFile(p, "utf8");
        return JSON.parse(raw);
    } catch {
        return {
            collapseWhitespace: true,
            removeComments: true,
            removeRedundantAttributes: true,
            removeScriptTypeAttributes: true,
            removeStyleLinkTypeAttributes: true,
            useShortDoctype: true,
            minifyCSS: true,
            minifyJS: true
        };
    }
}

async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}

async function* walk(dir) {
    for (const d of await fs.readdir(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        if (d.isDirectory()) yield* walk(p);
        else if (d.isFile()) yield p;
    }
}

function outPath(file) {
    const rel = path.relative(SRC_DIR, file);
    return path.join(OUT_DIR, rel);
}

async function build() {
    const opts = await loadOptions();
    let countMin = 0, countCopy = 0, before = 0, after = 0;

    await ensureDir(OUT_DIR);

    // clean OUT_DIR first (optional; comment out if you have other artifacts there)
    try {
        // rm -rf dist
        await fs.rm(OUT_DIR, { recursive: true, force: true });
        await ensureDir(OUT_DIR);
    } catch {}

    for await (const file of walk(SRC_DIR)) {
        const relOut = outPath(file);
        await ensureDir(path.dirname(relOut));

        const ext = path.extname(file).toLowerCase();
        if (MINIFY_EXT.has(ext)) {
            const html = await fs.readFile(file, "utf8");
            before += Buffer.byteLength(html);
            let out;
            try {
                out = await minify(html, opts);
            } catch (e) {
                console.error(`✖ minify failed: ${file}\n  ${e.message}\n  -> copying unminified`);
                out = html;
            }
            await fs.writeFile(relOut, out);
            after += Buffer.byteLength(out);
            countMin++;
            console.log(`✓ minified ${path.relative(ROOT, relOut)}`);
        } else if (COPY_AS_IS.has(ext)) {
            // copy common assets 1:1
            await fs.copyFile(file, relOut);
            countCopy++;
        } else {
            // default behavior: copy unknowns (safe)
            await fs.copyFile(file, relOut);
            countCopy++;
        }
    }

    const saved = before - after;
    const pct = before ? ((saved / before) * 100).toFixed(1) : "0.0";
    console.log(`\nMinified ${countMin} HTML file(s). Copied ${countCopy} asset(s).`);
    console.log(`Saved ${saved} bytes (${pct}%). Output → ${path.relative(ROOT, OUT_DIR)}`);
}

build().catch(e => { console.error(e); process.exit(1); });
