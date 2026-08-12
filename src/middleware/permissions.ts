/**
 * Permissions middleware stub
 */
import type { Request, Response, NextFunction } from 'express';

export function checkPermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Stub implementation - add actual permission checking logic
    next();
  };
}
