export function accountToken(hash) {
  const query = String(hash).split('?')[1] || '';
  const token = new URLSearchParams(query).get('token') || '';
  return /^[a-f0-9]{64}$/.test(token) ? token : '';
}
