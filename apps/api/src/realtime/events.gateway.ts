import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role, type EmergencyEvent } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { toSnapshot, type RealtimePublisher } from './realtime.publisher';

/** Everyone watching one elder. Administrators watch all of them. */
export const elderRoom = (elderlyId: string): string => `elder:${elderlyId}`;
export const ADMIN_ROOM = 'administrators';

/**
 * Live updates for responder screens and the dashboard.
 *
 * Rooms are worked out once, when a socket connects, from the same care assignments
 * that decide who gets notified. That means a publish is a single emit to one room
 * rather than a database query per change, and it means a caregiver cannot subscribe
 * to an elder they have no relationship with, because they were never put in that room.
 */
// The browser origin is not the access control here: every socket must present a
// valid access token during the handshake and is disconnected otherwise, so an
// unlisted origin gains nothing by connecting. Gateway options are evaluated when this
// module is imported, before configuration is loaded, so a configured origin could not
// be read here anyway.
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: true, credentials: true },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, RealtimePublisher {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = EventsGateway.tokenFrom(client);
      if (!token) throw new Error('no token supplied');

      const payload = await this.tokens.verifyAccess(token);
      const rooms = await this.roomsFor(payload.sub, payload.role);

      await client.join(rooms);
      client.data.userId = payload.sub;

      this.logger.log(`Socket ${client.id} joined ${rooms.length} room(s)`);
    } catch (error) {
      // Disconnect rather than leaving an unauthenticated socket attached. The reason
      // is logged here and not sent, so the socket cannot be used to probe for
      // which accounts or events exist.
      this.logger.warn(
        `Rejected socket ${client.id}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      client.emit('unauthorized', { message: 'Sign in again to receive live updates' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Socket ${client.id} disconnected`);
  }

  emergencyUpdated(event: EmergencyEvent): void {
    // The gateway may not be initialised yet during startup, and a missed message is
    // never worth throwing from inside the escalation path.
    if (!this.server) return;

    const snapshot = toSnapshot(event);
    this.server.to([elderRoom(event.elderlyId), ADMIN_ROOM]).emit('emergency.updated', snapshot);
  }

  /** Accepts the token from the handshake auth object, or from a query parameter. */
  static tokenFrom(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === 'string' && auth.token.length > 0) return auth.token;

    const query = client.handshake.query?.token;
    if (typeof query === 'string' && query.length > 0) return query;

    return null;
  }

  private async roomsFor(userId: string, role: Role): Promise<string[]> {
    if (role === Role.ADMINISTRATOR) return [ADMIN_ROOM];

    if (role === Role.ELDER) return [elderRoom(userId)];

    const assignments = await this.prisma.careAssignment.findMany({
      where: { responderId: userId },
      select: { elderlyId: true },
    });

    return assignments.map((assignment) => elderRoom(assignment.elderlyId));
  }
}
