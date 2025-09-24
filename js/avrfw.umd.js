/* avrfw.umd.js - modular build */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], function () { return factory(root); });
  else if (typeof module === 'object' && module.exports) module.exports = factory(typeof globalThis !== 'undefined' ? globalThis : root);
  else root.AVRFW = factory(root);
}(typeof self !== 'undefined' ? self : this, function (root) {
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime not loaded');

  const providers = env.require('providers');
  const i18n = env.require('i18n');
  const utils = env.require('utils');
  const reactivity = env.require('reactivity');
  env.require('compiler');
  env.require('css');
  const app = env.require('app');

  const api = {
    createApp: app.createApp,
    reactive: reactivity.reactive,
    effect: reactivity.effect,
    deepSet: utils.deepSet,
    setI18n: i18n.setI18n,
    t: i18n.t,
    translate: i18n.translate,
    createTranslator: utils.createTranslator,
    getBackend: utils.getBackend,
    ensureBackend: utils.ensureBackend,
    toArray: utils.toArray,
    createViewProvider: utils.createViewProvider,
    provide: providers.provide
  };

  root.AVRFW = api;
  return api;
}));
