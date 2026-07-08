import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly frontendUrl: string;
  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly config: ConfigService) {
    this.frontendUrl = (this.config.get('FRONTEND_URL', 'http://localhost:3000')).split(',')[0].trim();
    const gmailUser = this.config.get<string>('GMAIL_USER');
    const gmailPass = this.config.get<string>('GMAIL_APP_PASSWORD');
    this.transporter = gmailUser && gmailPass
      ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: gmailUser, pass: gmailPass } })
      : null;
  }

  async send(payload: EmailPayload): Promise<boolean> {
    const gmailUser = this.config.get<string>('GMAIL_USER');

    if (!this.transporter) {
      this.logger.warn(`Email skipped (GMAIL_USER or GMAIL_APP_PASSWORD not set): ${payload.subject}`);
      return false;
    }

    try {

      const override = this.config.get<string>('TEST_EMAIL_OVERRIDE');
      const to = override
        ? override
        : (Array.isArray(payload.to) ? payload.to.join(', ') : payload.to);

      await this.transporter.sendMail({
        from: `Kira Custom Jewelry <${gmailUser}>`,
        to,
        subject: payload.subject,
        html: payload.html,
      });

      this.logger.log(`Email sent: "${payload.subject}" → ${to}`);
      return true;
    } catch (err) {
      this.logger.error('Email send failed:', (err as Error)?.message);
      return false;
    }
  }

  // ── Templates ──────────────────────────────────────────────────────────

  orderUrl(orderId: string) {
    return `${this.frontendUrl}/orders/${orderId}`;
  }

  trackUrl(token: string) {
    return `${this.frontendUrl}/track/${token}`;
  }

  // Passwordless entry point: prefills the customer's email and OTP mode on
  // the login page, and deep-links back to the specific order after verify.
  loginUrl(email: string, orderId: string) {
    const redirect = encodeURIComponent(`/customer/orders/${orderId}`);
    return `${this.frontendUrl}/login?email=${encodeURIComponent(email)}&mode=otp&redirect=${redirect}`;
  }

  async sendNewOrderToAuthorizers(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    storeName: string;
    orderId: string;
  }) {
    if (!opts.to.length) return;
    return this.send({
      to: opts.to,
      subject: `[New Order] ${opts.poNumber} — Authorization Required`,
      html: emailLayout(`
        <h2 style="color:#F59E0B;margin:0 0 16px">New Order Received</h2>
        <p>A new order has been placed and is waiting for your authorization before CAD design begins.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#F59E0B')}">Review & Authorize →</a>
      `),
    });
  }

  async sendPendingCadToDesigners(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    if (!opts.to.length) return;
    return this.send({
      to: opts.to,
      subject: `[New CAD Job] ${opts.poNumber} is in your queue`,
      html: emailLayout(`
        <h2 style="color:#8B5CF6;margin:0 0 16px">New Order in CAD Queue</h2>
        <p>An order has been authorized and is ready for CAD design. Please log in to start working on it.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#8B5CF6')}">Open Order →</a>
      `),
    });
  }

  async sendCadSentForApprovalToAuthorizers(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    if (!opts.to.length) return;
    return this.send({
      to: opts.to,
      subject: `[CAD Sent] ${opts.poNumber} — Awaiting Customer Review`,
      html: emailLayout(`
        <h2 style="color:#6366F1;margin:0 0 16px">CAD Design Sent to Customer</h2>
        <p>The CAD design for the order below has been sent to the customer for review and approval.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#6366F1')}">View Order →</a>
      `),
    });
  }

  async sendCustomerApprovedCadToTeam(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    if (!opts.to.length) return;
    return this.send({
      to: opts.to,
      subject: `[Approved ✓] Customer approved CAD — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#10B981;margin:0 0 16px">Customer Approved the CAD Design ✓</h2>
        <p>Great news! The customer has approved the CAD design. The order is now ready to move forward to SKU Creation.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#10B981')}">Move to SKU Creation →</a>
      `),
    });
  }

  async sendOrderReadyToShipToTeam(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    if (!opts.to.length) return;
    return this.send({
      to: opts.to,
      subject: `[Ready to Ship] ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#3B82F6;margin:0 0 16px">Order Ready to Ship</h2>
        <p>The order below has been completed and is ready to be shipped to the customer.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#3B82F6')}">View Order →</a>
      `),
    });
  }

  async sendOrderShippedToTeam(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    trackingNumber?: string;
    orderId: string;
  }) {
    if (!opts.to.length) return;
    const trackRow = opts.trackingNumber
      ? `<tr><td style="padding:10px 16px;color:#6B7280;font-size:13px">Tracking #</td><td style="padding:10px 16px;font-weight:700;color:#1A2740">${opts.trackingNumber}</td></tr>`
      : '';
    return this.send({
      to: opts.to,
      subject: `[Shipped] ${opts.poNumber} is on its way`,
      html: emailLayout(`
        <h2 style="color:#6366F1;margin:0 0 16px">Order Shipped</h2>
        <p>The order below has been shipped to the customer.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, trackRow)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#6366F1')}">View Order →</a>
      `),
    });
  }

  async sendCadRevisionAlert(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    return this.send({
      to: opts.to,
      subject: `[Action Required] CAD Revision — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#DC6B19;margin:0 0 16px">CAD Revision Required</h2>
        <p>The customer has <strong>rejected</strong> the CAD design for the following order. Please review and upload a revised design.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#DC6B19')}">Open Order →</a>
      `),
    });
  }

  async sendOrderConfirmedToCustomer(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    return this.send({
      to: opts.to,
      subject: `Your order ${opts.poNumber} has been confirmed`,
      html: emailLayout(`
        <h2 style="color:#1A2740;margin:0 0 16px">Your Order is Confirmed ✓</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Great news — your order has been authorized and our CAD design team has started working on it. We'll notify you as soon as the design is ready for your review.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#1A2740')}">View Order →</a>
      `),
    });
  }

  async sendOrderPlaced(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
    trackingToken?: string;
  }) {
    const trackLink = this.loginUrl(opts.to, opts.orderId);
    return this.send({
      to: opts.to,
      subject: `We received your order — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#1A2740;margin:0 0 16px">We've Received Your Order!</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Thank you for placing your custom jewelry order with Kira Custom Jewelry. Our team has received it and will review it shortly. You'll receive another email once it's confirmed and our design team begins work.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${trackLink}" style="${btnStyle('#C09B58')}">Track Your Order →</a>
        <p style="margin-top:20px;font-size:12px;color:#9CA3AF">If you have any questions, please contact your sales representative.</p>
      `),
    });
  }

  async sendOrderReady(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    return this.send({
      to: opts.to,
      subject: `Your order ${opts.poNumber} is ready! 🎉`,
      html: emailLayout(`
        <h2 style="color:#C09B58;margin:0 0 16px">Your Jewelry is Ready! 🎉</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Exciting news — your custom piece has been crafted and is ready. It will be shipped to you very soon. We'll send you another email with the tracking number once it's on its way.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#C09B58')}">View Order →</a>
      `),
    });
  }

  async sendCadReadyForApproval(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
    trackingToken?: string;
  }) {
    const reviewLink = this.loginUrl(opts.to, opts.orderId);
    return this.send({
      to: opts.to,
      subject: `Your CAD design is ready to review — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#6366F1;margin:0 0 16px">Your Design is Ready for Review</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Our design team has completed the CAD for your order. Click the button below to review the design and either approve it or request changes.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${reviewLink}" style="${btnStyle('#6366F1')}">Review & Approve Design →</a>
        <p style="margin-top:16px;font-size:12px;color:#9CA3AF">We'll email you a one-time code — no password needed.</p>
      `),
    });
  }

  async sendOrderInProduction(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    quotedCost?: number;
    orderId: string;
  }) {
    const priceRow = opts.quotedCost
      ? `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px">Quoted Price</td><td style="padding:6px 0;font-weight:700;color:#1A2740">$${Number(opts.quotedCost).toLocaleString()}</td></tr>`
      : '';
    return this.send({
      to: opts.to,
      subject: `Your order ${opts.poNumber} is in production`,
      html: emailLayout(`
        <h2 style="color:#059669;margin:0 0 16px">Your Design is Approved — In Production! 🎉</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Your CAD design has been approved and your order has moved into production. We'll keep you updated on the progress.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, priceRow)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#059669')}">Track Order →</a>
      `),
    });
  }

  async sendOrderShipped(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    trackingNumber?: string;
    shipMethod?: string;
    orderId: string;
  }) {
    const trackingRow = opts.trackingNumber
      ? `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px">Tracking #</td><td style="padding:6px 0;font-weight:700;color:#1A2740">${opts.trackingNumber}</td></tr>`
      : '';
    const shipRow = opts.shipMethod
      ? `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px">Carrier</td><td style="padding:6px 0;color:#1A2740">${opts.shipMethod}</td></tr>`
      : '';
    return this.send({
      to: opts.to,
      subject: `Your order ${opts.poNumber} has shipped! 📦`,
      html: emailLayout(`
        <h2 style="color:#3B82F6;margin:0 0 16px">Your Order Has Shipped! 📦</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Your custom jewelry is on its way. Please use the tracking number below to follow your shipment.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, trackingRow + shipRow)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#3B82F6')}">View Order →</a>
      `),
    });
  }

  async sendPasswordResetEmail(opts: { to: string; token: string }) {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(opts.token)}`;
    return this.send({
      to: opts.to,
      subject: `Reset your Kira Custom Jewelry password`,
      html: emailLayout(`
        <h2 style="color:#1A2740;margin:0 0 16px">Password Reset Request</h2>
        <p>We received a request to reset the password for your account (<strong>${opts.to}</strong>).</p>
        <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        <a href="${resetUrl}" style="${btnStyle('#C09B58')}">Reset Password →</a>
        <p style="margin-top:24px;font-size:12px;color:#9CA3AF">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      `),
    });
  }

  async sendOtpCode(opts: { to: string; firstName: string; otp: string }) {
    return this.send({
      to: opts.to,
      subject: `Your Kira Custom Jewelry login code: ${opts.otp}`,
      html: emailLayout(`
        <h2 style="color:#1A2740;margin:0 0 16px">Your Login Code</h2>
        <p>Hi ${opts.firstName},</p>
        <p>Use this code to sign in to your account. It expires in <strong>10 minutes</strong>.</p>
        <div style="text-align:center;margin:24px 0">
          <span style="display:inline-block;background:#F9F8F6;border:1px solid #E8E4DC;border-radius:8px;padding:16px 32px;font-family:monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1A2740">${opts.otp}</span>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#9CA3AF">If you didn't request this, you can safely ignore this email — your account is still secure.</p>
      `),
    });
  }

  async sendStaffInvite(opts: {
    to: string;
    firstName: string;
    role: string;
    tempPassword: string;
  }) {
    return this.send({
      to: opts.to,
      subject: `You've been invited to Kira Custom Jewelry`,
      html: emailLayout(`
        <h2 style="color:#1A2740;margin:0 0 16px">Welcome to Kira Custom Jewelry! 👋</h2>
        <p>Hi ${opts.firstName},</p>
        <p>An admin has created an account for you on the <strong>Kira Custom Jewelry Order Management Platform</strong>. Use the credentials below to log in.</p>
        <table style="width:100%;border:1px solid #E8E4DC;border-radius:8px;border-collapse:collapse;margin:20px 0">
          <tr style="background:#F9F8F6"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #E8E4DC">Your Login Details</td></tr>
          <tr><td style="padding:10px 16px;color:#6B7280;font-size:13px;border-bottom:1px solid #F0EDE8;width:140px">Email</td><td style="padding:10px 16px;font-weight:700;color:#1A2740;border-bottom:1px solid #F0EDE8">${opts.to}</td></tr>
          <tr><td style="padding:10px 16px;color:#6B7280;font-size:13px;border-bottom:1px solid #F0EDE8">Temporary Password</td><td style="padding:10px 16px;font-family:monospace;font-size:15px;font-weight:700;color:#7C3AED;border-bottom:1px solid #F0EDE8;letter-spacing:1px">${opts.tempPassword}</td></tr>
          <tr><td style="padding:10px 16px;color:#6B7280;font-size:13px">Role</td><td style="padding:10px 16px;color:#1A2740">${opts.role.replace(/_/g, ' ')}</td></tr>
        </table>
        <p style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400E;margin:0 0 20px">
          ⚠️ This is a <strong>one-time temporary password</strong>. Please set your own password after logging in.
        </p>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a href="${this.frontendUrl}/login" style="${btnStyle('#1A2740')}">Log In Now →</a>
          <a href="${this.frontendUrl}/forgot-password" style="${btnStyle('#C09B58')}">Set My Password →</a>
        </div>
      `),
    });
  }

  async sendOrderDelivered(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
  }) {
    return this.send({
      to: opts.to,
      subject: `Your order ${opts.poNumber} has been delivered`,
      html: emailLayout(`
        <h2 style="color:#10B981;margin:0 0 16px">Order Delivered ✓</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Your custom piece has been delivered. We hope you love it! If you have any questions or concerns, please don't hesitate to reach out.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#10B981')}">View Order →</a>
      `),
    });
  }
}

