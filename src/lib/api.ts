import { auth } from "./firebase";

async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function handleResponse(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  get: async (url: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, { headers });
    return handleResponse(res);
  },

  post: async (url: string, body?: unknown) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    return handleResponse(res);
  },

  put: async (url: string, body: unknown) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body) });
    return handleResponse(res);
  },

  patch: async (url: string, body: unknown) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(body) });
    return handleResponse(res);
  },

  delete: async (url: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, { method: "DELETE", headers });
    return handleResponse(res);
  },
};
