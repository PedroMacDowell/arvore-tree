// Cliente da API. O backend responde na mesma origem em /api (ver vite.config.js).
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  }

  // Sempre lê o corpo (mesmo vazio, como no 204): resposta não lida fica pendente e é abortada ao trocar de página.
  const text = await res.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // corpo que não é JSON: tratado como sem dados
  }
  if (!res.ok) {
    const error = new Error(data?.error || 'Algo deu errado. Tente novamente.');
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
};
