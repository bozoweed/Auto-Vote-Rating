/*!
  Letters ASR Minimal Browser Client (single-file)
  - Classic script: window.LettersASRClient
  - Module script: import './letters-asr-client.js'; then new window.LettersASRClient(...)
  - One main function: client.transcribe(input, { language?, attachTo?, stream?, filename?, mimeType? })
    * input: File | Blob | string (data URL or raw base64)
    * attachTo: optional Element or CSS selector to mount a status widget
    * stream: default true (uses SSE /letters/stream), false => /letters/b64
*/

(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LettersASRClient = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- tiny utils ----------
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function getOrCreateUID() {
    try {
      const k = 'letters_asr_uid';
      let v = localStorage.getItem(k);
      if (!v) {
        v = (self.crypto?.randomUUID ? crypto.randomUUID() : ('uid_' + Math.random().toString(36).slice(2)));
        localStorage.setItem(k, v);
      }
      return v;
    } catch {
      return 'uid_' + Math.random().toString(36).slice(2);
    }
  }

  async function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function toDataURLFromString(str, mime = 'audio/webm') {
    // If already a data URL, return as-is
    if (/^data:.*;base64,/.test(str)) return str;
    // Otherwise assume raw base64 without header
    const clean = String(str).trim().replace(/\s+/g, '');
    return `data:${mime};base64,${clean}`;
  }

  // ---------- light SSE parser for fetch streaming ----------
  class SSEReader {
    constructor(response) {
      this.response = response;
      this.reader = null;
      this.buffer = '';
      this.aborted = false;
      this.onEvent = () => { };
      this.onError = () => { };
    }
    async start(signal) {
      try {
        if (!this.response.ok) {
          const text = await this.response.text().catch(() => '');
          this.onError({ code: 'http_error', status: this.response.status, message: text || 'HTTP error' });
          return;
        }
        if (!this.response.body || !this.response.body.getReader) {
          // Browser doesn’t support streaming; caller should fallback
          const text = await this.response.text().catch(() => '');
          this.onError({ code: 'stream_unsupported', message: 'This browser does not support fetch streaming.', payload: text });
          return;
        }
        this.reader = this.response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (signal?.aborted) break;
          const chunk = decoder.decode(value, { stream: true });
          this._feed(chunk);
        }
      } catch (err) {
        if (!this.aborted) this.onError({ code: 'network', message: String(err) });
      }
    }
    _feed(chunk) {
      this.buffer += chunk.replace(/\r\n/g, '\n');
      let idx;
      while ((idx = this.buffer.indexOf('\n\n')) >= 0) {
        const raw = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        this._parse(raw);
      }
    }
    _parse(raw) {
      const lines = raw.split('\n');
      let event = 'message';
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      const dataStr = dataLines.join('\n');
      let payload = dataStr;
      try { payload = JSON.parse(dataStr); } catch { }
      this.onEvent(event, payload);
    }
    async cancel() {
      this.aborted = true;
      try { await this.reader?.cancel(); } catch { }
    }
  }

  // ---------- minimal, beautiful status widget ----------
  class StatusWidget {
    constructor(attachTo) {
      this.host = document.createElement('div');
      this.host.style.position = 'absolute';
      this.host.style.top = '16px';
      this.host.style.right = '16px';
      this.host.style.zIndex = '2147483647';
      this.host.style.pointerEvents = 'none'; // do not block page
      this.shadow = this.host.attachShadow({ mode: 'open' });
      this._render();
      const parent = (typeof attachTo === 'string') ? document.querySelector(attachTo) : (attachTo || document.body);
      // Ensure parent is relatively positioned to keep absolute overlay anchored
      const cs = getComputedStyle(parent);
      if (cs.position === 'static') parent.style.position = 'relative';
      parent.appendChild(this.host);
      this.setStatus('Idle');
      this.setProgress(0);
      this.fadeIn();
    }
    _render() {
      this.shadow.innerHTML = `
        <style>
          :host, * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Inter, Roboto, "Helvetica Neue", Arial; }
          .card {
            pointer-events: auto;
            width: min(360px, 92vw);
            border-radius: 16px;
            padding: 12px 12px 10px;
            color: #0b1220;
            background: linear-gradient(135deg, rgba(255,255,255,.9), rgba(255,255,255,.75));
            border: 1px solid rgba(0,0,0,.08);
            box-shadow: 0 18px 40px rgba(0,0,0,.20);
            backdrop-filter: blur(10px) saturate(1.1);
            transform-origin: top right;
            transform: translateY(-8px) scale(0.98);
            opacity: 0;
            animation: enter .35s ease forwards;
          }
          @media (prefers-color-scheme: dark) {
            .card { color: #eef2ff; background: linear-gradient(135deg, rgba(22,22,28,.85), rgba(22,22,28,.7)); border-color: rgba(255,255,255,.12); }
          }
          @keyframes enter {
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes glow {
            0% { box-shadow: 0 0 0 0 rgba(91,140,255,.6); }
            70% { box-shadow: 0 0 0 10px rgba(91,140,255,0); }
            100% { box-shadow: 0 0 0 0 rgba(91,140,255,0); }
          }
          .row { display: grid; gap: 6px; }
          .top {
            display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;
          }
          .badge {
            font-size: 12px; font-weight: 700; letter-spacing: .3px; padding: 6px 10px; border-radius: 999px;
            background: linear-gradient(135deg, #5b8cff, #06b6d4); color: white; box-shadow: 0 6px 20px rgba(91,140,255,.4);
            animation: glow 2.2s ease infinite;
          }
          .muted { opacity: .75; font-size: 12px; }
          .progress { height: 8px; border-radius: 999px; background: rgba(0,0,0,.06); overflow: hidden; }
          @media (prefers-color-scheme: dark) { .progress { background: rgba(255,255,255,.1); } }
          .bar {
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #5b8cff, #22c55e, #06b6d4);
            background-size: 200% 100%;
            animation: shift 2.2s linear infinite;
            transition: width .35s ease;
            border-radius: inherit;
          }
          @keyframes shift { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
          .result {
            margin-top: 8px; padding: 10px; border-radius: 12px; background: rgba(0,0,0,.04);
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px;
          }
          @media (prefers-color-scheme: dark) { .result { background: rgba(255,255,255,.08); } }
          .close {
            appearance: none; border: 0; background: transparent; color: inherit; opacity: .7; cursor: pointer; font-size: 18px; line-height: 1;
          }
          .hide { opacity: 0; transform: translateY(-6px) scale(.98); transition: all .3s ease; }
        </style>
        <div class="card" id="card">
          <div class="top">
            <div class="badge" id="status">Idle</div>
            <button class="close" id="close" title="Close">×</button>
          </div>
          <div class="row">
            <div class="muted" id="queue">Queue: —</div>
            <div class="muted" id="quota">Quota: —</div>
            <div class="progress"><div class="bar" id="bar"></div></div>
            <div class="muted" id="phase">Phase: —</div>
            <div class="result" id="result">(waiting)</div>
          </div>
        </div>
      `;
      this.$ = (sel) => this.shadow.querySelector(sel);
      this.$card = this.$('#card');
      this.$status = this.$('#status');
      this.$queue = this.$('#queue');
      this.$quota = this.$('#quota');
      this.$phase = this.$('#phase');
      this.$bar = this.$('#bar');
      this.$result = this.$('#result');
      this.$('#close').addEventListener('click', () => this.hide());
    }
    setStatus(text) { this.$status.textContent = text; }
    setProgress(p) { this.$bar.style.width = clamp(p, 0, 100) + '%'; }
    setQueue(info) {
      const pos = info?.position != null ? `#${info.position}` : '—';
      const qs = info?.queue_size != null ? info.queue_size : '—';
      const eta = info?.eta_sec != null ? `, ETA ~${info.eta_sec}s` : '';
      this.$queue.textContent = `Queue: ${pos} of ${qs}${eta}`;
    }
    setQuota(info) {
      if (!info) return;
      const rem = info.remaining != null ? info.remaining : '—';
      const limit = info.request_limit != null ? info.request_limit : '—';
      this.$quota.textContent = `Quota: ${rem}/${limit} remaining`;
    }
    setPhase(name) { this.$phase.textContent = `Phase: ${name || '—'}`; }
    setResult(txt) { this.$result.textContent = txt || ''; }
    fadeIn() { this.$card.classList.remove('hide'); }
    hide() {
      this.$card.classList.add('hide');
      setTimeout(() => this.destroy(), 300);
    }
    destroy() {
      this.host.remove();
    }
  }

  // ---------- main client ----------
  class LettersASRClient {
    constructor({ baseUrl = (typeof location !== 'undefined' ? location.origin : ''), apiKey = null } = {}) {
      this.baseUrl = String(baseUrl).replace(/\/+$/, '');
      this.apiKey = apiKey;
      this._keyStorageKey = `letters_asr_key`;
    }

    setApiKey(k) {
      this.apiKey = k || null;
      try {
        if (this.apiKey) localStorage.setItem(this._keyStorageKey, this.apiKey);
      } catch { }
    }

    async ensureApiKey() {
      if (this.apiKey) return this.apiKey;
      try {
        const cached = localStorage.getItem(this._keyStorageKey);
        if (cached) {
          this.apiKey = cached;
          return this.apiKey;
        }
      } catch { }
      const uid = getOrCreateUID();
      const res = await fetch(`${this.baseUrl}/keys/free`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unique_id: uid })
      });
      if (!res.ok) throw new Error(`Failed to get free key: ${res.status}`);
      const data = await res.json();
      this.setApiKey(data.api_key);
      return this.apiKey;
    }

    async _toDataURL(input, fallbackMime, filename) {
      if (input instanceof Blob) {
        return blobToDataURL(input);
      }
      if (typeof input === 'string') {
        const mime = this._guessMimeFromName(filename) || fallbackMime || 'audio/webm';
        return toDataURLFromString(input, mime);
      }
      throw new Error('Unsupported input type. Provide a File/Blob or base64/data URL string.');
    }

    _guessMimeFromName(name) {
      if (!name) return null;
      const n = name.toLowerCase();
      if (n.endsWith('.wav')) return 'audio/wav';
      if (n.endsWith('.mp3')) return 'audio/mpeg';
      if (n.endsWith('.ogg')) return 'audio/ogg';
      if (n.endsWith('.webm')) return 'audio/webm';
      if (n.endsWith('.m4a') || n.endsWith('.mp4')) return 'audio/mp4';
      if (n.endsWith('.flac')) return 'audio/flac';
      return null;
    }

    async _lettersB64({ audioB64, filename = 'audio.webm', language = 'fr' }) {
      const res = await fetch(`${this.baseUrl}/letters/b64`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({ audio_b64: audioB64, filename, language })
      });
      if (!res.ok) {
        let detail;
        try { const j = await res.json(); detail = j.detail || j; } catch { detail = await res.text(); }
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }
      return res.json();
    }

    async _lettersStream({ audioB64, filename = 'audio.webm', language = 'fr' }, widget) {
      const controller = new AbortController();
      const res = await fetch(`${this.baseUrl}/letters/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({ audio_b64: audioB64, filename, language }),
        signal: controller.signal
      });

      return new Promise(async (resolve, reject) => {
        const sse = new SSEReader(res);
        const startedAt = Date.now();
        let lastResult = null; // NEW: keep the latest 'result' payload for final return

        const setP = (p) => widget?.setProgress(p);

        sse.onEvent = (event, data) => {
          if (event === 'queued') {
            widget?.setStatus('Queued');
            widget?.setQueue(data);
            setP(10);
          } else if (event === 'quota') {
            widget?.setQuota(data);
          } else if (event === 'started') {
            widget?.setStatus('Started');
            setP(20);
          } else if (event === 'phase') {
            const phase = data?.phase || '';
            widget?.setPhase(phase);
            if (phase === 'preprocess') setP(35);
            else if (phase === 'transcribe') setP(75);
            else if (phase === 'merge') setP(90);
          } else if (event === 'result') {
            // Keep the full ASR result so the promise resolves with it
            lastResult = data;
            widget?.setResult(data?.letters || JSON.stringify(data, null, 2));
            setP(98);
          } else if (event === 'done') {
            widget?.setStatus('Done');
            setP(100);
            const took = ((Date.now() - startedAt) / 1000).toFixed(1);
            widget?.setPhase(`Finished in ${took}s`);

            // Merge duration_sec from 'done' with the last 'result' if present
            const meta = (data && typeof data === 'object') ? data : {};
            if (lastResult && typeof lastResult === 'object') {
              resolve({ ...lastResult, ...meta });
            } else {
              // Fallback: no result seen, return whatever 'done' had
              resolve(meta);
            }
            setTimeout(() => widget?.hide(), 1600);
          } else if (event === 'error') {
            widget?.setStatus('Error');
            widget?.setPhase(data?.message || 'Request failed');
            widget?.setProgress(0);
            reject(new Error(data?.message || JSON.stringify(data)));
            setTimeout(() => widget?.hide(), 2200);
          }
        };

        sse.onError = (e) => {
          if (e?.code === 'stream_unsupported') {
            reject(Object.assign(new Error('Streaming unsupported'), { fallback: true }));
          } else {
            reject(new Error(e?.message || JSON.stringify(e)));
          }
        };

        await sse.start(controller.signal);
      });
    }

    // ------------- The one simple function -------------
    async transcribe(input, { language = 'fr', attachTo = null, stream = true, filename = 'audio.webm', mimeType = null } = {}) {
      await this.ensureApiKey();
      const widget = new StatusWidget(attachTo);
      widget.setStatus(stream ? 'Streaming' : 'Running');
      widget.setProgress(8);
      widget.setPhase('Preparing');

      const dataUrl = await this._toDataURL(input, mimeType || this._guessMimeFromName(filename) || 'audio/webm', filename);
      try {
        if (stream) {
          try {
            const result = await this._lettersStream({ audioB64: dataUrl, filename, language }, widget);
            // sse 'result' event already set the letters; but return final result too
            return result;
          } catch (e) {
            if (e && e.fallback) {
              // fallback to non-stream
              stream = false;
            } else {
              throw e;
            }
          }
        }
        // Non-streaming fallback or explicit
        widget.setStatus('Running');
        widget.setPhase('Transcribe');
        widget.setProgress(55);
        const res = await this._lettersB64({ audioB64: dataUrl, filename, language });
        widget.setResult(res?.letters || JSON.stringify(res, null, 2));
        widget.setStatus('Done');
        widget.setPhase('Finished');
        widget.setProgress(100);
        setTimeout(() => widget?.hide(), 1600);
        return res;
      } catch (err) {
        widget.setStatus('Error');
        widget.setPhase(err?.message || 'Failed');
        widget.setProgress(0);
        setTimeout(() => widget?.hide(), 2200);
        throw err;
      }
    }
  }

  return LettersASRClient;
}));