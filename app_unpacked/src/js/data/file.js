/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import storage from './storage.js';
import { createMigrationEntry, reportMigrationProgress } from './migration-export.js';
import {
  getMigrationSourceForExport,
  getMigrationSourceBytes,
  serializeMigrationSource,
  shouldResolveMigrationSource,
} from './migration-source.js';
import { isMigratableSettingKey } from './settings-migration.js';

const duplicateBookError = '书籍已存在';
const file = {};

export default file;

file.add = async function ({ title, content, sourceName, sourceFolderPath = null, sourceFolderId = null, source = null }, { checkDuplicate = true } = {}) {
  if (checkDuplicate) {
    const files = await storage.files.list();
    const duplicate = files.find(item => !item.configOnly && (
      (sourceName && item.sourceName === sourceName) ||
      (title && item.title === title)
    ));
    if (duplicate) {
      throw new Error(duplicateBookError);
    }
  }
  const time = new Date();
  const contentLength = typeof content === 'string'
    ? content.length
    : (content?.text?.length || 0);
  const meta = {
    title,
    createTime: time,
    lastAccessTime: time,
    length: contentLength,
    sourceName,
    sourceFolderPath: typeof sourceFolderPath === 'string' && sourceFolderPath ? sourceFolderPath : null,
    sourceFolderId: sourceFolderId == null ? null : String(sourceFolderId),
  };
  await storage.files.add(meta, content, source);
  return meta;
};

file.list = async function () {
  return storage.files.list();
};

file.getMeta = async function (id) {
  return storage.files.getMeta(id);
};

file.setMeta = async function (meta, { updateLastAccessTime = true } = {}) {
  if (updateLastAccessTime) meta.lastAccessTime = new Date();
  delete meta.migrationOrder;
  delete meta.importOrder;
  return storage.files.setMeta(meta);
};

file.getIndex = async function (id) {
  return storage.files.getIndex(id);
};

file.setIndex = async function (index) {
  return storage.files.setIndex(index);
};

file.content = async function (id) {
  return storage.files.getContent(id);
};

file.setContent = async function (id, content) {
  return storage.files.setContent(content, id);
};

file.source = async function (id) {
  return storage.files.getSource(id);
};

file.setSource = async function (id, source) {
  return storage.files.setSource(source, id);
};

file.updateBook = async function (id, content, meta, index, source) {
  return storage.files.updateBook(id, content, meta, index, source);
};

file.remove = async function (id) {
  return storage.files.remove(id);
};

const normalizeDate = function (value, fallback = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(fallback.getTime()) : date;
};

const getImportedOrderTime = function (order, baseTime = new Date()) {
  const normalizedOrder = Number(order);
  if (!Number.isFinite(normalizedOrder)) return null;
  return new Date(baseTime.getTime() - normalizedOrder * 1000);
};

const normalizeIndex = function (index, id, fallbackIndex = null) {
  const source = index && typeof index === 'object' ? index : {};
  const content = source.content && typeof source.content === 'object'
    ? source.content
    : source;
  const fallbackBookmarks = Array.isArray(fallbackIndex?.bookmarks)
    ? fallbackIndex.bookmarks
    : [];
  const bookmarks = Array.isArray(source.bookmarks) ? source.bookmarks : fallbackBookmarks;
  return {
    id,
    content: {
      template: typeof content.template === 'string' ? content.template : '',
      items: Array.isArray(content.items) ? content.items : [],
    },
    bookmarks: bookmarks.map(bookmark => ({
      ...bookmark,
      cursor: Number.isFinite(Number(bookmark?.cursor)) ? Number(bookmark.cursor) : 0,
      createTime: normalizeDate(bookmark?.createTime),
    })),
  };
};

const deserializeSource = function (source) {
  const bytes = getMigrationSourceBytes(source);
  if (!Array.isArray(bytes)) return null;
  return new File(
    [Uint8Array.from(bytes)],
    source.name || 'book.bin',
    { type: source.type || 'application/octet-stream', lastModified: source.lastModified || Date.now() }
  );
};

const getContentText = function (content) {
  return typeof content === 'string' ? content : (typeof content?.text === 'string' ? content.text : '');
};

const getContentLength = function (content) {
  return getContentText(content).length;
};

const normalizeIdentityValue = function (value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
};

const hashBytes = async function (bytes) {
  if (!globalThis.crypto?.subtle?.digest) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
};

