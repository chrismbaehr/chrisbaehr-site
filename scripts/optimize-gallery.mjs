import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, "assets");
const PUBLIC_ASSETS_DIR = path.join(ROOT, "public", "assets");
const THUMBS_SUBDIR = path.join("gallery", "thumbs");
const FULL_SUBDIR = path.join("gallery", "full");

const THUMBS_DIR = path.join(ASSETS_DIR, THUMBS_SUBDIR);
const FULL_DIR = path.join(ASSETS_DIR, FULL_SUBDIR);
const PUBLIC_THUMBS_DIR = path.join(PUBLIC_ASSETS_DIR, THUMBS_SUBDIR);
const PUBLIC_FULL_DIR = path.join(PUBLIC_ASSETS_DIR, FULL_SUBDIR);

const SOURCE_EXTS = ["jpg", "jpeg", "png", "webp", "avif"];
const OUTPUT_FORMATS = ["avif", "webp"];

const MAX_ID = 30;
const THUMB_WIDTH = 640;
const FULL_WIDTH = 1800;

const AVIF_QUALITY = 45;
const WEBP_QUALITY = 72;

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const findSourceForId = async (id) => {
  const stem = `adventure-${String(id).padStart(2, "0")}`;

  for (const ext of SOURCE_EXTS) {
    const candidate = path.join(ASSETS_DIR, `${stem}.${ext}`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next extension.
    }
  }

  return null;
};

const encode = async (instance, format, outputPath) => {
  if (format === "avif") {
    await instance.avif({ quality: AVIF_QUALITY, effort: 5 }).toFile(outputPath);
    return;
  }

  await instance.webp({ quality: WEBP_QUALITY, effort: 5 }).toFile(outputPath);
};

const copyDir = async (src, dest) => {
  await ensureDir(dest);
  await fs.cp(src, dest, { recursive: true, force: true });
};

const main = async () => {
  await ensureDir(THUMBS_DIR);
  await ensureDir(FULL_DIR);

  let processed = 0;

  for (let id = 1; id <= MAX_ID; id += 1) {
    const source = await findSourceForId(id);
    if (!source) {
      continue;
    }

    const stem = `adventure-${String(id).padStart(2, "0")}`;

    for (const format of OUTPUT_FORMATS) {
      const thumbOut = path.join(THUMBS_DIR, `${stem}.${format}`);
      const fullOut = path.join(FULL_DIR, `${stem}.${format}`);

      await encode(
        sharp(source)
          .rotate()
          .resize({ width: THUMB_WIDTH, withoutEnlargement: true, fit: "inside" }),
        format,
        thumbOut,
      );

      await encode(
        sharp(source)
          .rotate()
          .resize({ width: FULL_WIDTH, withoutEnlargement: true, fit: "inside" }),
        format,
        fullOut,
      );
    }

    processed += 1;
  }

  await copyDir(THUMBS_DIR, PUBLIC_THUMBS_DIR);
  await copyDir(FULL_DIR, PUBLIC_FULL_DIR);

  console.log(`Optimized gallery generated for ${processed} source image(s).`);
  console.log(`Thumbs: ${path.relative(ROOT, THUMBS_DIR)}`);
  console.log(`Full:   ${path.relative(ROOT, FULL_DIR)}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
