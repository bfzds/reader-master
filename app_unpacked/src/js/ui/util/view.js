/**
 * Keep visual and accessibility state changes together for reusable page views.
 * @param {HTMLElement} element
 * @param {boolean} hidden
 * @param {string} hiddenClass
 */
export const setViewHidden = function (element, hidden, hiddenClass) {
  element.classList.toggle(hiddenClass, hidden);
  if (hidden) element.setAttribute('aria-hidden', 'true');
  else element.removeAttribute('aria-hidden');
};
