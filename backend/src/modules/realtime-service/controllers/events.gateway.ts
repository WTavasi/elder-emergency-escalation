import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role, type EmergencyEvent } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../db/prisma.service';
import { AccessRevocationService } from '../../auth-service/services/access-revocation.service';
import { TokenService } from '../../auth-service/services/token.service';
import { toSnapshot, type RealtimePublisher } from '../services/realtime.publisher';

/** Everyone watching one elder. Administrators watch all of them. */
export const elderRoom = (elderlyId: string): string => `elder:${elderlyId}`;
export const ADMIN_ROOM = 'administrators';
/** One account's own connections, so they can all be closed at once. */
export const userRoom = (userId: string): string => `user:${userId}`;

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
    private readonly revocations: AccessRevocationService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = EventsGateway.tokenFrom(client);
      if (!token) throw new Error('no token supplied');

      const payload = await this.tokens.verifyAccess(token);
      if (await this.revocations.isRevoked(payload.sub)) throw new Error('account deactivated');
      const rooms = await this.roomsFor(payload.sub, payload.role);

      await client.join([...rooms, userRoom(payload.sub)]);
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

    // Emergency responders are matched by area, not by chain, so they are in no elder's
    // room. Anybody asked about this emergency from outside the chain hears about it too.
    // Looked up after the fact and never awaited: a slow query must not hold up the
    // escalation path, and a missed live update only means the next poll catches it.
    void this.reachOutsideTheChain(event, snapshot);
  }

  private async reachOutsideTheChain(
    event: EmergencyEvent,
    snapshot: ReturnType<typeof toSnapshot>,
  ): Promise<void> {
    try {
      const asked = await this.prisma.notification.findMany({
        where: {
          eventId: event.id,
          recipient: { assignmentsAsCarer: { none: { elderlyId: event.elderlyId } } },
        },
        distinct: ['recipientId'],
        select: { recipientId: true },
      });
      if (asked.length === 0 || !this.server) return;
      this.server
        .to(asked.map((row) => userRoom(row.recipientId)))
        .emit('emergency.updated', snapshot);
    } catch (error) {
      this.logger.warn(
        `Live update to responders outside the chain failed for ${event.id}: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  /**
   * Closes the live connections of deactivated accounts, so a console or app already
   * open stops receiving emergencies at once rather than at its next reconnect. Told
   * why first, in the same words a refused connection gets.
   */
  disconnectUsers(userIds: string[]): void {
    if (!this.server || userIds.length === 0) return;
    const rooms = userIds.map(userRoom);
    this.server
      .to(rooms)
      .emit('unauthorized', { message: 'Sign in again to receive live updates' });
    this.server.in(rooms).disconnectSockets(true);
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