// ── HTML helpers ────────────────────────────────────────────────────────────

function emailLayout(body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:'DM Sans',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F0;padding:40px 20px">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto">
        <!-- Header -->
        <tr><td style="background:#1A2740;border-radius:12px 12px 0 0;padding:24px 32px">
          <div style="font-size:20px;font-weight:700;color:#C09B58;letter-spacing:1px">KIRA CUSTOM JEWELRY</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.45);letter-spacing:2px;text-transform:uppercase;margin-top:3px">Order Management Platform</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#fff;padding:32px;border-left:1px solid #E8E4DC;border-right:1px solid #E8E4DC">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#F5F4F0;border:1px solid #E8E4DC;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center">
          <p style="font-size:11px;color:#9CA3AF;margin:0">This email was sent by Kira Custom Jewelry — Order Management Platform.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function orderCard(poNumber: string, customerName: string, orderType: string, extraRows = ''): string {
  return `
    <table style="width:100%;border:1px solid #E8E4DC;border-radius:8px;border-collapse:collapse;margin:20px 0;padding:16px">
      <tr style="background:#F9F8F6"><td colspan="2" style="padding:12px 16px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #E8E4DC">Order Details</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:13px;border-bottom:1px solid #F0EDE8">PO Number</td><td style="padding:10px 16px;font-weight:700;color:#1A2740;border-bottom:1px solid #F0EDE8">${poNumber}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:13px;border-bottom:1px solid #F0EDE8">Customer</td><td style="padding:10px 16px;color:#1A2740;border-bottom:1px solid #F0EDE8">${customerName}</td></tr>
      <tr><td style="padding:10px 16px;color:#6B7280;font-size:13px">Type</td><td style="padding:10px 16px;color:#1A2740">${orderType || '—'}</td></tr>
      ${extraRows}
    </table>`;
}

function btnStyle(color: string): string {
  return `display:inline-block;background:${color};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-top:8px`;
}