const hashText = function (value) {
  return hashBytes(new TextEncoder().encode(value));
};

const hashSource = async function (source) {
  if (!source?.arrayBuffer) return null;
  return hashBytes(await source.arrayBuffer());
};

const normalizeCursor = function (value, length = Number.MAX_SAFE_INTEGER) {
  const cursor = Number(value);
  if (!Number.isFinite(cursor)) return 0;
  return Math.min(Math.max(0, Math.floor(cursor)), Math.max(0, length));
};

const normalizeMigrationSource = function (source) {
  const bytes = getMigrationSourceBytes(source);
  if (!Array.isArray(bytes)) return null;
  if (bytes.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error('Invalid migration source bytes');
  }
  return {
    name: typeof source.name === 'string' ? source.name : null,
    type: typeof source.type === 'string' ? source.type : 'application/octet-stream',
    lastModified: Number.isFinite(Number(source.lastModified)) ? Number(source.lastModified) : 0,
    bytes,
  };
};

const normalizeMigrationContent = function (content) {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object' || typeof content.text !== 'string') return null;
  return {
    text: content.text,
    resources: content.resources && typeof content.resources === 'object' ? content.resources : {},
  };
};

const getMigrationIdentity = async function (meta, content, source) {
  const text = getContentText(content);
  return {
    title: typeof meta?.title === 'string' ? meta.title : '',
    sourceName: typeof meta?.sourceName === 'string' ? meta.sourceName : null,
    sourceFolderPath: typeof meta?.sourceFolderPath === 'string' ? meta.sourceFolderPath : null,
    sourceFolderId: meta?.sourceFolderId == null ? null : String(meta.sourceFolderId),
    contentLength: text.length,
    contentHash: await hashText(text),
    sourceHash: await hashSource(source),
    sourceType: source?.type || null,
    configOnly: meta?.configOnly === true,
  };
};

const clampMigrationIndex = function (index, id, length, fallbackIndex = null) {
  const normalized = normalizeIndex(index || fallbackIndex, id, fallbackIndex);
  normalized.content.items = normalized.content.items.map(item => ({
    ...item,
    cursor: normalizeCursor(item?.cursor, length),
  }));
  normalized.bookmarks = normalized.bookmarks.map(bookmark => ({
    ...bookmark,
    cursor: normalizeCursor(bookmark?.cursor, length),
  }));
  return normalized;
};

const compatibleMigrationIdentity = function (imported, current) {
  if (imported.sourceHash && current.sourceHash && imported.sourceHash !== current.sourceHash) return false;
  if (imported.contentHash && current.contentHash && imported.contentHash !== current.contentHash) return false;
  return true;
};

file.exportMigration = async function (configValues = {}, {
  includeContent = false,
  includeSource = false,
  resolveSource = null,
  onProgress = null,
} = {}) {
  const files = (await file.list()).sort((a, b) => {
    const aTime = normalizeDate(a.lastAccessTime).getTime();
    const bTime = normalizeDate(b.lastAccessTime).getTime();
    return bTime - aTime || Number(a.id) - Number(b.id);
  });
  await reportMigrationProgress(onProgress, {
    current: 0,
    total: files.length,
    phase: 'preparing',
  });
  const books = [];
  for (let order = 0; order < files.length; order++) {
    const meta = files[order];
    const content = await file.content(meta.id);
    let source = await file.source(meta.id);
    if (includeSource && !source && resolveSource) {
      try {
        source = await getMigrationSourceForExport(meta, source, resolveSource);
      } catch (error) {
        console.warn('Migration source export resolve failed:', error.message);
      }
    }
    const entry = await createMigrationEntry({
      identity: await getMigrationIdentity(meta, content, source),
      order,
      meta: {
        title: meta.title,
        sourceName: meta.sourceName || null,
        sourceFolderPath: typeof meta.sourceFolderPath === 'string' && meta.sourceFolderPath
          ? meta.sourceFolderPath
          : null,
        sourceFolderId: meta.sourceFolderId == null ? null : String(meta.sourceFolderId),
        createTime: meta.createTime,
        lastAccessTime: meta.lastAccessTime,
        cursor: normalizeCursor(meta.cursor, getContentLength(content)),
        length: getContentLength(content),
        configOnly: meta.configOnly === true,
        migrationOrder: order,
      },
      index: await file.getIndex(meta.id),
    }, content, source, { includeContent, includeSource, serializeSource: serializeMigrationSource });
    books.push(entry);
    await reportMigrationProgress(onProgress, {
      current: order + 1,
      total: files.length,
      phase: 'completed',
    });
  }
  return {
    format: 'treader-migration',
    version: 2,
    exportedAt: new Date().toISOString(),
    config: configValues,
    books,
  };
};

