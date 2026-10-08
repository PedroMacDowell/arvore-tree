import { useEffect, useState } from 'react';

/**
 * Lê o token dos links enviados por e-mail (…#token=XYZ) e o apaga da barra de endereço.
 * O token vai depois do "#": essa parte nunca é enviada ao servidor, então não fica em logs
 * de acesso nem vaza para outros sites pelo cabeçalho Referer.
 */
export function useLinkToken() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  return token;
}
