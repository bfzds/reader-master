const runtime = {};

export default runtime;

const getTauriCore = function () {
  return window.__TAURI__?.core || window.__TAURI_INTERNALS__ || null;
};

runtime.getTauriInvoker = function () {
  const core = getTauriCore();
  if (!core || typeof core.invoke !== 'function') return null;
  return core.invoke.bind(core);
};

runtime.getTauriEventListener = function () {
  const event = window.__TAURI__?.event;
  if (!event || typeof event.listen !== 'function') return null;
  return event.listen.bind(event);
};

runtime.supportTauri = function () {
  return typeof runtime.getTauriInvoker() === 'function';
};

runtime.kind = function () {
  return runtime.supportTauri() ? 'tauri' : 'browser';
};

runtime.isDesktopShell = function () {
  return runtime.kind() === 'tauri';
};
