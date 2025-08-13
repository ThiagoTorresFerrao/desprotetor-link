/* Desprotetor de Link - lógica principal
 * Atenção: em navegadores não é possível "seguir redirects" de todos os domínios por causa de CORS.
 * Este app foca em:
 * 1) Extrair o destino real de parâmetros comuns (url, u, q, redirect, r, target, to, dest, destination, continue, next, out, link, href)
 * 2) Decodificar múltiplas camadas de encode (URL e Base64)
 * 3) Remover parâmetros de rastreamento (utm_*, fbclid, gclid etc.)
 * 4) Projeto com fins academicos e pode conter erros.
 */

(function(){
  'use strict';

  const input = document.getElementById('inputUrl');
  const form = document.getElementById('form');
  const resultBox = document.getElementById('result');
  const btnCopy = document.getElementById('btnCopy');
  const btnOpen = document.getElementById('btnOpen');
  const logEl = document.getElementById('log');

  // Carrega links sociais da config
  function applySocialLinks(){
    try{
      const links = window.SOCIAL_LINKS || {};
      const set = (id, href) => { const a = document.getElementById(id); if(a && href){ a.href = href; } };
      set('yt', links.youtube);
      set('ig', links.instagram);
      set('gh', links.github);
      set('li', links.linkedin);
    }catch(e){ /* noop */ }
  }
  applySocialLinks();

  const REDIRECT_PARAM_KEYS = [
    'url', 'u', 'q', 'redirect', 'r', 'target', 'to', 'dest', 'destination',
    'continue', 'next', 'out', 'link', 'href', 'goto', 'forward', 'redirect_url'
  ];

  const TRACKING_PREFIXES = ['utm_', 'uta_'];
  const TRACKING_KEYS = new Set([
    'fbclid','gclid','dclid','yclid','mc_eid','mc_cid','mkt_tok','igsh','si','spm'
  ]);

  function safeDecodeURIComponent(str){
    try{ return decodeURIComponent(str); } catch{ return str; }
  }

  function looksLikeBase64(s){
    // Heurística simples: só A-Z a-z 0-9 + / = e tamanho múltiplo de 4
    return /^[A-Za-z0-9+/=]+$/.test(s) && (s.length % 4 === 0);
  }

  function tryBase64Decode(s){
    try{
      const decoded = atob(s);
      // Se virar uma URL com http(s) ou data, retornamos
      if(/^https?:\/\//i.test(decoded) || /^www\./i.test(decoded)){
        return decoded;
      }
      return null;
    }catch{
      return null;
    }
  }

  function stripTrackingParams(u){
    try{
      const url = new URL(u);
      const toDelete = [];
      // utm_* etc e chaves específicas
      url.searchParams.forEach((_, key) => {
        if (TRACKING_KEYS.has(key)) toDelete.push(key);
        for(const prefix of TRACKING_PREFIXES){
          if(key.startsWith(prefix)) toDelete.push(key);
        }
      });
      toDelete.forEach(k => url.searchParams.delete(k));
      return url.toString();
    }catch{
      return u;
    }
  }

  function extractFromParams(u, log){
    try{
      const url = new URL(u);
      let extracted = null;

      // Procura em quaisquer parâmetros
      for(const [key, value] of url.searchParams.entries()){
        const lowerKey = key.toLowerCase();
        if(REDIRECT_PARAM_KEYS.includes(lowerKey)){
          let val = value;
          // Decodifica múltiplas vezes se necessário
          for(let i=0; i<3; i++){
            val = safeDecodeURIComponent(val);
          }
          if(looksLikeBase64(val)){
            const b = tryBase64Decode(val);
            if(b){ val = b; log(`Decodifiquei Base64 do parâmetro "${key}".`); }
          }
          // Se virou URL válido, usamos
          if(/^https?:\/\//i.test(val) || /^www\./i.test(val)){
            extracted = val.replace(/^www\./i, 'https://www.');
            log(`Extraído de "${key}" → ${extracted}`);
            break;
          }
        }
      }

      return extracted || u;
    }catch{
      return u;
    }
  }

  function multiUnprotect(u, log){
    let prev = u.trim();
    let current = prev;
    log(`Entrada: ${current}`);

    // Corrige espaços, <>, etc
    current = current.replace(/^[<\s]+|[>\s]+$/g, '');

    // Adiciona esquema se ausente
    if(!/^[a-z]+:\/\//i.test(current)){
      current = 'https://' + current;
      log(`Sem esquema detectado → ${current}`);
    }

    // Até 5 iterações para desembrulhar
    for(let i=0;i<5;i++){
      let before = current;

      // 1) Extrai de parâmetros comuns
      current = extractFromParams(current, log);

      // 2) Decodifica URL múltiplas vezes
      for(let j=0;j<2;j++){
        const dec = safeDecodeURIComponent(current);
        if (dec !== current){
          current = dec;
          log('decodeURIComponent aplicado.');
        }
      }

      // 3) Tenta Base64 se a URL inteira parecer Base64
      const afterScheme = current.replace(/^[a-z]+:\/\//i, '');
      if(looksLikeBase64(afterScheme)){
        const b = tryBase64Decode(afterScheme);
        if(b){
          current = /^https?:\/\//i.test(b) ? b : ('https://' + b);
          log('Decodifiquei Base64 do todo.');
        }
      }

      // 4) Remove tracking
      const stripped = stripTrackingParams(current);
      if(stripped !== current){
        current = stripped;
        log('Parâmetros de rastreamento removidos.');
      }

      if(current === before) break;
    }

    // Sanity: tira múltiplas barras, espaços
    current = current.replace(/\s+/g, '');
    current = current.replace(/([^:]\/)\/+/g, '$1');

    return current;
  }

  function renderOutput(u, logText){
    resultBox.innerHTML = '';
    const a = document.createElement('a');
    a.href = u;
    a.textContent = u;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    a.className = 'clean-link';
    resultBox.appendChild(a);

    btnCopy.disabled = false;
    btnOpen.classList.remove('disabled');
    btnOpen.setAttribute('aria-disabled', 'false');
    btnOpen.href = u;

    logEl.textContent = logText.trim();
  }

  function showError(msg){
    resultBox.innerHTML = `<p class="muted">${msg}</p>`;
    btnCopy.disabled = true;
    btnOpen.href = '#';
    btnOpen.classList.add('disabled');
    btnOpen.setAttribute('aria-disabled', 'true');
  }

  function makeLogger(){
    let buf = '';
    return {
      push: (line) => { buf += line + '\n'; },
      text: () => buf
    };
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if(!raw){ showError('Cole um link acima.'); return; }

    const logger = makeLogger();
    const log = logger.push;
    const cleaned = multiUnprotect(raw, log);

    if(/^https?:\/\//i.test(cleaned)){
      renderOutput(cleaned, logger.text());
    }else{
      showError('Não foi possível extrair um link válido. Verifique a URL.');
      logEl.textContent = logger.text();
    }
  });

  btnCopy.addEventListener('click', async () => {
    const a = resultBox.querySelector('a');
    if(!a) return;
    try{
      await navigator.clipboard.writeText(a.href);
      const old = btnCopy.textContent;
      btnCopy.textContent = 'Copiado!';
      setTimeout(() => btnCopy.textContent = old, 1200);
    }catch{
      // fallback
      const ta = document.createElement('textarea');
      ta.value = a.href;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const old = btnCopy.textContent;
      btnCopy.textContent = 'Copiado!';
      setTimeout(() => btnCopy.textContent = old, 1200);
    }
  });

  // Cola e processa automaticamente
  document.addEventListener('paste', (e) => {
    if(document.activeElement === input) return;
    const txt = (e.clipboardData || window.clipboardData).getData('text');
    if(txt){
      input.value = txt;
      form.requestSubmit();
    }
  });
})();