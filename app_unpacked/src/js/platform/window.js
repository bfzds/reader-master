import runtime from './runtime.js';

const platformWindow = {};

export default platformWindow;

const sizeReg = /^(\d+)x(\d+)$/;

platformWindow.supported = function () {
  return runtime.supportTauri();
};

platformWindow.normalizeSize = function (value, fallback = '1920x1080') {
  if (typeof value !== 'string') return fallback;
  const match = value.match(sizeReg);
  if (!match) return fallback;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return fallback;
  if (width < 900 || height < 600) return fallback;
  return `${Math.floor(width)}x${Math.floor(height)}`;
};

platformWindow.applySize = async function (value) {
  if (!platformWindow.supported()) return false;
  const normalized = platformWindow.normalizeSize(value);
  const [, width, height] = normalized.match(sizeReg);
  try {
    const invoke = runtime.getTauriInvoker();
    if (!invoke) return false;
    await invoke('set_window_size', { width: Number(width), height: Number(height) });
    return true;
  } catch (_error) {
    return false;
  }
};
