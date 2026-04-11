declare module "express" {
  import type { RequestListener } from "http";

  export interface Request {
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
    query: Record<string, string | string[] | undefined>;
    method: string;
  }

  export interface Response {
    headersSent: boolean;
    status(code: number): Response;
    json(body: unknown): Response;
    send(body: unknown): Response;
    on(event: string, listener: (...args: any[]) => void): Response;
  }

  export interface ExpressApp extends RequestListener {
    use(...args: any[]): unknown;
    all(path: string, handler: (req: Request, res: Response) => unknown): unknown;
    get(path: string, handler: (req: Request, res: Response) => unknown): unknown;
    post(path: string, handler: (req: Request, res: Response) => unknown): unknown;
    listen(
      port: number,
      host: string,
      callback?: () => void,
    ): { on(event: string, listener: (error: Error) => void): void };
  }

  export interface ExpressModule {
    (): ExpressApp;
    json(options?: unknown): unknown;
  }

  const express: ExpressModule;
  export default express;
}
