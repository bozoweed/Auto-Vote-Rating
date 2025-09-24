(function(root){
  const env = root.__AVRFW__;
  if (!env) throw new Error('[AVRFW] runtime must be loaded before compiler');

  env.register('compiler', (api) => {
    const { parsePath, deepSet, toArray } = api.require('utils');
    const { effect, cleanupEffect } = api.require('reactivity');

    const exprCache = new Map();
    function compileExpr(expr) {
      const key = String(expr || '').trim();
      if (exprCache.has(key)) return exprCache.get(key);
      const fn = new Function('state', 'ctx', 'methods', 'event',
        `try{ with(state){ with(ctx){ return (${key}); } } }catch(e){ return undefined }`);
      exprCache.set(key, fn);
      return fn;
    }

    const hasAttr = (el, n) => el.hasAttribute('av-' + n) || el.hasAttribute('data-av-' + n);
    const getAttr = (el, n) => el.getAttribute('av-' + n) ?? el.getAttribute('data-av-' + n);
    const setDisplay = (el, show) => { if (show) el.style.removeProperty('display'); else el.style.display = 'none'; };

    function compileNode(el, ctx, wiring) {
      const { state, methods, cleanups } = wiring;

      if (hasAttr(el, 'each')) {
        const def = (getAttr(el, 'each') || '');
        const m = def.match(/^\s*([a-zA-Z_$][\w$]*)(?:\s*,\s*([a-zA-Z_$][\w$]*))?\s+in\s+(.+)\s*$/);
        if (!m) return;

        const varItem = m[1];
        const varIdx = m[2] || '$index';
        const listExpr = m[3];
        const listGetter = compileExpr(listExpr);

        const tplNodes = toArray(el.childNodes).map(n => n.cloneNode(true));
        el.innerHTML = '';

        function compileTextNode(textNode, rowCtx, rowCleanups) {
          const raw = textNode.nodeValue;
          if (!raw || raw.indexOf('{{') === -1) return;
          const parts = [];
          const re = /{{([^}]+)}}/g;
          let last = 0; let match;
          while ((match = re.exec(raw))) {
            if (match.index > last) parts.push({ type: 'text', v: raw.slice(last, match.index) });
            const ex = match[1].trim();
            parts.push({ type: 'expr', v: ex, fn: compileExpr(ex) });
            last = re.lastIndex;
          }
          if (last < raw.length) parts.push({ type: 'text', v: raw.slice(last) });

          const eff = effect(() => {
            const out = parts.map(p => p.type === 'text' ? p.v : (p.fn(state, rowCtx, methods) ?? '')).join('');
            textNode.nodeValue = out;
          });
          rowCleanups.push(() => cleanupEffect(eff));
        }

        const rowTeardowns = [];
        function clearRows() {
          while (rowTeardowns.length) {
            const td = rowTeardowns.pop();
            try { td(); } catch (e) { }
          }
        }

        const render = () => {
          const arr = listGetter(state, ctx, methods) || [];
          clearRows();
          el.textContent = '';

          arr.forEach((item, i) => {
            const rowCtx = Object.create(ctx || null);
            rowCtx[varItem] = item;
            rowCtx[varIdx] = i;

            const frag = document.createDocumentFragment();
            tplNodes.forEach(n => frag.appendChild(n.cloneNode(true)));
            const start = el.childNodes.length;
            el.appendChild(frag);

            const appended = toArray(el.childNodes).slice(start);
            const rowCleanups = [];

            appended.forEach(n => {
              if (n.nodeType === 1) {
                compileChildren(n, rowCtx, { state, methods, cleanups: rowCleanups });
              } else if (n.nodeType === 3) {
                compileTextNode(n, rowCtx, rowCleanups);
              }
            });

            rowTeardowns.push(() => {
              rowCleanups.forEach(fn => { try { fn(); } catch (e) { } });
            });
          });
        };

        const eff = effect(render);
        cleanups.push(() => {
          cleanupEffect(eff);
          clearRows();
        });
        return;
      }

      if (hasAttr(el, 'model')) {
        const modelExpr = (getAttr(el, 'model') || '').trim();
        const segs = parsePath(modelExpr);
        const isInputLike = ('value' in el) || (el.tagName === 'SELECT');
        const isCheck = (el.type === 'checkbox');
        const isRadio = (el.type === 'radio');
        const isMulti = (el.tagName === 'SELECT' && el.multiple);
        const getter = compileExpr(modelExpr);
        const syncFromState = () => {
          const v = getter(state, ctx, methods);
          if (!isInputLike) return;
          if (isCheck) el.checked = !!v;
          else if (isRadio) el.checked = (String(el.value) === String(v));
          else if (isMulti && Array.isArray(v)) toArray(el.options).forEach(o => o.selected = v.includes(o.value));
          else el.value = (v ?? '');
        };
        const eff = effect(syncFromState);
        cleanups.push(() => cleanupEffect(eff));
        const onDom = () => {
          let v;
          if (isCheck) v = !!el.checked;
          else if (isRadio) { if (!el.checked) return; v = el.value; }
          else if (isMulti) v = toArray(el.selectedOptions).map(o => o.value);
          else v = el.value;
          deepSet(state, segs, v);
        };
        el.addEventListener(isRadio ? 'change' : 'input', onDom);
        cleanups.push(() => el.removeEventListener(isRadio ? 'change' : 'input', onDom));
      }

      if (hasAttr(el, 'text')) {
        const getter = compileExpr(getAttr(el, 'text'));
        const eff = effect(() => { el.textContent = getter(state, ctx, methods) ?? ''; });
        cleanups.push(() => cleanupEffect(eff));
      }

      if (hasAttr(el, 'html')) {
        const getter = compileExpr(getAttr(el, 'html'));
        const eff = effect(() => { el.innerHTML = getter(state, ctx, methods) ?? ''; });
        cleanups.push(() => cleanupEffect(eff));
      }

      if (hasAttr(el, 'show')) {
        const getter = compileExpr(getAttr(el, 'show'));
        const eff = effect(() => setDisplay(el, !!getter(state, ctx, methods)));
        cleanups.push(() => cleanupEffect(eff));
      }

      Array.from(el.attributes).forEach(a => {
        if (!/^data-av-class-|^av-class-/.test(a.name)) return;
        const cls = a.name.replace(/^data-av-class-|^av-class-/, '');
        const getter = compileExpr(a.value);
        const eff = effect(() => el.classList.toggle(cls, !!getter(state, ctx, methods)));
        cleanups.push(() => cleanupEffect(eff));
      });

      Array.from(el.attributes).forEach(a => {
        if (!/^data-av-attr-|^av-attr-/.test(a.name)) return;
        const name = a.name.replace(/^data-av-attr-|^av-attr-/, '');
        const getter = compileExpr(a.value);
        const eff = effect(() => {
          const v = getter(state, ctx, methods);
          if (v === false || v == null) el.removeAttribute(name);
          else el.setAttribute(name, String(v));
        });
        cleanups.push(() => cleanupEffect(eff));
      });

      if (hasAttr(el, 'on')) {
        const def = (getAttr(el, 'on') || '').split(';').map(s => s.trim()).filter(Boolean);
        def.forEach(w => {
          const [evt, expr] = w.split(':').map(s => s.trim());
          if (!evt || !expr) return;
          const handler = compileExpr(expr);
          const fn = (e) => handler(state, ctx, methods, e);
          el.addEventListener(evt, fn);
          cleanups.push(() => el.removeEventListener(evt, fn));
        });
      }

      Array.from(el.attributes).forEach(a => {
        if (!/^data-av-on-|^av-on-/.test(a.name)) return;
        const evt = a.name.replace(/^data-av-on-|^av-on-/, '');
        const handler = compileExpr(a.value);
        const fn = (e) => handler(state, ctx, methods, e);
        el.addEventListener(evt, fn);
        cleanups.push(() => el.removeEventListener(evt, fn));
      });

      toArray(el.childNodes).forEach(n => {
        if (n.nodeType !== 3) return;
        const raw = n.nodeValue;
        if (!raw || raw.indexOf('{{') === -1) return;
        const parts = [];
        const re = /{{([^}]+)}}/g;
        let last = 0; let m;
        while ((m = re.exec(raw))) {
          if (m.index > last) parts.push({ type: 'text', v: raw.slice(last, m.index) });
          const expr = m[1].trim();
          parts.push({ type: 'expr', v: expr, fn: compileExpr(expr) });
          last = re.lastIndex;
        }
        if (last < raw.length) parts.push({ type: 'text', v: raw.slice(last) });
        const eff = effect(() => {
          const out = parts.map(p => p.type === 'text' ? p.v : (p.fn(state, ctx, methods) ?? '')).join('');
          n.nodeValue = out;
        });
        cleanups.push(() => cleanupEffect(eff));
      });
    }

    function compileChildren(rootNode, ctx, wiring) {
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT, null);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      if (rootNode.nodeType === 1) nodes.unshift(rootNode);
      nodes.forEach(el => compileNode(el, ctx, wiring));
    }

    return { compileExpr, compileNode, compileChildren };
  });
})(typeof self !== 'undefined' ? self : this);
