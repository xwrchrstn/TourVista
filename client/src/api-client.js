const sessionChanged = 'Your session changed. Refresh the page and try again.';
const accountActions = new Set(['/auth/login', '/auth/register', '/auth/request-reset', '/auth/reset', '/auth/verify-email']);

export async function requestApi(path, options = {}, { session, onSession, fetchImpl = fetch } = {}) {
  async function send(requestPath, requestOptions, csrf) {
    const response = await fetchImpl('/api' + requestPath, {
      credentials: 'same-origin', ...requestOptions,
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...requestOptions.headers },
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body)
    });
    const result = await response.json();
    return { response, result };
  }
  let reply = await send(path, options, session?.csrf);
  if (reply.response.status === 403 && reply.result.error === sessionChanged) {
    // The server rejected this request before running its action. Refresh once,
    // preserving form values and keeping the server's CSRF checks enabled.
    const fresh = await send('/session', {}, undefined);
    if (!fresh.response.ok) throw new Error(fresh.result.error || 'Could not renew your session.');
    onSession?.(fresh.result);
    const previousUser = session?.user?.id ?? null;
    const currentUser = fresh.result.user?.id ?? null;
    if (previousUser !== currentUser && !accountActions.has(path)) {
      throw new Error('Your sign-in changed. Sign in again before saving this action.');
    }
    reply = await send(path, options, fresh.result.csrf);
  }
  if (!reply.response.ok) throw new Error(reply.result.error || 'Request failed.');
  return reply.result;
}
