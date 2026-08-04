import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rollbackDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rollbackDir, '..', '..');
const epubPath = path.join(projectRoot, 'app_unpacked', 'src', 'js', 'text', 'epub.js');
const testPath = path.join(projectRoot, 'app_unpacked', 'src', 'test', 'epub-toc.test.html');
const source = await readFile(epubPath, 'utf8');

const replacements = [
  [`
const parseNcx = function (ncx, basePath) {
  const doc = new DOMParser().parseFromString(ncx, 'application/xml');
  const navMap = doc.querySelector('navMap');
  if (!navMap) return [];
  /** @type {{ href: string, title: string }[]} */
  const items = [];
  const walkNavPoints = element => {
    Array.from(element.children).forEach(navPoint => {
      if (navPoint.localName !== 'navPoint') return;
      const navLabel = Array.from(navPoint.children).find(child => child.localName === 'navLabel');
      const content = Array.from(navPoint.children).find(child => child.localName === 'content');
      const title = navLabel?.querySelector('text')?.textContent?.trim();
      const src = content?.getAttribute('src');
      if (title && src) {
        const target = src.split('#')[0];
        items.push({ href: resolvePath(basePath, target), title });
      }
      walkNavPoints(navPoint);
    });
  };
  walkNavPoints(navMap);
  return items;
};
`, '\n'],
  [
    `  const spine = opfDoc.querySelector('spine');\n`,
    '',
  ],
  [
    `  // Prefer EPUB 3 navigation, then fall back to the EPUB 2 NCX document.\n  let navItems = [];\n  const navItem = Array.from(manifest.values()).find(item => item.properties.includes('nav'));\n  let navPath = null;\n  if (navItem?.href) {\n    navPath = resolvePath(opfDir, navItem.href);\n    const navHtml = await zip.file(navPath)?.async('text');\n    if (navHtml) {\n      navItems = parseNav(navHtml, navPath);\n    }\n  }\n  if (!navItems.length) {\n    const ncxItem = manifest.get(spine?.getAttribute('toc'))\n      || Array.from(manifest.values()).find(item => item.type === 'application/x-dtbncx+xml');\n    if (ncxItem?.href) {\n      const ncxPath = resolvePath(opfDir, ncxItem.href);\n      const ncx = await zip.file(ncxPath)?.async('text');\n      if (ncx) navItems = parseNcx(ncx, ncxPath);\n    }\n  }\n\n  const navigationPaths = new Set();\n  if (navPath) navigationPaths.add(navPath);\n  opfDoc.querySelectorAll('guide > reference[type="toc"]').forEach(reference => {\n    const target = reference.getAttribute('href')?.split('#')[0];\n    if (target) navigationPaths.add(resolvePath(opfDir, target));\n  });\n`,
    `  // prepare nav toc\n  let navItems = [];\n  const navItem = Array.from(manifest.values()).find(item => item.properties.includes('nav'));\n  if (navItem?.href) {\n    const navPath = resolvePath(opfDir, navItem.href);\n    const navHtml = await zip.file(navPath)?.async('text');\n    if (navHtml) {\n      navItems = parseNav(navHtml, navPath);\n    }\n  }\n`,
  ],
  [
    `    if (!list.includes(item.title)) list.push(item.title);\n`,
    `    list.push(item.title);\n`,
  ],
  [
    `    if (navigationPaths.has(href)) continue;\n`,
    '',
  ],
];

let restored = source;
for (const [from, to] of replacements) {
  if (!restored.includes(from)) {
    throw new Error(`回退已停止：未找到预期内容 ${from.slice(0, 80)}`);
  }
  restored = restored.replace(from, to);
}

const backupPath = `${epubPath}.before-rollback-2026-07-30.bak`;
await writeFile(backupPath, source, 'utf8');
await writeFile(epubPath, restored, 'utf8');
await rm(testPath, { force: true });
console.log(`已回退 EPUB 目录兼容改动。原文件备份：${backupPath}`);
