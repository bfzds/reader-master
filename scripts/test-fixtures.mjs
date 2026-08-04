let databaseSequence = 0;

const waitForOpen = request => new Promise((resolve, reject) => {
  request.addEventListener('success', () => resolve(request.result), { once: true });
  request.addEventListener('error', () => reject(request.error || new Error('Unable to open test database')), { once: true });
});

export const createTestDatabase = async function (databaseFactory, { version = 1, upgrade } = {}) {
  const name = `treader-test-${Date.now()}-${++databaseSequence}`;
  const request = databaseFactory.open(name, version);
  if (upgrade) request.addEventListener('upgradeneeded', () => upgrade(request.result, request.transaction), { once: true });
  const db = await waitForOpen(request);
  return {
    name,
    db,
    async cleanup() {
      db.close();
      await new Promise((resolve, reject) => {
        const deletion = databaseFactory.deleteDatabase(name);
        deletion.addEventListener('success', resolve, { once: true });
        deletion.addEventListener('error', () => reject(deletion.error || new Error(`Unable to delete ${name}`)), { once: true });
      });
    },
  };
};

export const createControlledWorkerFactory = function () {
  const created = [];
  class Worker extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.messages = [];
      this.terminated = false;
      created.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
    emitMessage(data) {
      const event = new Event('message');
      Object.defineProperty(event, 'data', { value: data });
      this.dispatchEvent(event);
    }
    emitError(error = new Error('Worker failed'), type = 'error') {
      const event = new Event(type);
      Object.defineProperty(event, 'error', { value: error });
      this.dispatchEvent(event);
    }
  }
  return { Worker, created };
};

export const createControlledClock = function () {
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay = 0) {
      const id = ++sequence;
      timers.set(id, { callback, due: now + Math.max(delay, 0), id });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    advance(duration) {
      now += duration;
      const due = [...timers.values()]
        .filter(timer => timer.due <= now)
        .sort((left, right) => left.due - right.due || left.id - right.id);
      due.forEach(timer => {
        if (!timers.delete(timer.id)) return;
        timer.callback();
      });
    },
  };
};

export const createResourceUrlTracker = function () {
  let sequence = 0;
  const created = [];
  const revoked = [];
  return {
    created,
    revoked,
    createObjectURL() {
      const url = `blob:treader-test-${++sequence}`;
      created.push(url);
      return url;
    },
    revokeObjectURL(url) {
      revoked.push(url);
    },
  };
};

export const createZipFactory = function (files) {
  return class JSZip {
    async loadAsync() {
      return this;
    }
    file(path) {
      if (!Object.hasOwn(files, path)) return null;
      return {
        async async() {
          const value = files[path];
          if (value instanceof Error) throw value;
          return typeof value === 'function' ? value() : value;
        },
      };
    }
  };
};