file.matchBook = async function (entry, currentBooks) {
  const imported = entry?.identity || {};
  const prepared = await Promise.all((currentBooks || []).map(async item => {
    const book = item.book || item;
    const identity = item.identity || await getMigrationIdentity(book, await file.content(book.id), await file.source(book.id));
    return { book, identity };
  }));
  const choose = (candidates, method) => {
    if (candidates.length === 1 && compatibleMigrationIdentity(imported, candidates[0].identity)) {
      return { book: candidates[0].book, method };
    }
    return {
      book: null,
      method: candidates.length ? 'conflict' : 'none',
      candidates: candidates.map(item => item.book),
    };
  };
  if (imported.sourceHash) {
    const result = choose(prepared.filter(item => item.identity.sourceHash === imported.sourceHash), 'sourceHash');
    if (result.book || result.candidates?.length) return result;
  }
  if (imported.contentHash) {
    const result = choose(prepared.filter(item =>
      item.identity.contentHash === imported.contentHash
      && (!Number.isFinite(Number(imported.contentLength)) || item.identity.contentLength === Number(imported.contentLength))
    ), 'contentHash');
    if (result.book || result.candidates?.length) return result;
  }
  const sourceName = normalizeIdentityValue(imported.sourceName);
  if (sourceName) {
    const result = choose(prepared.filter(item => normalizeIdentityValue(item.identity.sourceName) === sourceName), 'sourceName');
    if (result.book || result.candidates?.length) return result;
  }
  const title = normalizeIdentityValue(imported.title);
  if (title) {
    return choose(prepared.filter(item => normalizeIdentityValue(item.identity.title) === title), 'title');
  }
  return { book: null, method: 'none', candidates: [] };
};

file.mergeBookState = async function (target, entry, { restoreContentIfMissing = true, overwriteContent = false, orderBaseTime = new Date() } = {}) {
  const incomingContent = normalizeMigrationContent(entry.content);
  const incomingSourceData = normalizeMigrationSource(entry.source);
  const incomingSource = incomingSourceData ? deserializeSource(incomingSourceData) : null;
  let currentContent = await file.content(target.id);
  let currentSource = await file.source(target.id);
  let contentRestored = false;
  let sourceRestored = false;
  const currentHasContent = currentContent != null && target.configOnly !== true;
  const incomingContentProvided = incomingContent !== null;
  if (incomingContentProvided && (overwriteContent || (!currentHasContent && restoreContentIfMissing))) {
    await file.setContent(target.id, incomingContent);
    currentContent = incomingContent;
    contentRestored = true;
  }
  if (incomingSource && !currentSource && (contentRestored || currentHasContent || restoreContentIfMissing)) {
    await file.setSource(target.id, incomingSource);
    currentSource = incomingSource;
    sourceRestored = true;
  }
  const length = getContentLength(currentContent) || normalizeCursor(target.length);
  const sourceMeta = entry.meta || {};
  target.cursor = normalizeCursor(sourceMeta.cursor, length);
  target.length = length;
  target.createTime = normalizeDate(sourceMeta.createTime, target.createTime || new Date());
  target.lastAccessTime = normalizeDate(sourceMeta.lastAccessTime, target.lastAccessTime || new Date());
  if (sourceMeta.sourceFolderId != null) target.sourceFolderId = String(sourceMeta.sourceFolderId);
  if (typeof sourceMeta.sourceFolderPath === 'string' && sourceMeta.sourceFolderPath) {
    target.sourceFolderPath = sourceMeta.sourceFolderPath;
  }
  if (typeof sourceMeta.sourceName === 'string' && sourceMeta.sourceName) {
    target.sourceName = sourceMeta.sourceName;
  }
  if (Number.isFinite(Number(sourceMeta.migrationOrder))) {
    target.migrationOrder = Number(sourceMeta.migrationOrder);
    target.migrationLastAccessTime = target.lastAccessTime;
    target.lastAccessTime = getImportedOrderTime(target.migrationOrder, orderBaseTime);
  }
  if (currentContent != null) target.configOnly = false;
  const currentIndex = await file.getIndex(target.id);
  const nextIndex = entry.index || currentIndex
    ? clampMigrationIndex(entry.index, target.id, length, currentIndex)
    : { id: target.id, content: { template: '', items: [] }, bookmarks: [] };
  await storage.files.updateState(target.id, target, nextIndex);
  return { contentRestored, sourceRestored, length };
};

