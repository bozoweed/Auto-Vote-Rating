(function(root){
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime must be loaded before css');

  env.register('css', () => {
    function injectStyle(id, css) {
      if (!css) return null;
      let el = document.querySelector(`style[data-avrfw-style="${id}"]`);
      if (el) {
        el.textContent = css;
        return el;
      }
      el = document.createElement('style');
      el.setAttribute('data-avrfw-style', id);
      el.textContent = css;
      document.head.appendChild(el);
      return el;
    }

    return { injectStyle };
  });
})(typeof self !== 'undefined' ? self : this);
