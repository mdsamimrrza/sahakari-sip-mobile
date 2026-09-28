import { useAuth } from "@/lib/auth/AuthContext";
import Constants from "expo-constants";

const API_BASE = Constants.expoConfig?.extra?.apiUrl || "https://master-admin-delta.vercel.app";

function getAuthHeader(): string | undefined {
  // This would be replaced with actual auth token from secure storage
  return undefined;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const authHeader = getAuthHeader();
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export function useApi() {
  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
    put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
    delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  };
}
