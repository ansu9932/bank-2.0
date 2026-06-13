import React, { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const SCRIPT_ID = 'cf-turnstile-script';

/**
 * Lazily inject the Cloudflare Turnstile script exactly once and resolve when
 * the global `window.turnstile` API is ready.
 */
function loadTurnstileScript() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);

    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const start = Date.now();
    const poll = setInterval(() => {
      if (window.turnstile) {
        clearInterval(poll);
        resolve(window.turnstile);
      } else if (Date.now() - start > 15000) {
        clearInterval(poll);
        reject(new Error('Turnstile script failed to load.'));
      }
    }, 100);
  });
}

/**
 * Cloudflare Turnstile widget.
 *
 * Renders nothing (and silently no-ops) when no site key is supplied, so local
 * development without VITE_TURNSTILE_SITE_KEY isn't blocked.
 *
 * @param {string}   siteKey   the PUBLIC Turnstile site key
 * @param {Function} onVerify  called with the token string on success
 * @param {Function} onExpire  called when the token expires / errors out
 * @param {string}   theme     'dark' | 'light' | 'auto'
 */
export default function Turnstile({ siteKey, onVerify, onExpire, theme = 'dark' }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  // Keep latest callbacks in refs so the render effect doesn't re-run on each
  // parent re-render (which would re-mount the widget).
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!siteKey) return undefined;
    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => onVerifyRef.current?.(token),
          'expired-callback': () => onExpireRef.current?.(),
          'error-callback': () => onExpireRef.current?.(),
        });
      })
      .catch(() => {
        // Network/script failure — fail to a state where no token is issued.
        onExpireRef.current?.();
      });

    return () => {
      cancelled = true;
      if (window.turnstile && widgetIdRef.current !== null) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
      }
    };
  }, [siteKey, theme]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}
