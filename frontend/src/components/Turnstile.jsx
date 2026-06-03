import React, { useEffect, useRef } from 'react';

/* ──────────────────────────────────────────────────────────────────────────
   Cloudflare Turnstile — lightweight, dependency-free React wrapper.
   Loads the official Turnstile script once and renders the challenge widget
   explicitly so we can capture the validation token via callbacks.
   Docs: https://developers.cloudflare.com/turnstile/
   ────────────────────────────────────────────────────────────────────────── */

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Inject the Turnstile script exactly once; resolves when window.turnstile is ready.
function loadTurnstileScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('No window')); return; }
    if (window.turnstile) { resolve(window.turnstile); return; }

    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (window.turnstile) {
        clearInterval(poll);
        resolve(window.turnstile);
      } else if (Date.now() - startedAt > 15000) {
        clearInterval(poll);
        reject(new Error('Turnstile failed to load'));
      }
    }, 100);
    script.addEventListener('error', () => {
      clearInterval(poll);
      reject(new Error('Turnstile script error'));
    });
  });
}

export default function Turnstile({
  siteKey,
  theme = 'dark',
  onVerify,
  onExpire,
  onError,
  className = '',
}) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  // Keep the latest callbacks without forcing the render effect to re-run.
  const cbRef = useRef({ onVerify, onExpire, onError });
  cbRef.current = { onVerify, onExpire, onError };

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => cbRef.current.onVerify && cbRef.current.onVerify(token),
          'expired-callback': () => cbRef.current.onExpire && cbRef.current.onExpire(),
          'error-callback': () => cbRef.current.onError && cbRef.current.onError(),
        });
      })
      .catch(() => cbRef.current.onError && cbRef.current.onError());

    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current !== null && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch {
        /* widget already gone — safe to ignore */
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, theme]);

  if (!siteKey) return null;
  return <div ref={containerRef} className={className} data-theme={theme} />;
}
