/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

let jsZipPromise = null;

const blockTags = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'UL', 'OL', 'LI', 'NAV', 'TABLE', 'TR', 'TD', 'TH',
  'FIGURE', 'FIGCAPTION', 'BLOCKQUOTE', 'BODY',
]);

const loadJsZip = function () {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (jsZipPromise) return jsZipPromise;
  jsZipPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './js/lib/jszip/jszip.min.js';
    script.addEventListener('load', () => {
      resolve(window.JSZip);
    });
    script.addEventListener('error', () => {
      document.body.removeChild(script);
      reject(new Error('JSZip load failed'));
    });
    document.body.appendChild(script);
  });
  return jsZipPromise;
};

const resolvePath = function (base, target) {
  const baseParts = target.startsWith('/') ? [] : base.split('/');
  if (baseParts.length) baseParts.pop();
  const targetParts = target.split('/');
  const parts = [...baseParts, ...targetParts];
  /** @type {string[]} */
  const stack = [];
  parts.forEach(part => {
    if (!part || part === '.') return;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  });
  return stack.join('/');
};

export const imagePlaceholder = id => `\uFFFCimg${id}\uFFFC`;
export const imagePlaceholderRegExp = /\uFFFCimg(\d+)\uFFFC/g;

const createImageResource = function (path, mime, alt) {
  return { path, mime, alt };
};

export const createEpubResourceLoader = function (source, { maxIdleEntries = 64 } = {}) {
  let zipPromise = null;
  let destroyed = false;
  const entries = new Map();
  const getZip = () => {
    if (!zipPromise) {
      zipPromise = loadJsZip().then(async JSZip => JSZip.loadAsync(await source.arrayBuffer()));
    }
    return zipPromise;
  };
  const touch = entry => {
    entries.delete(entry.path);
    entries.set(entry.path, entry);
  };
  const revoke = entry => {
    if (entry.url?.startsWith('blob:')) URL.revokeObjectURL(entry.url);
    entry.url = null;
    entries.delete(entry.path);
  };
  const trim = () => {
    for (const entry of entries.values()) {
      if (!destroyed && entries.size <= maxIdleEntries) break;
      if (entry.refs || entry.pending) continue;
      revoke(entry);
    }
  };
  const createEntry = resource => {
    const entry = {
      path: resource.path,
      mime: resource.mime || 'application/octet-stream',
      refs: 0,
      pending: null,
      url: null,
    };
    entry.pending = (async () => {
      const zip = await getZip();
      const file = zip.file(entry.path);
      if (!file) return null;
      const bytes = await file.async('arraybuffer');
      if (destroyed && !entry.refs) return null;
      const url = URL.createObjectURL(new Blob([bytes], { type: entry.mime }));
      if (destroyed && !entry.refs) {
        URL.revokeObjectURL(url);
        return null;
      }
      entry.url = url;
      return url;
    })().catch(error => {
      console.warn(`EPUB resource load failed: ${entry.path}`, error);
      return null;
    }).finally(() => {
      entry.pending = null;
      if (!entry.url) entries.delete(entry.path);
      else trim();
    });
    entries.set(entry.path, entry);
    return entry;
  };
  return {
    async warmup() {
      if (destroyed) return null;
      try {
        return await getZip();
      } catch (error) {
        console.warn('EPUB resource warmup failed:', error);
        return null;
      }
    },
    async acquire(resource) {
      if (destroyed || !resource?.path) return null;
      let entry = entries.get(resource.path);
      if (!entry) entry = createEntry(resource);
      entry.refs++;
      touch(entry);
      const url = entry.url || await entry.pending;
      if (!url) {
        entry.refs--;
        if (!entry.refs) trim();
        return null;
      }
      let released = false;
      return {
        url,
        release() {
          if (released) return;
          released = true;
          entry.refs = Math.max(entry.refs - 1, 0);
          trim();
        },
      };
    },
    destroy() {
      destroyed = true;
      trim();
      zipPromise = null;
    },
  };
};
const collectText = async function (node, buffer, options) {
  if (node.nodeType === Node.TEXT_NODE) {
    buffer.push(node.nodeValue);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = /** @type {HTMLElement} */ (node);
  const tag = element.tagName.toUpperCase();
  const ensureNewLine = () => {
    const lastItem = buffer[buffer.length - 1] ?? '';
    if (!lastItem.endsWith('\n')) buffer.push('\n');
  };
  if (tag === 'BR') {
    buffer.push('\n');
    return;
  }
  const isBlock = blockTags.has(tag);
  if (isBlock) ensureNewLine();
  if (tag === 'IMG') {
    const src = element.getAttribute('src');
    if (src) {
      const placeholder = await options.resolveImage(src, element.getAttribute('alt') || '');
      if (placeholder) buffer.push(placeholder);
    }
  } else {
    for (const child of Array.from(element.childNodes)) {
      await collectText(child, buffer, options);
    }
  }
  if (isBlock) ensureNewLine();
};

const extractText = async function (html, options) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const buffer = [];
  await collectText(doc.body || doc, buffer, options);
  return buffer.join('').replace(/\n{3,}/g, '\n\n').trim() + '\n\n';
};

