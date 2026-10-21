export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function error(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: { code, message, ...extra } }, status);
}

export const orderKey = (req: Request) => req.headers.get("x-order-key");

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export function serverError(where: string, err: unknown): Response {
  console.error(`[${where}]`, err);
  return error(500, "server_error", "Something went wrong on our side. Please try again or contact support.");
}
