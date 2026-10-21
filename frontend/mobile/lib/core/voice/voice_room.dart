import 'dart:async';

import 'package:livekit_client/livekit_client.dart';

/// One voice room, as the rest of the app needs it.
///
/// A seam rather than LiveKit called directly, for the same reason as the position
/// source: the call logic can then be tested without a network or a microphone, and only
/// this file knows which voice service is behind it.
abstract class VoiceRoom {
  /// Joins with a token from the API. Throws if the room cannot be reached.
  Future<void> connect(String url, String token);

  Future<void> setMicrophone(bool on);

  /// The loudspeaker rather than the earpiece, so a phone on a table can be heard.
  Future<void> setSpeaker(bool on);

  /// The names of everybody else in the room, each time somebody comes or goes.
  Stream<List<String>> get others;

  /// Fires when the room is lost without [leave] having been asked for.
  Stream<void> get dropped;

  /// Leaves and lets go of the microphone. Safe to call more than once.
  Future<void> leave();
}

/// The real room, through LiveKit.
class LiveKitVoiceRoom implements VoiceRoom {
  final Room _room = Room();
  final StreamController<List<String>> _others = StreamController<List<String>>.broadcast();
  final StreamController<void> _dropped = StreamController<void>.broadcast();
  EventsListener<RoomEvent>? _listener;
  bool _leaving = false;

  @override
  Stream<List<String>> get others => _others.stream;

  @override
  Stream<void> get dropped => _dropped.stream;

  @override
  Future<void> connect(String url, String token) async {
    _listener = _room.createListener()
      ..on<ParticipantConnectedEvent>((ParticipantConnectedEvent _) => _publish())
      ..on<ParticipantDisconnectedEvent>((ParticipantDisconnectedEvent _) => _publish())
      ..on<RoomDisconnectedEvent>((RoomDisconnectedEvent _) {
        if (!_leaving && !_dropped.isClosed) _dropped.add(null);
      });
    await _room.connect(url, token);
    _publish();
  }

  void _publish() {
    if (_others.isClosed) return;
    _others.add(
      _room.remoteParticipants.values
          .map((RemoteParticipant p) => p.name.isNotEmpty ? p.name : 'Someone')
          .toList(growable: false),
    );
  }

  @override
  Future<void> setMicrophone(bool on) async {
    await _room.localParticipant?.setMicrophoneEnabled(on);
  }

  @override
  Future<void> setSpeaker(bool on) => AudioManager.instance.setSpeakerOutputPreferred(on);

  @override
  Future<void> leave() async {
    if (_leaving) return;
    _leaving = true;
    await _listener?.dispose();
    await _room.disconnect();
    await _room.dispose();
    await _others.close();
    await _dropped.close();
  }
}