const parseNav = function (navHtml, basePath) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(navHtml, 'text/html');
  const navElement = doc.querySelector('nav[epub\\:type="toc"], nav[role="doc-toc"], nav');
  if (!navElement) return [];
  const list = navElement.querySelector('ol, ul') || navElement;
  /** @type {{ href: string, title: string }[]} */
  const items = [];
  const walkList = element => {
    element.querySelectorAll(':scope > li').forEach(li => {
      const link = li.querySelector('a');
      if (link?.getAttribute) {
        const href = link.getAttribute('href');
        const title = link.textContent?.trim();
        if (href && title) {
          const target = href.split('#')[0];
          items.push({ href: resolvePath(basePath, target), title });
        }
      }
      const childList = li.querySelector('ol, ul');
      if (childList) walkList(childList);
    });
  };
  walkList(list);
  return items;
};

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

const findRootFile = async function (zip) {
  const container = await zip.file('META-INF/container.xml')?.async('text');
  if (!container) throw new Error('container.xml missing');
  const doc = new DOMParser().parseFromString(container, 'application/xml');
  const rootfile = doc.querySelector('rootfile');
  const fullPath = rootfile?.getAttribute('full-path');
  if (!fullPath) throw new Error('OPF not found');
  return fullPath;
};

/**
 * 读取 EPUB 并转换为 tReader 的文本结构。
 * @param {File} file
 * @param {{ loadImages?: boolean }} options
 * @returns {Promise<{ title: string, content: { text: string, resources: Record<string, { path: string, mime: string, alt: string }> }, index?: { template: string, items: { title: string, cursor: number }[] } }>}
 */
