import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import * as Sentry from '@sentry/node';
import { User } from '../../database/entities/user.entity';
import { formatMoney } from '../../common/format-money.util';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
  // Skips the emailNotificationsEnabled opt-out filter below — for the rare
  // email someone should keep getting even after opting out of the general
  // notification noise (e.g. the weekly operations report).
  bypassOptOut?: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly frontendUrl: string;
  private readonly transporter: nodemailer.Transporter | null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    this.frontendUrl = (this.config.get('FRONTEND_URL', 'http://localhost:3000')).split(',')[0].trim();
    const gmailUser = this.config.get<string>('GMAIL_USER');
    const gmailPass = this.config.get<string>('GMAIL_APP_PASSWORD');
    this.transporter = gmailUser && gmailPass
      ? nodemailer.createTransport({
          host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: gmailUser, pass: gmailPass },
          // Reuse SMTP connections instead of a fresh TCP+TLS+AUTH handshake per send
          pool: true, maxConnections: 5, maxMessages: 100,
        })
      : null;
  }

  async send(payload: EmailPayload): Promise<boolean> {
    const gmailUser = this.config.get<string>('GMAIL_USER');

    if (!this.transporter) {
      this.logger.warn(`Email skipped (GMAIL_USER or GMAIL_APP_PASSWORD not set): ${payload.subject}`);
      return false;
    }

    try {
      const requested = Array.isArray(payload.to) ? payload.to : [payload.to];
      let recipients = requested;
      if (!payload.bypassOptOut) {
        const optedOut = await this.userRepo.find({
          where: { email: In(requested), emailNotificationsEnabled: false },
        });
        const optedOutEmails = new Set(optedOut.map(u => u.email));
        recipients = requested.filter(e => !optedOutEmails.has(e));
        if (!recipients.length) {
          this.logger.log(`Email skipped (all recipients opted out): "${payload.subject}"`);
          return false;
        }
      }

      const override = this.config.get<string>('TEST_EMAIL_OVERRIDE');
      const to = override ? override : recipients.join(', ');

      await this.transporter.sendMail({
        from: `Kira Custom Jewelry <${gmailUser}>`,
        to,
        subject: payload.subject,
        html: payload.html,
        attachments: payload.attachments,
      });

      this.logger.log(`Email sent: "${payload.subject}" → ${to}`);
      return true;
    } catch (err) {
      this.logger.error('Email send failed:', (err as Error)?.message);
      Sentry.captureException(err);
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

  surveyUrl(token: string) {
    return `${this.frontendUrl}/survey/${token}`;
  }

  feedbackUrl(token: string) {
    return `${this.frontendUrl}/feedback/${token}`;
  }

  // A bulk-recipient template with an empty `to` array resolves successfully
  // and sends nothing — no exception, nothing for a caller's .catch() to see.
  // This was the actual root cause behind factories never getting notified
  // of an assignment (portal showed it; the email silently no-op'd): every
  // bulk-send method below must call this instead of a bare early return.
  private warnNoRecipients(method: string, poNumber?: string) {
    const message = `Email skipped — no recipients for ${method} (PO ${poNumber ?? 'unknown'})`;
    this.logger.error(message);
    Sentry.captureMessage(message, 'error');
    this.sendInternalFailureAlert('No email recipients', message);
  }

  // Sentry isn't configured with a DSN in this deployment, so logger.error/
  // captureMessage calls above only land in raw application logs that nobody
  // actively watches — exactly as unnoticed as the original silent bug this
  // was written to fix. This sends a real email to a human instead, over the
  // same Gmail SMTP already proven to work, so a failure actually gets seen.
  // Deliberately does not get called from inside its own failure path —
  // a broken transporter must not alert-loop trying to report itself broken.
  sendInternalFailureAlert(subject: string, details: string) {
    const opsEmail = this.config.get<string>('OPS_ALERT_EMAIL', 'dashboard@kirajewels.one');
    this.send({
      to: opsEmail,
      subject: `[JewelFlow Alert] ${subject}`,
      html: emailLayout(`
        <h2 style="color:#DC2626;margin:0 0 16px">Notification Failure</h2>
        <p>${details}</p>
      `),
      bypassOptOut: true,
    });
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
    isPriorityCustomer?: boolean;
  }) {
    if (!opts.to.length) { this.warnNoRecipients('sendNewOrderToAuthorizers', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[New Order] ${opts.poNumber} — Authorization Required`,
      html: emailLayout(`
        <h2 style="color:#F59E0B;margin:0 0 16px">New Order Received</h2>
        <p>A new order has been placed and is waiting for your authorization before CAD design begins.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, '', opts.isPriorityCustomer)}
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
    isPriorityCustomer?: boolean;
  }) {
    if (!opts.to.length) { this.warnNoRecipients('sendPendingCadToDesigners', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[New CAD Job] ${opts.poNumber} is in your queue`,
      html: emailLayout(`
        <h2 style="color:#8B5CF6;margin:0 0 16px">New Order in CAD Queue</h2>
        <p>An order has been authorized and is ready for CAD design. Please log in to start working on it.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, '', opts.isPriorityCustomer)}
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
    isPriorityCustomer?: boolean;
  }) {
    if (!opts.to.length) { this.warnNoRecipients('sendCadSentForApprovalToAuthorizers', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[CAD Ready] ${opts.poNumber} — Needs Your Review`,
      html: emailLayout(`
        <h2 style="color:#6366F1;margin:0 0 16px">CAD Design Ready for Internal Review</h2>
        <p>The CAD design for the order below has been uploaded. Please review it and set the quote price before it's sent to the customer.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, '', opts.isPriorityCustomer)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#6366F1')}">Review & Set Price →</a>
      `),
    });
  }

  async sendCustomerApprovedCadToTeam(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
    isPriorityCustomer?: boolean;
  }) {
    if (!opts.to.length) { this.warnNoRecipients('sendCustomerApprovedCadToTeam', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[Approved ✓] Customer approved CAD — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#10B981;margin:0 0 16px">Customer Approved the CAD Design ✓</h2>
        <p>Great news! The customer has approved the CAD design. The order is now ready to move forward to SKU Creation.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, '', opts.isPriorityCustomer)}
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
    if (!opts.to.length) { this.warnNoRecipients('sendOrderReadyToShipToTeam', opts.poNumber); return; }
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
    if (!opts.to.length) { this.warnNoRecipients('sendOrderShippedToTeam', opts.poNumber); return; }
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
    isPriorityCustomer?: boolean;
  }) {
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[Action Required] CAD Revision — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#DC6B19;margin:0 0 16px">CAD Revision Required</h2>
        <p>The customer has <strong>rejected</strong> the CAD design for the following order. Please review and upload a revised design.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType, '', opts.isPriorityCustomer)}
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
      subject: `Your design is being generated — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#1A2740;margin:0 0 16px">Your design is being generated 🔜</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Great news — we received your order request and our CAD design team couldn't be more excited! We'll notify you as soon as the design is ready for your review.</p>
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

  async sendCadApprovalReminder(opts: {
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
      subject: `Reminder: your CAD design is still awaiting your review — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#6366F1;margin:0 0 16px">Just a Reminder — Your Design is Waiting</h2>
        <p>Hi ${opts.customerName},</p>
        <p>We wanted to check in — your CAD design is still awaiting your review. Click the button below whenever you're ready to approve it or request changes.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${reviewLink}" style="${btnStyle('#6366F1')}">Review & Approve Design →</a>
        <p style="margin-top:16px;font-size:12px;color:#9CA3AF">We'll email you a one-time code — no password needed.</p>
      `),
    });
  }

  // Automatic approval-stall check-in — day-5 survey, or the day-10 reminder
  // (same content, different subject/intro) if the day-5 survey went
  // unanswered. Links to the public, no-login /survey/:token page, not
  // sendCadReadyForApproval's login link — this is a short 3-option question,
  // not a return to the full CAD review flow.
  async sendApprovalStallSurvey(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    trackingToken: string;
    isReminder: boolean;
    // The pending design's thumbnail/file URL, already a public DO Spaces
    // link (see SpacesService.getPublicUrl) — safe to embed directly.
    // null when the pending file isn't an image (STL/PDF) or has none.
    imageUrl?: string | null;
  }) {
    const link = this.surveyUrl(opts.trackingToken);
    const intro = opts.isReminder
      ? `We wanted to follow up — we still haven't heard back on the CAD design for order <strong>${opts.poNumber}</strong>. No rush, we just want to make sure nothing's stuck on our end.`
      : `It's been a few days since we sent the CAD design for order <strong>${opts.poNumber}</strong> for your approval. Could you take a moment to let us know what's going on?`;
    const imageBlock = opts.imageUrl
      ? `<img src="${opts.imageUrl}" alt="Your design — ${opts.poNumber}" style="width:100%;max-width:496px;border-radius:8px;border:1px solid #E8E4DC;margin:20px 0;display:block" />`
      : '';
    return this.send({
      to: opts.to,
      subject: opts.isReminder
        ? `Following up — ${opts.poNumber} still awaiting your approval`
        : `Quick check-in on your design approval — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#6366F1;margin:0 0 16px">${opts.isReminder ? "Following Up — We Haven't Heard Back" : 'Quick Check-In on Your Design'}</h2>
        <p>Hi ${opts.customerName},</p>
        <p>${intro}</p>
        ${imageBlock}
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${link}" style="${btnStyle('#6366F1')}">Let Us Know →</a>
      `),
    });
  }

  // Sent to Admins when a customer answers the approval-stall survey above —
  // reasonLabel is the human-readable answer, computed by the caller
  // (PublicOrdersService) from the reason/subReason the customer picked.
  async sendApprovalStallResponseToAdmins(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
    reasonLabel: string;
  }) {
    if (!opts.to.length) { this.warnNoRecipients('sendApprovalStallResponseToAdmins', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `[Approval Check-In] ${opts.poNumber} — ${opts.reasonLabel}`,
      html: emailLayout(`
        <h2 style="color:#D97706;margin:0 0 16px">Customer Responded to Approval Check-In</h2>
        <p>${opts.customerName} answered the approval check-in survey for the order below:</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <p style="font-weight:700;color:#1A2740">${opts.reasonLabel}</p>
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#D97706')}">Open Order →</a>
      `),
    });
  }

  // For an external stakeholder with no in-app account — kept free of customer PII,
  // same spirit as the Factory/Stone Manager redaction elsewhere.
  async sendVpoIssuedNotice(opts: { to: string; poNumber: string; orderType: string }) {
    return this.send({
      to: opts.to,
      subject: `VPO Issued — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#0EA5E9;margin:0 0 16px">VPO Issued</h2>
        <p>Order <strong>${opts.poNumber}</strong> (${opts.orderType || '—'}) has been issued to the factory for manufacturing.</p>
      `),
    });
  }

  // VPO just issued — order is approved but not yet routed to any factory/stone
  // supplier. Only Admin/Authorizer can see it until they assign it.
  async sendAssignSupplierAlert(opts: { to: string[]; poNumber: string; orderType: string; orderId: string; isPriorityCustomer?: boolean }) {
    if (!opts.to.length) { this.warnNoRecipients('sendAssignSupplierAlert', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[Assign Supplier] ${opts.poNumber} — VPO Issued`,
      html: emailLayout(`
        ${priorityBanner(opts.isPriorityCustomer)}
        <h2 style="color:#0EA5E9;margin:0 0 16px">VPO Issued — Assign Supplier</h2>
        <p>Order <strong>${opts.poNumber}</strong> has been approved and issued. Select a stone supplier and factory to release it to production.</p>
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#0EA5E9')}">Assign Supplier →</a>
      `),
    });
  }

  // Sent only to the Factory Manager(s) tagged to the factory this order was just
  // routed to — not a blanket "all factory managers" notice.
  async sendFactoryAssignedAlert(opts: { to: string[]; poNumber: string; orderType: string; orderId: string; isPriorityCustomer?: boolean; attachments?: { filename: string; content: Buffer }[] }) {
    if (!opts.to.length) { this.warnNoRecipients('sendFactoryAssignedAlert', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[New Order] ${opts.poNumber} issued to your factory`,
      html: emailLayout(`
        ${priorityBanner(opts.isPriorityCustomer)}
        <h2 style="color:#D97706;margin:0 0 16px">Order Issued to Your Factory</h2>
        <p>Order <strong>${opts.poNumber}</strong> (${opts.orderType || '—'}) has been issued for manufacturing.</p>
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#D97706')}">Open Order →</a>
      `),
      attachments: opts.attachments,
    });
  }

  // Sent only to the Stone Manager(s) tagged to the supply source this order was
  // just routed to — not a blanket "all stone managers" notice.
  async sendStoneSupplierAssignedAlert(opts: { to: string[]; poNumber: string; orderType: string; orderId: string; isPriorityCustomer?: boolean }) {
    if (!opts.to.length) { this.warnNoRecipients('sendStoneSupplierAssignedAlert', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[Stones Needed] ${opts.poNumber}`,
      html: emailLayout(`
        ${priorityBanner(opts.isPriorityCustomer)}
        <h2 style="color:#9333EA;margin:0 0 16px">Stones Needed for New Order</h2>
        <p>Order <strong>${opts.poNumber}</strong> (${opts.orderType || '—'}) is ready — please arrange stones.</p>
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#9333EA')}">Open Order →</a>
      `),
    });
  }

  // Sent to Admin + Authorizer when an order is marked Manufactured — mirrors
  // the Admin+Authorizer alert already sent when the VPO is issued.
  async sendOrderManufacturedAlert(opts: { to: string[]; poNumber: string; orderType: string; orderId: string; isPriorityCustomer?: boolean }) {
    if (!opts.to.length) { this.warnNoRecipients('sendOrderManufacturedAlert', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[Manufactured] ${opts.poNumber}`,
      html: emailLayout(`
        ${priorityBanner(opts.isPriorityCustomer)}
        <h2 style="color:#8B5CF6;margin:0 0 16px">Order Manufactured</h2>
        <p>Order <strong>${opts.poNumber}</strong> (${opts.orderType || '—'}) has been manufactured and is en route to the US office.</p>
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#8B5CF6')}">Open Order →</a>
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
      ? `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px">Quoted Price</td><td style="padding:6px 0;font-weight:700;color:#1A2740">${formatMoney(Number(opts.quotedCost))}</td></tr>`
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

  // Account-security email — must reach the user even if they've opted out
  // of general notifications, or they'd be locked out with no way to recover.
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
      bypassOptOut: true,
    });
  }

  // Account-security email (login code) — same reasoning as password reset above.
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
      bypassOptOut: true,
    });
  }

  // Account-security email (delivers login credentials) — same reasoning as
  // password reset / OTP above: without it a new staff member has no way in.
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
      bypassOptOut: true,
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
      subject: `Your order ${opts.poNumber} is complete`,
      html: emailLayout(`
        <h2 style="color:#10B981;margin:0 0 16px">Order Completed ✓</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Your custom piece has been completed. We hope you love it! If you have any questions or concerns, please don't hesitate to reach out.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#10B981')}">View Order →</a>
      `),
    });
  }

  // Sent alongside sendOrderDelivered when an order completes — links to the
  // public, no-login /feedback/:token page (star ratings + a comments box),
  // not an AMP/interactive-email body: that would only render for Gmail
  // recipients with the sender pre-registered with Google, so a normal email
  // linking to a real page is what actually works everywhere.
  async sendFeedbackRequest(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    trackingToken: string;
  }) {
    const link = this.feedbackUrl(opts.trackingToken);
    return this.send({
      to: opts.to,
      subject: `How did we do? — ${opts.poNumber}`,
      html: emailLayout(`
        <h2 style="color:#C09B58;margin:0 0 16px">We'd Love Your Feedback</h2>
        <p>Hi ${opts.customerName},</p>
        <p>Now that your order has been completed, we'd love to hear how everything went. It only takes a minute and helps us keep improving.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <a href="${link}" style="${btnStyle('#C09B58')}">Share Your Feedback →</a>
      `),
    });
  }

  // Sent to Admins when a customer submits the feedback survey above.
  // ratingsSummary/comments are pre-formatted by the caller (PublicOrdersService).
  async sendFeedbackResponseToAdmins(opts: {
    to: string[];
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
    ratingsSummary: string;
    comments: string | null;
  }) {
    if (!opts.to.length) { this.warnNoRecipients('sendFeedbackResponseToAdmins', opts.poNumber); return; }
    return this.send({
      to: opts.to,
      subject: `[Feedback] ${opts.poNumber} — ${opts.ratingsSummary}`,
      html: emailLayout(`
        <h2 style="color:#C09B58;margin:0 0 16px">Customer Feedback Received</h2>
        <p>${opts.customerName} submitted feedback for the order below:</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <p style="font-weight:700;color:#1A2740">${opts.ratingsSummary}</p>
        ${opts.comments ? `<p style="color:#4B5563;font-style:italic">"${escapeHtml(opts.comments)}"</p>` : ''}
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#C09B58')}">Open Order →</a>
      `),
    });
  }

  // One recipient per call — sent from inside the mention-handling loop in
  // MessagesService.postMessage, once per mentioned Sales Rep on the message.
  async sendMentionAlert(opts: {
    to: string;
    poNumber: string;
    customerName: string;
    orderType: string;
    orderId: string;
    mentionedByName: string;
    messagePreview: string;
    isPriorityCustomer?: boolean;
  }) {
    return this.send({
      to: opts.to,
      subject: `${prioritySubjectPrefix(opts.isPriorityCustomer)}[Mentioned] ${opts.poNumber} — please check & respond`,
      html: emailLayout(`
        ${priorityBanner(opts.isPriorityCustomer)}
        <h2 style="color:#0369A1;margin:0 0 16px">You Were Tagged in an Order Chat</h2>
        <p><strong>${escapeHtml(opts.mentionedByName)}</strong> tagged you on the order below. The team has tagged you — please check and respond.</p>
        ${orderCard(opts.poNumber, opts.customerName, opts.orderType)}
        <p style="margin:16px 0;padding:12px 16px;background:#F9F8F6;border-left:3px solid #0369A1;color:#4B5563;font-size:13px;font-style:italic">${escapeHtml(opts.messagePreview)}</p>
        <a href="${this.orderUrl(opts.orderId)}" style="${btnStyle('#0369A1')}">Open Order →</a>
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

// Prefix a subject line so priority orders stand out in an inbox at a glance.
function prioritySubjectPrefix(isPriority?: boolean): string {
  return isPriority ? '⭐ PRIORITY — ' : '';
}

function priorityBanner(isPriority?: boolean): string {
  if (!isPriority) return '';
  return `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 14px;font-size:12px;font-weight:700;color:#92400E;margin:0 0 16px;letter-spacing:0.3px">⭐ PRIORITY ORDER — please handle ahead of the regular queue</div>`;
}

function orderCard(poNumber: string, customerName: string, orderType: string, extraRows = '', isPriority = false): string {
  return `
    ${priorityBanner(isPriority)}
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

// Chat message content is free-form user input, unlike the other fields
// interpolated into these templates — escape it before embedding in HTML
// so a message containing "<"/"&" etc. can't break the layout or inject
// markup into a recipient's mail client.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
