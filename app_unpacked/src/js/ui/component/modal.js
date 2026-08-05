/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

const modal = {};

export default modal;

/**
 * @template Request
 * @template Result
 * @param {(request: Request) => Promise<Result> | Result} processor
 */
export const createNotificationQueue = function (processor) {
  const pending = [];
  let draining = false;

  const drain = async () => {
    if (draining) return;
    draining = true;
    while (pending.length) {
      const item = pending.shift();
      try {
        item.resolve(await processor(item.request));
      } catch (error) {
        item.reject(error);
      }
    }
    draining = false;
  };

  return {
    enqueue(request) {
      return new Promise((resolve, reject) => {
        pending.push({ request, resolve, reject });
        void drain();
      });
    },
  };
};

let hostPromise = null;
let hosts = null;

const getHosts = function () {
  if (hosts) return Promise.resolve(hosts);
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('Notification UI requires a document'));
  }
  const create = () => {
    if (!document.body) throw new Error('Notification UI requires document.body');
    const modalHost = document.createElement('div');
    modalHost.className = 'modal-host';
    const toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    document.body.append(modalHost, toastHost);
    hosts = { modalHost, toastHost };
    return hosts;
  };
  if (document.body) return Promise.resolve(create());
  if (!hostPromise) {
    hostPromise = new Promise((resolve, reject) => {
      const onReady = () => {
        document.removeEventListener('DOMContentLoaded', onReady);
        try {
          resolve(create());
        } catch (error) {
          reject(error);
        }
      };
      document.addEventListener('DOMContentLoaded', onReady, { once: true });
    }).catch(error => {
      hostPromise = null;
      throw error;
    });
  }
  return hostPromise;
};

const renderModal = async function (request) {
  const { modalHost } = await getHosts();
  return new Promise((resolve, reject) => {
    let settled = false;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const panel = document.createElement('div');
    panel.className = 'modal-panel';
    const title = request.options?.title;
    if (title) {
      const titleElement = document.createElement('div');
      titleElement.className = 'modal-title';
      titleElement.textContent = title;
      panel.appendChild(titleElement);
    }
    const message = document.createElement('div');
    message.className = 'modal-message';
    message.textContent = request.message;
    panel.appendChild(message);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const close = value => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(value);
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      overlay.remove();
      reject(error);
    };
    const addButton = (text, value, className) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = text;
      button.addEventListener('click', () => close(value));
      actions.appendChild(button);
    };

    try {
      if (request.type === 'confirm') {
        addButton(request.options?.cancelText, false, 'modal-button modal-button-cancel');
        addButton(request.options?.confirmText, true, 'modal-button modal-button-confirm');
        overlay.addEventListener('click', event => {
          if (event.target === overlay) close(false);
        });
      } else {
        addButton(request.options?.closeText, undefined, 'modal-button modal-button-close');
      }
      panel.appendChild(actions);
      overlay.appendChild(panel);
      modalHost.appendChild(overlay);
    } catch (error) {
      fail(error);
    }
  });
};

const modalQueue = createNotificationQueue(renderModal);

modal.alert = function (message, options = {}) {
  return modalQueue.enqueue({ type: 'alert', message, options }).then(() => undefined);
};

modal.confirm = function (message, options = {}) {
  return modalQueue.enqueue({ type: 'confirm', message, options });
};

modal.toast = function (message, options = {}) {
  void getHosts().then(({ toastHost }) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toastHost.appendChild(toast);
    const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration) : 3000;
    setTimeout(() => toast.remove(), duration);
  }).catch(error => {
    console.warn('Notification toast failed:', error);
  });
};
