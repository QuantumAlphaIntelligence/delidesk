import { webFrame } from 'electron'

/**
 * Roda no BrowserView do painel (não no shell).
 * Não expõe IPC. Só arma o grace do front para 401 cedo não ir a /login.
 */
try {
  void webFrame.executeJavaScript(
    `(() => {
      try {
        sessionStorage.setItem('delivai_auth_grace_until', String(Date.now() + 120000));
        sessionStorage.removeItem('delivai_session_expired_redirect');
        localStorage.setItem('delivai_delidesk_embed', '1');
        document.documentElement.classList.add('delidesk-embed');
      } catch (e) {}
      true;
    })()`,
    true
  )
} catch {
  /* ignore */
}
