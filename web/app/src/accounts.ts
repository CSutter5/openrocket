export interface AccountUser { id: string; username: string; isAdmin: boolean; mustChangePassword: boolean }
export interface PublicRocket { id: string; name: string; slug: string; ownerId: string; username: string; routeUsername: string; visibility: 'public' | 'restricted'; publicDownload: number; sharingVersion: number }
export interface RocketMember { username: string; role: 'viewer' | 'editor'; canDownload: boolean }
export interface RocketSharing { rocket: PublicRocket; members: RocketMember[] }
export interface RocketAccess { canView: boolean; canEdit: boolean; canDownload: boolean; canManage: boolean }
export const rocketPath = (rocket: PublicRocket) => `/${rocket.routeUsername}/${rocket.slug}/`;
export async function accountRequest<T>(path: string, body?: object, method?: 'DELETE' | 'POST'): Promise<T> {
  const response = await fetch(path, method === 'DELETE' ? { method } : body instanceof FormData ? { method: 'POST', body } : body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.message ?? 'Request failed. Please try again.');
  return result as T;
}
