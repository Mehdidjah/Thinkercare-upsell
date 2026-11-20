import { PRICING_RULE, canManageWorkspace } from '@touche/domain';
import {
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { clearedSessionCookie } from '../auth/session.js';
import { DeskExceptionFilter } from '../common/desk-exception.filter.js';
import { DeskError, sendJson } from '../common/http.js';
import { ENV, type Env } from '../config/env.js';
import { OrdersService, deskOrder, orderNotFound } from '../ecomanager/orders.service.js';
import { OrderSyncService } from '../ecomanager/sync.service.js';
import { AdminService } from './admin.service.js';
import { BonusService } from './bonus.service.js';
import { BootstrapService } from './bootstrap.service.js';
import { CallsService } from './calls.service.js';
import { ReportingService } from './reporting.service.js';

const ACCOUNT_CHANGED =
  'Ce poste est maintenant connecté avec un autre compte. Rechargez la page pour continuer avec ce compte.';

/** H1: the desk marks its automatic report refreshes; they are not activity and never slide the session. */
const background = (req: Request) => req.headers['x-desk-background'] === '1';

/** The desk prices offers with the server's current rules (shared PRICING_RULE); a tab opened before does not. */
const currentPricing = (req: Request) => req.headers['x-desk-pricing'] === PRICING_RULE;

/** The desk keeps each call to one brand; a tab opened before BEL.NCO does not, so its bootstrap holds Touché only. */
const brandsDesk = (req: Request) => req.headers['x-desk-brands'] === '1';

@Controller('api/desk')
@UseFilters(DeskExceptionFilter)
export class DeskController {
  constructor(
    private readonly auth: AuthService,
    private readonly bootstrap: BootstrapService,
    private readonly admin: AdminService,
    private readonly reporting: ReportingService,
    private readonly calls: CallsService,
    private readonly bonus: BonusService,
    private readonly orders: OrdersService,
    private readonly orderSync: OrderSyncService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async get(@Req() req: Request, @Res() res: Response): Promise<void> {
    const params = new URL(req.originalUrl, 'http://desk.local').searchParams;
    const action = params.get('action');
    if (action === 'health')
      return sendJson(res, { ok: true, app: 'ThinkerCare' });
    const session = await this.auth.resolveSession(req.headers.cookie, background(req));
    if (!session)
      return sendJson(
        res,
        { error: 'Connectez-vous pour accéder à cet espace.' },
        401,
      );
    // H1: the session slid forward; the browser gets the cookie with its new lifetime.
    if (session.cookie) res.setHeader('Set-Cookie', session.cookie);
    const { user } = session;
    // GET order: analytics, my-progress/contributions, audit, reminders (T7), default bootstrap.
    if (action === 'analytics')
      return sendJson(res, await this.reporting.analytics(user, params));
    if (action === 'my-progress' || action === 'contributions')
      return sendJson(res, await this.bonus.get(user, params, action));
    if (action === 'audit')
      return sendJson(res, await this.reporting.audit(user));
    if (action === 'reminders')
      return sendJson(res, await this.reporting.reminders(user));
    if (action === 'order-sync') {
      if (!this.orders.enabled) throw new DeskError(404, 'Vérification de commande non configurée.', 'order-check-off');
      if (!canManageWorkspace(user)) throw new DeskError(403, 'Accès direction requis.');
      return sendJson(res, await this.orderSync.status());
    }
    if (action === 'order') {
      // The store of the call's brand: `brand=belnco` for the BEL store; anything else (an older tab) is the TOU store.
      const found = await this.orders.check(user, params.get('ref') ?? '', params.get('brand') === 'belnco' ? 'belnco' : 'touche');
      if (found.status === 'not-found') throw orderNotFound(found.reference);
      if (found.status === 'unavailable')
        return sendJson(res, {
          order: null,
          check: 'unavailable',
          message: 'EcoManager ne répond pas : vous pouvez continuer, la commande sera marquée « à vérifier ».',
        });
      return sendJson(res, { order: deskOrder(found.order), check: 'verified' });
    }
    return sendJson(res, await this.bootstrap.get(user, params.get('compact') !== '1', brandsDesk(req)));
  }

  @Post()
  async post(@Req() req: Request, @Res() res: Response): Promise<void> {
    const origin = req.headers.origin;
    if (!origin || !this.env.appOrigins.includes(origin)) {
      throw new DeskError(403, 'Origine de requête non autorisée.');
    }
    if (!req.headers['content-type']?.includes('application/json')) {
      throw new DeskError(415, 'Format non pris en charge.');
    }
    const text = typeof req.body === 'string' ? req.body : '';
    if (text.length > 28000)
      throw new DeskError(413, 'Requête trop volumineuse.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new DeskError(400, 'Données invalides.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new DeskError(400, 'Données invalides.');
    }
    let body = parsed as { action?: unknown } & Record<string, unknown>;
    if (body.action === 'login') {
      const cookie = await this.auth.login(body, req.ip ?? 'unknown');
      // Deliver the workspace with the login response, avoiding another browser round trip.
      // Keep the original response for existing clients that do not request bootstrap.
      if (body.bootstrap === true) {
        const user = await this.auth.resolveUser(cookie);
        if (!user) throw new DeskError(401, 'Votre session a expiré. Reconnectez-vous.');
        return sendJson(res, { ok: true, bootstrap: await this.bootstrap.get(user, false, brandsDesk(req)) }, 200, { 'Set-Cookie': cookie });
      }
      return sendJson(res, { ok: true }, 200, { 'Set-Cookie': cookie });
    }
    const session = await this.auth.resolveSession(req.headers.cookie, background(req));
    if (session?.cookie) res.setHeader('Set-Cookie', session.cookie);
    const user = session?.user;
    // Signing out of a session that already ended still clears the browser cookie.
    if (!user && body.action === 'logout') {
      await this.auth.logout(req.headers.cookie);
      return sendJson(res, { ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
    }
    if (!user)
      throw new DeskError(401, 'Votre session a expiré. Reconnectez-vous.');
    // X1: a tab still showing another account must not write as the account now signed in.
    const { expectedUserId, ...rest } = body;
    // Only desks that read error codes (and reload the catalogue themselves) send expectedUserId. Reloading the catalogue
    // fixes their amounts only when they price with the current rules; a tab opened before is told to reload the page.
    const client = { reloadsCatalogue: expectedUserId !== undefined && currentPricing(req) };
    if (expectedUserId !== undefined) {
      if (typeof expectedUserId !== 'string' || expectedUserId.length > 64) {
        throw new DeskError(400, 'Données invalides.');
      }
      if (expectedUserId !== user.id) throw new DeskError(409, ACCOUNT_CHANGED, 'account-changed');
    }
    body = rest;
    if (body.action === 'logout') {
      await this.auth.logout(req.headers.cookie);
      return sendJson(res, { ok: true }, 200, {
        'Set-Cookie': clearedSessionCookie(),
      });
    }
    if (body.action === 'bonus-rule')
      return sendJson(res, await this.bonus.saveRule(user, body));
    // POST order after the session check: logout, bonus-rule, present-offer, complete-reminder,
    // reopen-reminder and void-call (each checks its own access), user-settings, save-call, password,
    // non-management -> 403, then product, clinical and account management.
    if (body.action === 'present-offer')
      return sendJson(res, await this.calls.presentOffer(user, body, client));
    if (body.action === 'complete-reminder')
      return sendJson(res, await this.calls.completeReminder(user, body));
    if (body.action === 'reopen-reminder')
      return sendJson(res, await this.calls.reopenReminder(user, body));
    if (body.action === 'void-call')
      return sendJson(res, await this.calls.voidCall(user, body));
    if (body.action === 'user-settings')
      return sendJson(res, await this.admin.updateUserSettings(user, body));
    if (body.action === 'save-call')
      return sendJson(res, await this.calls.saveCall(user, body, client));
    if (body.action === 'password') {
      await this.auth.changePassword(user, body, req.headers.cookie);
      return sendJson(res, { ok: true });
    }
    if (!canManageWorkspace(user))
      throw new DeskError(403, 'Cette action est réservée à la direction.');
    if (body.action === 'user-password')
      return sendJson(res, await this.auth.revealPassword(user, body, req.headers.cookie));
    if (body.action === 'product')
      return sendJson(res, await this.admin.upsertProduct(user, body));
    if (body.action === 'clinical')
      return sendJson(res, await this.admin.setClinical(user, body));
    if (body.action === 'user')
      return sendJson(res, await this.admin.createUser(user, body));
    if (body.action === 'remove-user')
      return sendJson(res, await this.admin.removeUser(user, body));
    if (body.action === 'reset-user')
      return sendJson(res, await this.admin.resetUser(user, body));
    throw new DeskError(400, 'Action inconnue.');
  }
}
