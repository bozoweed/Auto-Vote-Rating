(function(root){
  const globalScope = typeof self !== 'undefined' ? self : root;
  if (globalScope.__AVRFW__) return;

  const modules = Object.create(null);
  const api = {
    global: globalScope,
    modules,
    register(name, factory) {
      if (modules[name]) return modules[name];
      if (typeof factory !== 'function') throw new Error('[AVRFW] Factory for ' + name + ' must be a function');
      const mod = factory(api);
      modules[name] = mod;
      return mod;
    },
    require(name) {
      const mod = modules[name];
      if (!mod) throw new Error('[AVRFW] Module "' + name + '" is not registered');
      return mod;
    }
  };

  globalScope.__AVRFW__ = api;
})(typeof self !== 'undefined' ? self : this);
