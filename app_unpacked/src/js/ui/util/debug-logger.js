import config from '../../data/config.js';
import {
  MAX_DEBUG_LOG_ENTRIES,
  appendDebugEntry,
  clampDebugLoggerPosition,
  formatDebugMessage,
  normalizeDebugLoggerPosition,
} from './debug-logger-core.js';

const DEBUG_LOGGER_POSITION_NAME = 'debug.logger_position';

let initialized = false;
let loggerDiv = null;
let loggerList = null;
let pauseInput = null;
let logEntries = [];
let dragState = null;

const levelNames = {
  log: 'LOG',
  info: 'INFO',
  debug: 'DEBUG',
  warn: 'WARN',
  error: 'ERROR',
};

const formatTime = function (date) {
  return date.toLocaleTimeString('zh-CN', { hour12: false });
};

const createButton = function (label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
};

const renderEntry = function (entry) {
  if (!loggerList) return;
  const item = document.createElement('div');
  item.className = `debug-logger-entry debug-logger-${entry.type}`;
  const meta = document.createElement('span');
  meta.className = 'debug-logger-entry-meta';
  meta.textContent = `${formatTime(entry.time)} ${levelNames[entry.type] || entry.type.toUpperCase()}`;
  const message = document.createElement('span');
  message.className = 'debug-logger-entry-message';
  message.textContent = entry.message;
  item.append(meta, message);
  loggerList.appendChild(item);
  while (loggerList.childElementCount > MAX_DEBUG_LOG_ENTRIES) {
    loggerList.firstElementChild.remove();
  }
  if (!pauseInput?.checked) loggerList.scrollTop = loggerList.scrollHeight;
};

const clearLogs = function () {
  logEntries = [];
  if (loggerList) loggerList.replaceChildren();
};

const saveLoggerPosition = function () {
  if (!loggerDiv) return;
  const rect = loggerDiv.getBoundingClientRect();
  void config.set(DEBUG_LOGGER_POSITION_NAME, { left: rect.left, top: rect.top });
};

const stopDragging = function ({ savePosition = false } = {}) {
  if (!dragState) return;
  document.removeEventListener('pointermove', dragState.onMove, true);
  document.removeEventListener('pointerup', dragState.onUp, true);
  if (savePosition) saveLoggerPosition();
  loggerDiv?.classList.remove('debug-logger-dragging');
  dragState = null;
};

const startDragging = function (event) {
  if (!loggerDiv || event.button !== 0 || event.target.closest?.('button, input, label')) return;
  const rect = loggerDiv.getBoundingClientRect();
  const onMove = moveEvent => {
    if (!dragState || !loggerDiv) return;
    const position = clampDebugLoggerPosition({
      left: moveEvent.clientX - dragState.offsetX,
      top: moveEvent.clientY - dragState.offsetY,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    loggerDiv.style.left = `${position.left}px`;
    loggerDiv.style.top = `${position.top}px`;
    loggerDiv.style.right = 'auto';
  };
  const onUp = () => stopDragging({ savePosition: true });
  dragState = {
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    onMove,
    onUp,
  };
  loggerDiv.classList.add('debug-logger-dragging');
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);
  event.preventDefault();
};

const restoreLoggerPosition = async function (panel) {
  const saved = normalizeDebugLoggerPosition(await config.get(DEBUG_LOGGER_POSITION_NAME, null));
  if (!saved || loggerDiv !== panel) return;
  const rect = panel.getBoundingClientRect();
  const position = clampDebugLoggerPosition({
    ...saved,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  panel.style.left = `${position.left}px`;
  panel.style.top = `${position.top}px`;
  panel.style.right = 'auto';
};

const createLoggerPanel = async function () {
  const existing = document.getElementById('debug-logger');
  if (existing) existing.remove();
  logEntries = [];
  pauseInput = null;
  loggerList = null;

  const panel = document.createElement('div');
  loggerDiv = panel;
  panel.id = 'debug-logger';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', '调试日志');
  const toolbar = document.createElement('div');
  toolbar.className = 'debug-logger-toolbar';
  toolbar.addEventListener('pointerdown', startDragging);
  const title = document.createElement('strong');
  title.textContent = '调试日志';
  const clearButton = createButton('清空', clearLogs);
  const pauseLabel = document.createElement('label');
  pauseInput = document.createElement('input');
  pauseInput.type = 'checkbox';
  pauseLabel.append(pauseInput, ' 暂停滚动');
  toolbar.append(title, clearButton, pauseLabel);

  loggerList = document.createElement('div');
  loggerList.className = 'debug-logger-list';
  loggerList.setAttribute('role', 'log');
  loggerList.setAttribute('aria-live', 'polite');
  panel.append(toolbar, loggerList);
  document.body.appendChild(panel);
  await restoreLoggerPosition(panel);
};

const updateDebugLoggerState = async (enabled) => {
  if (enabled) {
    if (!loggerDiv) await createLoggerPanel();
  } else if (loggerDiv) {
    stopDragging();
    loggerDiv.remove();
    loggerDiv = null;
    loggerList = null;
    pauseInput = null;
    logEntries = [];
  }
};

const logToScreen = (type, args) => {
  if (!loggerDiv) return;
  const entry = {
    type,
    time: new Date(),
    message: formatDebugMessage(args),
  };
  logEntries = appendDebugEntry(logEntries, entry);
  renderEntry(entry);
};

const setupDebugLoggerHooks = () => {
  if (window.__debugLoggerHooksInstalled) return;
  window.__debugLoggerHooksInstalled = true;

  ['log', 'info', 'debug', 'warn', 'error'].forEach(type => {
    const original = console[type];
    if (typeof original !== 'function') return;
    console[type] = (...args) => {
      original.apply(console, args);
      logToScreen(type, args);
    };
  });
};

export const init = async () => {
  if (initialized) return;
  initialized = true;

  setupDebugLoggerHooks();

  const enabled = await config.get('debug.show_console', false);
  await updateDebugLoggerState(enabled);

  config.addListener('debug.show_console', value => {
    void updateDebugLoggerState(value);
  });
};
