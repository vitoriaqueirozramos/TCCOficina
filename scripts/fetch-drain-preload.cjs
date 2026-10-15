const fetchResponse = globalThis.fetch;

globalThis.fetch = async (...arguments_) => {
  const response = await fetchResponse(...arguments_);
  const body = response.status === 204 || response.status === 304
    ? null
    : await response.arrayBuffer();

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
};
