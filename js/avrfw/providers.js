(function(root){
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime must be loaded before providers');

  env.register('providers', (api) => {
    const Global = api.global;
    const HUB_KEY = '__AVRFW_PROVIDERS__';
    if (!Global[HUB_KEY]) Global[HUB_KEY] = { defs: Object.create(null), waiters: Object.create(null) };

    function provide(name, def) {
      Global[HUB_KEY].defs[name] = def;
      const waiters = Global[HUB_KEY].waiters[name] || [];
      waiters.forEach(fn => { try { fn(def); } catch (e) { } });
      Global[HUB_KEY].waiters[name] = [];
    }

    function wait(name) {
      const existing = Global[HUB_KEY].defs[name];
      if (existing) return Promise.resolve(existing);
      return new Promise(resolve => {
        (Global[HUB_KEY].waiters[name] ||= []).push(resolve);
      });
    }

    return { provide, wait, HUB_KEY };
  });
})(typeof self !== 'undefined' ? self : this);
