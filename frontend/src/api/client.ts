import { cognitoConfig } from '../cognitoConfig';
import { getValidToken } from '../App';

export interface ApiErrorShape {
  error?: string;
}

async function request<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  const token = await getValidToken();
  const res = await fetch(`${cognitoConfig.OrgsApiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as ApiErrorShape).error || 'Request failed.');
  }

  return data as TResponse;
}

export const api = {
  get: <TResponse>(path: string) => request<TResponse>(path, { method: 'GET' }),
  post: <TResponse>(path: string, body?: unknown) =>
    request<TResponse>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  put: <TResponse>(path: string, body?: unknown) =>
    request<TResponse>(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }),
  del: <TResponse>(path: string) => request<TResponse>(path, { method: 'DELETE' }),
};
