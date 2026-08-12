/**
 * Authentication middleware stub
 */
import type { Request, Response, NextFunction } from 'express';

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  // Stub implementation - add actual JWT authentication logic
  next();
}
