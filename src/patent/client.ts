const BASE = "http://127.0.0.1:8790";

export async function callService<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method: body ? "POST" : "GET" };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`patent service ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