file.importMigration = async function (backup, {
  restoreContentIfMissing = true,
  overwriteContent = false,
  resolveSource = null,
  saveSource = null,
  resolveConflict = null,
  onProgress = null,
} = {}) {
  if (!backup || backup.format !== 'treader-migration' || backup.version !== 2 || !Array.isArray(backup.books)) {
    throw new Error('Invalid tReader migration file');
  }
  const currentFiles = await file.list();
  const currentBooks = await Promise.all(currentFiles.map(async book => ({
    book,
    identity: await getMigrationIdentity(book, await file.content(book.id), await file.source(book.id)),
  })));
  const usedTargets = new Set();
  const orderBaseTime = new Date();
  const report = {
    matched: 0,
    restored: 0,
    contentRestored: 0,
    sourceRestored: 0,
    added: 0,
    placeholders: 0,
    unmatched: 0,
    ambiguous: 0,
    pathResolved: 0,
    pathNotFound: 0,
    pathErrors: 0,
    sourceSaved: 0,
    sourceSaveFailed: 0,
    conflicts: [],
    errors: 0,
    total: backup.books.length,
  };
  for (let position = 0; position < backup.books.length; position++) {
    const entry = backup.books[position];
    if (!entry || typeof entry !== 'object' || (!entry.identity && !entry.meta)) {
      report.errors++;
      continue;
    }
    const identity = entry.identity || {};
    const meta = entry.meta || {};
    if (typeof (identity.title || meta.title) !== 'string') {
      report.errors++;
      continue;
    }
    const normalizedEntry = {
      ...entry,
      identity: { ...identity, title: identity.title || meta.title, sourceName: identity.sourceName || meta.sourceName },
      meta: { ...meta, title: meta.title || identity.title, sourceName: meta.sourceName || identity.sourceName },
    };
    if (onProgress) await onProgress({ current: position + 1, total: backup.books.length, title: normalizedEntry.meta.title, phase: 'matching' });
    let resolvedSource = null;
    if (resolveSource && shouldResolveMigrationSource(normalizedEntry)) {
      try {
        resolvedSource = await resolveSource(normalizedEntry);
      } catch (error) {
        report.pathErrors++;
        console.warn('Migration source resolve failed:', error);
      }
      if (resolvedSource) {
        normalizedEntry.content = resolvedSource.content ?? normalizedEntry.content;
        normalizedEntry.source = resolvedSource.source ?? normalizedEntry.source;
        normalizedEntry.identity = {
          ...normalizedEntry.identity,
          ...(resolvedSource.identity || {}),
        };
        report.pathResolved++;
      } else if ((normalizedEntry.meta.sourceFolderId || normalizedEntry.meta.sourceFolderPath) && normalizedEntry.meta.sourceName) {
        report.pathNotFound++;
      }
    }
    const contentText = typeof normalizedEntry.content === 'string'
      ? normalizedEntry.content
      : normalizedEntry.content?.text;
    const saveResolvedSource = async () => {
      if (!saveSource || !(normalizedEntry.source || (typeof contentText === 'string' && contentText.length > 0))) return;
      try {
        const saveResult = await saveSource(normalizedEntry);
        if (saveResult?.saved) {
          report.sourceSaved++;
          if (saveResult.source) normalizedEntry.source = saveResult.source;
          if (typeof saveResult.sourceName === 'string' && saveResult.sourceName) {
            normalizedEntry.identity.sourceName = saveResult.sourceName;
            normalizedEntry.meta.sourceName = saveResult.sourceName;
          }
          if (typeof saveResult.sourceFolderPath === 'string' && saveResult.sourceFolderPath) {
            normalizedEntry.meta.sourceFolderPath = saveResult.sourceFolderPath;
          }
          if (saveResult.sourceFolderId != null) normalizedEntry.meta.sourceFolderId = saveResult.sourceFolderId;
        } else {
          report.sourceSaveFailed++;
        }
      } catch (error) {
        report.sourceSaveFailed++;
        console.warn('Migration source save failed:', error);
      }
    };
    const match = await file.matchBook(normalizedEntry, currentBooks);
    if (match.book) {
      if (usedTargets.has(match.book.id)) {
        report.ambiguous++;
        report.conflicts.push({ title: normalizedEntry.meta.title, method: 'duplicate-target', candidates: [match.book] });
        continue;
      }
      usedTargets.add(match.book.id);
      try {
        await saveResolvedSource();
        const result = await file.mergeBookState(match.book, normalizedEntry, { restoreContentIfMissing, overwriteContent, orderBaseTime });
        report.matched++;
        report.restored++;
        if (result.contentRestored) report.contentRestored++;
        if (result.sourceRestored) report.sourceRestored++;
      } catch (error) {
        report.errors++;
        report.conflicts.push({ title: normalizedEntry.meta.title, method: 'write-failed', error: error.message });
      }
    } else if (match.candidates?.length) {
      let selected = null;
      if (resolveConflict) {
        try {
          selected = await resolveConflict({
            entry: normalizedEntry,
            method: match.method,
            candidates: match.candidates,
          });
        } catch (error) {
          report.errors++;
          report.conflicts.push({ title: normalizedEntry.meta.title, method: 'conflict-resolver-failed', error: error.message });
          continue;
        }
      }
      const selectedBook = selected?.id == null
        ? null
        : match.candidates.find(candidate => String(candidate.id) === String(selected.id));
      if (selectedBook && !usedTargets.has(selectedBook.id)) {
        usedTargets.add(selectedBook.id);
        try {
          await saveResolvedSource();
          const result = await file.mergeBookState(selectedBook, normalizedEntry, { restoreContentIfMissing, overwriteContent, orderBaseTime });
          report.matched++;
          report.restored++;
          if (result.contentRestored) report.contentRestored++;
          if (result.sourceRestored) report.sourceRestored++;
        } catch (error) {
          report.errors++;
          report.conflicts.push({ title: normalizedEntry.meta.title, method: 'write-failed', error: error.message });
        }
      } else {
        report.ambiguous++;
        report.conflicts.push({ title: normalizedEntry.meta.title, method: selectedBook ? 'duplicate-target' : match.method, candidates: match.candidates });
      }
    } else {
      const content = normalizeMigrationContent(normalizedEntry.content);
      let source = null;
      try {
        await saveResolvedSource();
        source = normalizedEntry.source ? deserializeSource(normalizeMigrationSource(normalizedEntry.source)) : null;
        const newMeta = {
          title: normalizedEntry.meta.title,
          createTime: normalizeDate(normalizedEntry.meta.createTime),
          lastAccessTime: normalizeDate(normalizedEntry.meta.lastAccessTime),
          cursor: 0,
          length: content ? getContentLength(content) : 0,
          sourceName: normalizedEntry.meta.sourceName || null,
          sourceFolderPath: typeof normalizedEntry.meta.sourceFolderPath === 'string' && normalizedEntry.meta.sourceFolderPath
            ? normalizedEntry.meta.sourceFolderPath
            : null,
          sourceFolderId: normalizedEntry.meta.sourceFolderId == null ? null : String(normalizedEntry.meta.sourceFolderId),
          configOnly: content == null,
          migrationOrder: Number.isFinite(Number(normalizedEntry.order)) ? Number(normalizedEntry.order) : null,
        };
        if (newMeta.migrationOrder != null) {
          newMeta.migrationLastAccessTime = newMeta.lastAccessTime;
          newMeta.lastAccessTime = getImportedOrderTime(newMeta.migrationOrder, orderBaseTime);
        }
        await storage.files.add(newMeta, content || { text: '', resources: {} }, source);
        newMeta.cursor = normalizeCursor(normalizedEntry.meta.cursor, newMeta.length);
        await storage.files.updateState(
          newMeta.id,
          newMeta,
          clampMigrationIndex(normalizedEntry.index, newMeta.id, newMeta.length)
        );
        currentBooks.push({ book: newMeta, identity: await getMigrationIdentity(newMeta, content, source) });
        report.unmatched++;
        if (content) report.added++;
        else report.placeholders++;
      } catch (error) {
        report.errors++;
        report.conflicts.push({ title: normalizedEntry.meta.title, method: 'add-failed', error: error.message });
      }
    }
    if (onProgress) await onProgress({ current: position + 1, total: backup.books.length, title: normalizedEntry.meta.title, phase: 'completed' });
    if ((position + 1) % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return report;
};

file.exportAll = async function () {
  const files = await file.list();
  const backup = [];
  for (const meta of files) {
    const content = await file.content(meta.id);
    const index = await file.getIndex(meta.id);
    const source = await file.source(meta.id);
    backup.push({ meta, content, index, source: await serializeMigrationSource(source) });
  }
  return backup;
};

file.importBackup = async function (backup) {
  if (!Array.isArray(backup)) throw new Error('Invalid bookshelf backup format');
  let imported = 0;
  const existingFiles = await file.list();
  const existingSourceNames = new Set(existingFiles.map(item => item.sourceName).filter(Boolean));
  const existingTitles = new Set(existingFiles.map(item => item.title).filter(Boolean));
  for (let entryPosition = 0; entryPosition < backup.length; entryPosition++) {
    const entry = backup[entryPosition];
    if (!entry || !entry.meta || typeof entry.meta.title !== 'string') {
      console.warn('跳过无效书籍备份条目');
      continue;
    }
    const { meta, content, index: backupIndex } = entry;
    const duplicate = !entry.meta.configOnly && (
      (meta.sourceName && existingSourceNames.has(meta.sourceName))
      || (meta.title && existingTitles.has(meta.title))
    );
    if (duplicate) {
      console.warn(`跳过已存在的书籍: ${meta.title}`);
      continue;
    }
    const time = new Date();
    const newMeta = {
      title: meta.title,
      createTime: normalizeDate(meta.createTime, time),
      lastAccessTime: normalizeDate(meta.lastAccessTime, time),
      cursor: Number.isFinite(Number(meta.cursor)) ? Math.max(0, Number(meta.cursor)) : 0,
      length: Number.isFinite(Number(meta.length)) ? Math.max(0, Number(meta.length)) : 0,
      sourceName: meta.sourceName || null,
      sourceFolderPath: typeof meta.sourceFolderPath === 'string' && meta.sourceFolderPath
        ? meta.sourceFolderPath
        : null,
    };
    await storage.files.add(newMeta, content, deserializeSource(entry.source));
    await file.setIndex(normalizeIndex(backupIndex, newMeta.id));
    existingFiles.push(newMeta);
    if (newMeta.sourceName) existingSourceNames.add(newMeta.sourceName);
    if (newMeta.title) existingTitles.add(newMeta.title);
    imported++;
    if ((entryPosition + 1) % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return imported;
};

file.exportConfig = async function (configValues = {}) {
  const files = (await file.list()).sort((a, b) => {
    const aTime = normalizeDate(a.lastAccessTime).getTime();
    const bTime = normalizeDate(b.lastAccessTime).getTime();
    return bTime - aTime || Number(a.id) - Number(b.id);
  });
  const books = [];
  await Promise.resolve();
  for (let order = 0; order < files.length; order++) {
    const meta = files[order];
    const index = await file.getIndex(meta.id);
    books.push({
      order,
      title: meta.title,
      sourceName: meta.sourceName || null,
      sourceFolderPath: typeof meta.sourceFolderPath === 'string' && meta.sourceFolderPath
        ? meta.sourceFolderPath
        : null,
      createTime: meta.createTime,
      lastAccessTime: meta.lastAccessTime,
      cursor: Number.isFinite(meta.cursor) ? meta.cursor : 0,
      length: Number.isFinite(meta.length) ? meta.length : 0,
      configOnly: meta.configOnly === true,
      index: index ? {
        content: index.content || { template: '', items: [] },
        bookmarks: Array.isArray(index.bookmarks) ? index.bookmarks : [],
      } : null,
    });
  }
  return {
    format: 'treader-config',
    version: 1,
    exportedAt: new Date().toISOString(),
    config: configValues,
    books,
  };
};

file.importConfig = async function (backup) {
  if (!backup || backup.format !== 'treader-config' || backup.version !== 1 || !Array.isArray(backup.books)) {
    throw new Error('Invalid tReader configuration file');
  }
  const currentFiles = await file.list();
  const bySourceName = new Map(currentFiles.filter(item => item.sourceName).map(item => [item.sourceName, item]));
  const byTitle = new Map();
  for (const item of currentFiles) {
    const candidates = byTitle.get(item.title) || [];
    candidates.push(item);
    byTitle.set(item.title, candidates);
  }
  let restored = 0;
  let missing = 0;
  let addedPlaceholders = 0;
  const orderBaseTime = new Date();
  for (const book of backup.books) {
    if (!book || typeof book.title !== 'string') continue;
    const titleCandidates = byTitle.get(book.title) || [];
    const importedOrder = Number(book.order);
    const time = Number.isFinite(importedOrder)
      ? getImportedOrderTime(importedOrder, orderBaseTime)
      : normalizeDate(book.lastAccessTime || book.createTime);
    const target = book.sourceName
      ? bySourceName.get(book.sourceName)
      : (titleCandidates.length === 1 ? titleCandidates[0] : null);
    if (!target) {
      const placeholder = await file.add({
        title: book.title,
        sourceName: book.sourceName || null,
        sourceFolderPath: typeof book.sourceFolderPath === 'string' && book.sourceFolderPath
          ? book.sourceFolderPath
          : null,
        content: { text: '', resources: {} },
      }, { checkDuplicate: false });
      placeholder.createTime = normalizeDate(book.createTime, time);
      placeholder.lastAccessTime = time;
      placeholder.cursor = Number.isFinite(book.cursor) ? Math.max(0, book.cursor) : 0;
      placeholder.length = Number.isFinite(book.length) ? book.length : 0;
      placeholder.configOnly = true;
      if (Number.isFinite(importedOrder)) placeholder.importOrder = importedOrder;
      await storage.files.setMeta(placeholder);
      if (book.index && typeof book.index === 'object') {
        await file.setIndex(normalizeIndex(book.index, placeholder.id));
      }
      missing++;
      addedPlaceholders++;
      byTitle.set(book.title, [...titleCandidates, placeholder]);
      if (placeholder.sourceName) bySourceName.set(placeholder.sourceName, placeholder);
      continue;
    }
    target.cursor = Number.isFinite(book.cursor) ? Math.max(0, book.cursor) : 0;
    if (typeof book.sourceFolderPath === 'string' && book.sourceFolderPath) {
      target.sourceFolderPath = book.sourceFolderPath;
    }
    if (book.createTime) target.createTime = new Date(book.createTime);
    target.lastAccessTime = time;
    if (Number.isFinite(importedOrder)) target.importOrder = importedOrder;
    await storage.files.setMeta(target);
    if (book.index && typeof book.index === 'object') {
      const currentIndex = await file.getIndex(target.id);
      await file.setIndex(normalizeIndex(book.index, target.id, currentIndex));
    }
    restored++;
  }
  return { restored, missing, addedPlaceholders, total: backup.books.length };
};

file.exportSettings = async function () {
  const entries = await storage.config.getAllEntries();
  const serializable = {};
  for (const [key, value] of entries || []) {
    if (!isMigratableSettingKey(key)) continue;
    try {
      serializable[key] = structuredClone(value);
    } catch (_error) {
      console.warn(`Skipping non-serializable setting: ${key}`);
    }
  }
  return serializable;
};

file.importSettings = async function (values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid settings');
  for (const [key, value] of Object.entries(values)) {
    if (!isMigratableSettingKey(key)) continue;
    await storage.config.setItem(value, key);
  }
};

file.restorePlaceholder = async function (meta) {
  const files = await file.list();
  const placeholder = files.find(item => item.configOnly && meta.sourceName && item.sourceName === meta.sourceName)
    || (!meta.sourceName
      ? files.find(item => item.configOnly && item.title === meta.title)
      : null);
  if (!placeholder) return false;
  const placeholderIndex = await file.getIndex(placeholder.id);
  meta.cursor = Number.isFinite(placeholder.cursor) ? placeholder.cursor : 0;
  meta.createTime = placeholder.createTime || meta.createTime;
  meta.lastAccessTime = placeholder.lastAccessTime || meta.lastAccessTime;
  if (Number.isFinite(Number(placeholder.migrationOrder))) {
    meta.migrationOrder = Number(placeholder.migrationOrder);
  }
  if (Number.isFinite(Number(placeholder.importOrder))) {
    meta.importOrder = Number(placeholder.importOrder);
  }
  if (!meta.sourceFolderPath && placeholder.sourceFolderPath) {
    meta.sourceFolderPath = placeholder.sourceFolderPath;
  }
  await storage.files.setMeta(meta);
  if (placeholderIndex) {
    await file.setIndex(normalizeIndex(placeholderIndex, meta.id));
  }
  await file.remove(placeholder.id);
  return true;
};
