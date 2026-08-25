import { Logger } from '@nestjs/common';
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket,
  OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Factory, SupplySource } from '../../database/entities/order.entity';
import { OrdersService } from '../orders/orders.service';
import { isMessageVisible } from './message-visibility';

interface SocketUser {
  id: string; email: string; role: string;
  companyId?: string | null; assignedFactory?: Factory | null; assignedSupplySource?: SupplySource | null;
}

interface AuthedSocket extends Socket {
  data: { user: SocketUser; userName: string };
}

const room = (orderId: string) => `order:${orderId}`;

// Same origin allowlist as the REST API's CORS config in main.ts — kept
// separate here since Socket.IO's CORS is configured on the gateway, not on
// the shared Nest HTTP adapter.
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(o => o.trim()).filter(Boolean);

@WebSocketGateway({
  cors: { origin: allowedOrigins.length ? allowedOrigins : true, credentials: true },
  path: '/socket.io',
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessagesGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // The REST API accepts the JWT via httpOnly cookie or Bearer header; the
  // socket client instead sends it as `auth.token` in the handshake (simpler
  // than parsing cookies off the upgrade request, and the token is already
  // duplicated into localStorage for this exact kind of use — see
  // auth.store.ts). Connections that don't verify are dropped immediately.
  async handleConnection(client: AuthedSocket) {
    try {
      const token = client.handshake.auth?.token;
      if (!token) throw new Error('No token provided');
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET', 'dev-secret'),
      });
      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error('Inactive or missing user');
      client.data.user = {
        id: user.id, email: user.email, role: user.role, companyId: user.companyId,
        assignedFactory: user.assignedFactory, assignedSupplySource: user.assignedSupplySource,
      };
      client.data.userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    } catch (err) {
      this.logger.warn(`Socket auth failed: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    // Rooms are cleaned up automatically by socket.io on disconnect — nothing
    // to do here beyond what typing state already self-expires client-side.
  }

  @SubscribeMessage('order:join')
  async joinOrder(@ConnectedSocket() client: AuthedSocket, @MessageBody() orderId: string) {
    if (!client.data?.user) return;
    const allowed = await this.ordersService.canUserAccessOrder(orderId, client.data.user);
    if (!allowed) return;
    client.join(room(orderId));
  }

  @SubscribeMessage('order:leave')
  leaveOrder(@ConnectedSocket() client: AuthedSocket, @MessageBody() orderId: string) {
    client.leave(room(orderId));
  }

  @SubscribeMessage('typing')
  onTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { orderId: string; isTyping: boolean }) {
    if (!client.data?.user) return;
    // Only reaches sockets already in the room, which joinOrder has already
    // access-checked — no need to re-check visibility per keystroke.
    client.to(room(data.orderId)).emit('typing', {
      userId: client.data.user.id,
      userName: client.data.userName,
      isTyping: data.isTyping,
    });
  }

  // Called from MessagesService, not by clients directly — pushes a freshly
  // posted message to everyone else already viewing this order's thread.
  // Emitted per-socket (not a room-wide broadcast) so the same
  // internal/mention visibility rule getMessages() applies over REST also
  // applies here — a Factory Manager's socket in the room must not receive
  // an internal note not addressed to them just because they're connected.
  async broadcastNewMessage(orderId: string, message: { isInternal: boolean; authorId: string; mentions?: string[] }) {
    const sockets = await this.server.in(room(orderId)).fetchSockets();
    for (const s of sockets) {
      const u = (s.data as AuthedSocket['data'])?.user;
      if (u && isMessageVisible(u.role, u.id, message)) {
        s.emit('message:new', message);
      }
    }
  }

  broadcastRead(orderId: string, userId: string, userName: string, role: string, lastReadAt: Date) {
    this.server.to(room(orderId)).emit('message:read', { userId, userName, role, lastReadAt });
  }
}
