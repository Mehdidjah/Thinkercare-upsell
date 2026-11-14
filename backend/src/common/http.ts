import type { Response } from 'express';

export const NO_STORE = { 'Cache-Control': 'no-store' };

export function sendJson(res: Response, data: unknown, status = 200, headers: Record<string, string> = {}): void {
  for (const [name, value] of Object.entries({ ...NO_STORE, ...headers })) res.setHeader(name, value);
  res.status(status).json(data);
}

export class DeskError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
