#!/usr/bin/env node
/**
 * 打出可直接安装的主题 ZIP。
 *
 * Komari 安装的是**能直接安装的 ZIP**（根目录带 komari-theme.json、静态资源在
 * dist/ 下），不是源码压缩包。主题市场收录时还要校验 ZIP 的 SHA-256。
 *
 * ZIP 用 Node 内置 zlib 手工组装，不引第三方打包库：主题的发布产物不该依赖构建
 * 工具链之外的东西，CI 上也不必额外装 zip 命令。
 *
 * 用法：
 *   npm run build && node scripts/package-zip.mjs
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 已经压缩过的格式再压一遍只会变大，直接 store */
const STORED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".zip",
  ".gz",
]);

/** 随包分发的说明与许可文件，存在则带上 */
const DOC_FILES = ["LICENSE", "NOTICE.md", "README.md", "README_EN.md"];

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/** 递归列出文件。按名称排序，保证跨平台条目顺序一致 */
function walk(dir) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function dosDateTime(date) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

/**
 * ZIP 条目时间戳固定，而不是取当前时间：主题市场按 SHA-256 分发校验，时间戳一变
 * 整包 hash 就变，同一份源码打两次会得到两个 hash，谁都无法自行验证 Release 里的
 * 包确实来自这份源码。需要真实时间时用 SOURCE_DATE_EPOCH 覆盖。
 */
function packageTimestamp() {
  const epoch = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch * 1000);
  // ZIP 的 DOS 时间字段从 1980 起算
  return new Date(Date.UTC(1980, 0, 1, 0, 0, 0));
}

/** 最小可用 ZIP 写入器：local header + 数据 + 中央目录 + EOCD，只用 store(0) 与 deflate(8) */
function buildZip(entries, when = packageTimestamp()) {
  const { time, day } = dosDateTime(when);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.zipPath, "utf-8");
    const raw = entry.data;
    const stored = STORED_EXTENSIONS.has(extensionOf(entry.zipPath));
    const compressed = stored ? raw : deflateRawSync(raw, { level: 9 });
    const useDeflate = !stored && compressed.length < raw.length;
    const payload = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // 文件名为 UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuffer, payload);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(checksum, 16);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBuffer.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    // 外部属性：Unix 权限 0644 在高 16 位。JS 的 << 是 32 位有符号运算，
    // 0o100644<<16 会溢出成负数，必须转回无符号。
    dir.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    dir.writeUInt32LE(offset, 42);

    central.push(dir, nameBuffer);
    offset += local.length + nameBuffer.length + payload.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuffer, end]);
}

function main() {
  const manifestPath = join(root, "komari-theme.json");
  const distDir = join(root, "dist");

  if (!existsSync(distDir)) {
    console.error("找不到 dist/，请先执行 npm run build");
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const { short, version, preview } = manifest;

  if (!short || !/^[A-Za-z0-9_-]+$/.test(short)) {
    console.error(`komari-theme.json 的 short 不合法：${short}`);
    process.exit(1);
  }
  if (!version) {
    console.error("komari-theme.json 缺少 version");
    process.exit(1);
  }

  const distFiles = walk(distDir).map((file) => ({
    zipPath: relative(root, file).split(sep).join("/"),
    data: readFileSync(file),
  }));

  // Go 的 embed 会忽略下划线开头的文件，这类产物装进去就是 404
  const underscored = distFiles.filter((file) =>
    file.zipPath.split("/").some((part) => part.startsWith("_")),
  );
  if (underscored.length > 0) {
    console.error(
      `产物中存在以 _ 开头的文件，会被 go embed 忽略：\n  ${underscored
        .map((file) => file.zipPath)
        .join("\n  ")}`,
    );
    process.exit(1);
  }

  const entries = [
    { zipPath: "komari-theme.json", data: readFileSync(manifestPath) },
    ...distFiles,
  ];

  // manifest 里声明的预览图必须真的在包里，否则主题市场列表没有预览
  const previewName = preview || "preview.png";
  const previewPath = join(root, previewName);
  if (existsSync(previewPath)) {
    entries.push({ zipPath: previewName, data: readFileSync(previewPath) });
  } else {
    console.warn(`警告：缺少 ${previewName}，主题市场列表将没有预览图`);
  }

  for (const name of DOC_FILES) {
    const file = join(root, name);
    if (existsSync(file)) {
      entries.push({ zipPath: name, data: readFileSync(file) });
    }
  }

  const outDir = join(root, "theme-package");
  mkdirSync(outDir, { recursive: true });

  const zipName = `komari-theme-${short.toLowerCase()}-v${version}.zip`;
  const zipPath = join(outDir, zipName);
  const buffer = buildZip(entries);
  writeFileSync(zipPath, buffer);

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  writeFileSync(`${zipPath}.sha256`, `${sha256}  ${zipName}\n`, "utf-8");

  console.log(`打包完成：theme-package/${zipName}`);
  console.log(`  文件数：${entries.length}`);
  console.log(`  体积：  ${(statSync(zipPath).size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  SHA256：${sha256}`);
}

main();
