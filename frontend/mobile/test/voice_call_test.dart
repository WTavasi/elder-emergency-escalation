import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/voice/voice_call.dart';

import 'support.dart';

/// Long enough for a scripted request and its answer to go round.
Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) build({
    bool speakerFirst = true,
    bool fails = false,
    http.Response? answer,
  }) {
    final FakeVoiceRoom room = FakeVoiceRoom(fails: fails);
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[answer ?? json(voiceAccessBody())],
    );
    final VoiceCall call = VoiceCall(
      api: t.api,
      eventId: 'event-1',
      speakerFirst: speakerFirst,
      room: () => room,
    );
    return (call: call, room: room, calls: t.calls);
  }

  test('asks the API for a token and joins with the microphone on', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build();

    await t.call.join();

    expect(t.calls.single.method, 'POST');
    expect(t.calls.single.path, '/api/v1/alerts/event-1/voice');
    expect(t.room.url, 'wss://test.livekit.cloud');
    expect(t.room.token, 'a.voice.token');
    expect(t.room.microphone, isTrue);
    expect(t.room.speaker, isTrue);
    expect(t.call.status, CallStatus.waiting);
    expect(t.call.since, isNotNull);
    t.call.dispose();
  });

  test('a responder starts on the earpiece, like any call held to the ear', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build(
      speakerFirst: false,
    );

    await t.call.join();

    expect(t.room.speaker, isFalse);
    t.call.dispose();
  });

  test('is talking once somebody else is in the room, and waiting again if they go', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build();
    await t.call.join();

    t.room.present(<String>['Grace']);
    await _settle();
    expect(t.call.status, CallStatus.talking);
    expect(t.call.others, <String>['Grace']);

    t.room.present(<String>[]);
    await _settle();
    expect(t.call.status, CallStatus.waiting);
    t.call.dispose();
  });

  test('mutes and unmutes, and switches the speaker', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build();
    await t.call.join();

    await t.call.toggleMute();
    expect(t.call.muted, isTrue);
    expect(t.room.microphone, isFalse);

    await t.call.toggleMute();
    expect(t.room.microphone, isTrue);

    await t.call.toggleSpeaker();
    expect(t.call.speaker, isFalse);
    expect(t.room.speaker, isFalse);
    t.call.dispose();
  });

  test('hanging up leaves the room and lets go of the microphone', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build();
    await t.call.join();

    await t.call.leave();

    expect(t.call.status, CallStatus.ended);
    expect(t.room.left, isTrue);
    t.call.dispose();
  });

  test('says what the server said when it refuses', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build(
      answer: json(<String, dynamic>{'message': 'This emergency is already closed'}, 409),
    );

    await t.call.join();

    expect(t.call.status, CallStatus.failed);
    expect(t.call.error, 'This emergency is already closed');
    t.call.dispose();
  });

  test('says plainly when the room cannot be reached, and offers ringing instead', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build(fails: true);

    await t.call.join();

    expect(t.call.status, CallStatus.failed);
    expect(t.call.error, contains('ring instead'));
    expect(t.room.left, isTrue);
    t.call.dispose();
  });

  test('a dropped connection is a failure that can be joined again', () async {
    final ({VoiceCall call, FakeVoiceRoom room, List<Exchange> calls}) t = build();
    await t.call.join();

    t.room.drop();
    await _settle();

    expect(t.call.status, CallStatus.failed);
    expect(t.call.error, contains('dropped'));
    expect(t.call.isActive, isFalse);
    t.call.dispose();
  });
}
