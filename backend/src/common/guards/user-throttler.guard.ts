import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// The stock ThrottlerGuard keys on req.ip. Behind DigitalOcean App Platform's
// load balancer (no `trust proxy`), req.ip is the balancer's address, so
// every user shared one 300 req/min bucket — a busy office (e.g. the India
// team) would exhaust it and random dashboard/order-page requests came back
// 429, showing up as empty sections and an empty stone supplier list.
//
// Logged-in requests are now limited per user (req.user is set because
// JwtAuthGuard is registered before this guard in AppModule). Public routes
// (login, tracking links…) fall back to the real client IP that App
// Platform forwards in `do-connecting-ip`.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    if (req.user?.id) return `user:${req.user.id}`;
    const forwarded = req.headers?.['do-connecting-ip'];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.ip;
    return `ip:${ip}`;
  }
}
