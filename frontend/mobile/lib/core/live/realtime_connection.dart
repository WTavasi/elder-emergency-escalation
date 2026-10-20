import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../api/models.dart';
import 'live_updates.dart';

/// The server's realtime namespace for an API base address.
///
/// The REST API lives under /api/v1 and the socket does not: Socket.IO answers at the
/// origin, on the /realtime namespace. So `http://10.0.2.2:3000/api/v1` becomes
/// `http://10.0.2.2:3000/realtime`, and an ngrok address keeps its https.
String realtimeUrlFor(String apiBaseUrl) => '${Uri.parse(apiBaseUrl).origin}/realtime';

/// The socket, kept in step with whoever is signed in.
///
/// The server checks the access token once, at the handshake. A socket that is already
/// open stays open when that token expires; one that has to reconnect after a dropped
/// network presents the old token and is turned away with `unauthorized`. That is the
/// case [onRejected] exists for: the app makes one ordinary authenticated request,
/// which refreshes the tokens the usual way, and the new session arriving through
/// [follow] opens a fresh socket.
class RealtimeConnection {
  RealtimeConnection({required this.url, required this.live, this.onRejected});

  final String url;
  final LiveUpdates live;

  /// Asked to renew the session after the server refused the socket. Expected to end
  /// in a call to [follow], with new tokens or with none.
  final Future<void> Function()? onRejected;

  io.Socket? _socket;
  String? _token;

  /// The token the server last refused. Asking for a renewal again for the same token
  /// would be a loop against the server rather than a recovery.
  String? _refusedToken;

  /// Opens, swaps or closes the socket to match [session].
  void follow(Session? session) {
    final String? token = session?.accessToken;
    if (token == _token) return;
    _close();
    _token = token;
    if (token != null) _open(token);
  }

  void _open(String token) {
    final io.Socket socket = io.io(
      url,
      io.OptionBuilder()
          // WebSocket only. Long polling would work, but it holds a request open through
          // the development tunnel for every client, and every target this app runs on
          // has WebSockets.
          .setTransports(<String>['websocket'])
          .setAuth(<String, dynamic>{'token': token})
          // A new manager per socket. Socket.IO otherwise reuses one per address, and
          // with it the previous account's handshake.
          .enableForceNew()
          .disableAutoConnect()
          .build(),
    );

    // Every handler first checks that this is still the current socket. One that was
    // replaced after a token rotation can still report its own disconnect a moment
    // later, and must not mark the new one as down.
    bool current() => identical(_socket, socket);

    socket.onConnect((_) {
      if (!current()) return;
      live.connectionChanged(true);
      _refusedToken = null;
    });
    socket.onDisconnect((_) {
      if (current()) live.connectionChanged(false);
    });
    socket.onConnectError((_) {
      if (current()) live.connectionChanged(false);
    });

    socket.on('emergency.updated', (Object? data) {
      if (!current()) return;
      final LiveChange? change = LiveChange.tryParse(data);
      if (change != null) live.publish(change);
    });

    socket.on('unauthorized', (_) {
      if (!current()) return;
      live.connectionChanged(false);
      if (_refusedToken == token) return;
      _refusedToken = token;
      final Future<void> Function()? renew = onRejected;
      if (renew != null) {
        unawaited(
          renew().catchError((Object error) {
            debugPrint('Live updates paused: $error');
          }),
        );
      }
    });

    _socket = socket;
    socket.connect();
  }

  void _close() {
    final io.Socket? socket = _socket;
    _socket = null;
    socket?.dispose();
    live.connectionChanged(false);
  }

  void dispose() {
    _token = null;
    _close();
  }
}