export const readEpub = async function (file, options = {}) {
  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const opfPath = await findRootFile(zip);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = await zip.file(opfPath)?.async('text');
  if (!opf) throw new Error('OPF file missing');

  const opfDoc = new DOMParser().parseFromString(opf, 'application/xml');
  const title = opfDoc.querySelector('metadata > title, metadata > dc\\:title')?.textContent?.trim();

  /** manifest map */
  const manifest = new Map();
  opfDoc.querySelectorAll('manifest > item').forEach(item => {
    manifest.set(item.getAttribute('id'), {
      href: item.getAttribute('href'),
      type: item.getAttribute('media-type'),
      properties: item.getAttribute('properties') || '',
    });
  });

  const spine = opfDoc.querySelector('spine');
  const spineIds = Array.from(opfDoc.querySelectorAll('spine > itemref')).map(item => item.getAttribute('idref')).filter(Boolean);
  const manifestByHref = new Map();
  manifest.forEach(item => {
    const fullPath = resolvePath(opfDir, item.href);
    manifestByHref.set(fullPath, item);
  });

  // Prefer EPUB 3 navigation, then fall back to the EPUB 2 NCX document.
  let navItems = [];
  const navItem = Array.from(manifest.values()).find(item => item.properties.includes('nav'));
  let navPath = null;
  if (navItem?.href) {
    navPath = resolvePath(opfDir, navItem.href);
    const navHtml = await zip.file(navPath)?.async('text');
    if (navHtml) {
      navItems = parseNav(navHtml, navPath);
    }
  }
  if (!navItems.length) {
    const ncxItem = manifest.get(spine?.getAttribute('toc'))
      || Array.from(manifest.values()).find(item => item.type === 'application/x-dtbncx+xml');
    if (ncxItem?.href) {
      const ncxPath = resolvePath(opfDir, ncxItem.href);
      const ncx = await zip.file(ncxPath)?.async('text');
      if (ncx) navItems = parseNcx(ncx, ncxPath);
    }
  }

  const navigationPaths = new Set();
  if (navPath) navigationPaths.add(navPath);
  opfDoc.querySelectorAll('guide > reference[type="toc"]').forEach(reference => {
    const target = reference.getAttribute('href')?.split('#')[0];
    if (target) navigationPaths.add(resolvePath(opfDir, target));
  });

  const navByPath = navItems.reduce((map, item) => {
    const list = map.get(item.href) || [];
    if (!list.includes(item.title)) list.push(item.title);
    map.set(item.href, list);
    return map;
  }, new Map());

  const resources = {};
  const resourceCache = new Map();
  const getMimeByPath = path => {
    const item = manifestByHref.get(path);
    if (item?.type) return item.type;
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    return {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    }[ext] || 'application/octet-stream';
  };
  let imageId = 0;
  const createResolveImage = basePath => async (src, alt) => {
    const sourcePath = src.split(/[?#]/, 1)[0];
    let decodedPath = sourcePath;
    try {
      decodedPath = decodeURIComponent(sourcePath);
    } catch (_error) { }
    const path = resolvePath(basePath, decodedPath);
    if (resourceCache.has(path)) {
      return resourceCache.get(path);
    }
    if (!zip.file(path)) return null;
    const mime = getMimeByPath(path);
    const resource = createImageResource(path, mime, alt);
    const placeholder = imagePlaceholder(imageId++);
    resources[placeholder] = resource;
    resourceCache.set(path, placeholder);
    return placeholder;
  };

  const contentChunks = [];
  let contentLength = 0;
  const indexItems = [];
  for (const id of spineIds) {
    const manifestItem = manifest.get(id);
    if (!manifestItem?.href) continue;
    const href = resolvePath(opfDir, manifestItem.href);
    if (navigationPaths.has(href)) continue;
    const fileContent = await zip.file(href)?.async('text');
    if (!fileContent) continue;
    const cursor = contentLength;
    const extractedText = await extractText(fileContent, {
      basePath: href,
      resolveImage: createResolveImage(href),
    });
    const text = options.preprocessText
      ? await options.preprocessText(extractedText)
      : extractedText;
    const navTitles = navByPath.get(href);
    if (navTitles?.length) {
      navTitles.forEach(title => {
        indexItems.push({ title, cursor });
      });
    }
    contentChunks.push(text);
    contentLength += text.length;
  }

  return {
    title: title || file.name.replace(/\.epub$/i, ''),
    content: { text: contentChunks.join(''), resources },
    index: indexItems.length ? { template: 'epub', items: indexItems } : null,
  };
};

const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]);

const createXhtmlBody = content => content.replace(/\r\n|\r/g, '\n')
  .split(/\n{2,}/)
  .filter(paragraph => paragraph.length)
  .map(paragraph => `<p>${escapeXml(paragraph).replace(/\n/g, '<br/>')}</p>`)
  .join('\n') || '<p></p>';

/**
 * Build a simple, standards-compliant EPUB from the reader's editable text.
 * The imported EPUB has already been converted to text by the reader, so its
 * original layout and embedded media cannot be reconstructed after editing.
 */
export const createEpub = async function ({ title, content }) {
  const JSZip = await loadJsZip();
  const zip = new JSZip();
  const safeTitle = escapeXml(title || 'Untitled');
  const body = createXhtmlBody(content || '');
  const identifier = `urn:uuid:${crypto.randomUUID?.() || Date.now().toString(36)}`;

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${safeTitle}</dc:title><dc:language>zh</dc:language></metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="text" href="text.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="text"/></spine>
</package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${safeTitle}</title></head><body><nav epub:type="toc"><ol><li><a href="text.xhtml">${safeTitle}</a></li></ol></nav></body></html>`);
  zip.file('OEBPS/text.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${safeTitle}</title></head><body>${body}</body></html>`);
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip', compression: 'DEFLATE' });
};

