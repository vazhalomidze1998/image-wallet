import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. */
      user?: { id: string };
      /** Exact request bytes, kept by express.json() for webhook signature checks. */
      rawBody?: Buffer;
    }
  }
}
