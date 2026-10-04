# realtime-service

Live updates to the administrator console.

**Mounted at:** the Socket.IO namespace `/realtime`.

## Scope

**Owns:** the socket connection, who may receive which emergency, and publishing an
`emergency.updated` message whenever one changes.

**Does not own:** the emergency itself. A message here is a reason to refresh, never the
source of truth, so a dropped connection leaves a stale screen rather than a wrong one.

## Files

| Path | What it is |
| --- | --- |
| `realtime.module.ts` | NestJS wiring |
| `controllers/events.gateway.ts` | Checks the token at the handshake and joins the rooms the account may see |
| `services/realtime.publisher.ts` | The one place an update is broadcast from |

The gateway sits in `controllers/` because it is this module's entry point, the socket
equivalent of a controller.

## Depends on

`auth-service`, to verify the token on each connection.
