export interface AccountUser { id: string; username: string; isAdmin: boolean; mustChangePassword: boolean }
export interface PublicRocket { id: string; name: string; slug: string; ownerId: string; username: string }
export const rocketPath = (rocket: PublicRocket) => `/${rocket.username}/${rocket.slug}/`;
export async function accountRequest<T>(path: string, body?: object, method?: 'DELETE' | 'POST'): Promise<T> {
  const response = await fetch(path, method === 'DELETE' ? { method } : body instanceof FormData ? { method: 'POST', body } : body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.message ?? 'Request failed. Please try again.');
  return result as T;
}
