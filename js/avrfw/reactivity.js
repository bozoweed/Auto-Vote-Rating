(function(root){
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime must be loaded before reactivity');

  env.register('reactivity', (api) => {
    const { isObj } = api.require('utils');

    const targetMap = new WeakMap();
    let activeEffect = null;

    const jobQueue = new Set();
    let flushing = false;
    function flushJobs() {
      flushing = true;
      jobQueue.forEach(fn => fn());
      jobQueue.clear();
      flushing = false;
    }
    function queueJob(job) {
      jobQueue.add(job);
      if (!flushing) Promise.resolve().then(flushJobs);
    }

    function track(target, key) {
      if (!activeEffect) return;
      let deps = targetMap.get(target);
      if (!deps) targetMap.set(target, (deps = new Map()));
      let dep = deps.get(key);
      if (!dep) deps.set(key, (dep = new Set()));
      if (!dep.has(activeEffect)) {
        dep.add(activeEffect);
        activeEffect.deps.push(dep);
      }
    }

    function trigger(target, key) {
      const deps = targetMap.get(target);
      if (!deps) return;
      const effects = deps.get(key);
      if (effects) effects.forEach(queueJob);
      const all = deps.get('*');
      if (all) all.forEach(queueJob);
    }

    function cleanupEffect(eff) {
      eff.deps.forEach(d => d.delete(eff));
      eff.deps.length = 0;
    }

    function effect(fn, opts = {}) {
      const eff = function () {
        cleanupEffect(eff);
        activeEffect = eff;
        try {
          return fn();
        } finally {
          activeEffect = null;
        }
      };
      eff.deps = [];
      if (!opts.lazy) eff();
      return eff;
    }

    const reactiveCache = new WeakMap();
    function reactive(obj) {
      if (!isObj(obj)) return obj;
      if (reactiveCache.has(obj)) return reactiveCache.get(obj);
      const proxy = new Proxy(obj, {
        get(target, key, receiver) {
          if (key === '__isReactive') return true;
          const value = Reflect.get(target, key, receiver);
          track(target, key);
          return isObj(value) ? reactive(value) : value;
        },
        set(target, key, value, receiver) {
          const old = target[key];
          const result = Reflect.set(target, key, value, receiver);
          if (old !== value) {
            trigger(target, key);
            trigger(target, '*');
          }
          return result;
        },
        deleteProperty(target, key) {
          const result = Reflect.deleteProperty(target, key);
          trigger(target, key);
          trigger(target, '*');
          return result;
        }
      });
      reactiveCache.set(obj, proxy);
      return proxy;
    }

    return { reactive, effect, cleanupEffect };
  });
})(typeof self !== 'undefined' ? self : this);
