import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import 'voice_room.dart';

/// Where a call has got to.
enum CallStatus {
  /// Not started.
  idle,

  /// Asking for a token and joining the room.
  connecting,

  /// In the room, and nobody else is yet.
  waiting,

  /// In the room with at least one other person.
  talking,

  /// Left, by this person.
  ended,

  /// Could not join, or the room was lost. [VoiceCall.error] says which.
  failed,
}

/// One person's call in one emergency's voice room.
///
/// Joining asks the API for a token, which applies the same rule as the emergency's
/// buttons, then joins the room with the microphone on. The speaker is on by default
/// for the elder, whose phone may be on a table or the floor, and a choice for everybody
/// else. Nothing said is recorded anywhere.
class VoiceCall extends ChangeNotifier {
  VoiceCall({
    required ApiClient api,
    required this.eventId,
    this.speakerFirst = true,
    VoiceRoom Function()? room,
  }) : _api = api,
       _newRoom = room ?? LiveKitVoiceRoom.new;

  final ApiClient _api;
  final String eventId;
  final bool speakerFirst;
  final VoiceRoom Function() _newRoom;

  VoiceRoom? _room;
  final List<StreamSubscription<Object?>> _subscriptions = <StreamSubscription<Object?>>[];
  CallStatus _status = CallStatus.idle;
  List<String> _others = const <String>[];
  bool _muted = false;
  late bool _speaker = speakerFirst;
  String? _error;
  DateTime? _since;
  bool _disposed = false;

  CallStatus get status => _status;

  /// The first names of the other people in the call.
  List<String> get others => _others;
  bool get muted => _muted;
  bool get speaker => _speaker;
  String? get error => _error;

  /// When the room was joined, for a call timer.
  DateTime? get since => _since;

  bool get isActive =>
      _status == CallStatus.connecting ||
      _status == CallStatus.waiting ||
      _status == CallStatus.talking;

  Future<void> join() async {
    if (isActive) return;
    _set(CallStatus.connecting);

    final VoiceRoom room = _newRoom();
    _room = room;
    try {
      final VoiceAccess access = await _api.joinVoice(eventId);
      if (_disposed) return;
      _subscriptions
        ..add(
          room.others.listen((List<String> names) {
            _others = names;
            if (_status == CallStatus.waiting || _status == CallStatus.talking) {
              _set(names.isEmpty ? CallStatus.waiting : CallStatus.talking);
            }
          }),
        )
        ..add(
          room.dropped.listen((void _) {
            unawaited(_teardown());
            _set(CallStatus.failed, error: 'The call dropped. You can join it again.');
          }),
        );
      await room.connect(access.url, access.token);
      await room.setMicrophone(true);
      await room.setSpeaker(_speaker);
      if (_disposed) return;
      _muted = false;
      _since = DateTime.now();
      _set(_others.isEmpty ? CallStatus.waiting : CallStatus.talking);
    } on ApiException catch (failure) {
      await _teardown();
      _set(CallStatus.failed, error: failure.message);
    } on NetworkException catch (failure) {
      await _teardown();
      _set(CallStatus.failed, error: failure.message);
    } catch (_) {
      // The room itself refused or could not be reached, or the microphone was not
      // allowed. Said plainly, with the way out: ringing is always there.
      await _teardown();
      _set(
        CallStatus.failed,
        error: 'The call could not connect. Check the microphone is allowed, or ring instead.',
      );
    }
  }

  Future<void> toggleMute() async {
    final VoiceRoom? room = _room;
    if (room == null || !isActive) return;
    _muted = !_muted;
    _notify();
    await room.setMicrophone(!_muted);
  }

  Future<void> toggleSpeaker() async {
    final VoiceRoom? room = _room;
    if (room == null || !isActive) return;
    _speaker = !_speaker;
    _notify();
    await room.setSpeaker(_speaker);
  }

  /// Hangs up. The others stay in the room until they hang up too.
  Future<void> leave() async {
    if (_status == CallStatus.idle || _status == CallStatus.ended) return;
    await _teardown();
    _set(CallStatus.ended);
  }

  Future<void> _teardown() async {
    for (final StreamSubscription<Object?> subscription in _subscriptions) {
      await subscription.cancel();
    }
    _subscriptions.clear();
    final VoiceRoom? room = _room;
    _room = null;
    _others = const <String>[];
    _since = null;
    await room?.leave();
  }

  void _set(CallStatus status, {String? error}) {
    _status = status;
    if (status == CallStatus.failed || status == CallStatus.connecting) _error = error;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_teardown());
    super.dispose();
  }
}
