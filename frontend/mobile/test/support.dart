import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/location/position_source.dart';
import 'package:mzazicare/core/voice/voice_room.dart';

/// A recorded exchange: what the client asked for, and what it was told.
class Exchange {
  Exchange(this.method, this.path, this.authorization);

  final String method;
  final String path;
  final String? authorization;
}

/// Builds an ApiClient backed by a scripted transport.
///
/// The client is exercised through its real HTTP layer rather than through a
/// hand-written double, so the headers, the encoding and the retry all run as they
/// will in the app. [handler] answers each request in turn.
({ApiClient api, List<Exchange> calls}) buildApi(
  List<http.Response> Function(http.Request request, int callIndex) handler,
) {
  final List<Exchange> calls = <Exchange>[];
  int index = 0;

  final MockClient transport = MockClient((http.Request request) async {
    calls.add(Exchange(request.method, request.url.path, request.headers['Authorization']));
    final List<http.Response> answers = handler(request, index);
    index += 1;
    return answers.first;
  });

  return (api: ApiClient(baseUrl: 'http://api.test/api/v1', httpClient: transport), calls: calls);
}

http.Response json(Object body, [int status = 200]) => http.Response(
  jsonEncode(body),
  status,
  headers: const <String, String>{'content-type': 'application/json'},
);

Map<String, dynamic> sessionBody({String access = 'access-1', String refresh = 'refresh-1'}) =>
    <String, dynamic>{
      'user': <String, dynamic>{
        'id': 'elder-1',
        'name': 'Grace Wanjiru',
        'phone': '+254700000010',
        'email': null,
        'role': 'ELDER',
        'home': <String, dynamic>{
          'latitude': -1.286389,
          'longitude': 36.817223,
          'addressLabel': 'Kilimani, Nairobi',
        },
      },
      'accessToken': access,
      'refreshToken': refresh,
    };

Map<String, dynamic> emergencyBody({
  String state = 'NOTIFIED',
  Map<String, dynamic>? acknowledgedBy,
}) => <String, dynamic>{
  'id': 'event-1',
  'state': state,
  'severity': 'ELEVATED',
  'currentTier': 1,
  'triggeredAt': '2026-09-16T10:00:00.000Z',
  'acknowledgedBy': ?acknowledgedBy,
};

/// A summary row as the alerts endpoint projects it.
Map<String, dynamic> summaryBody({
  String id = 'event-1',
  String state = 'NOTIFIED',
  String severity = 'ELEVATED',
  int severityScore = 48,
  int currentTier = 1,
  String elderName = 'Grace Wanjiru',
  String? elderPhone = '+254700000010',
  String triggeredAt = '2026-09-16T10:00:00.000Z',
  Map<String, dynamic>? acknowledgedBy,
  String? outcome,
}) => <String, dynamic>{
  'eventId': id,
  'state': state,
  'severity': severity,
  'severityScore': severityScore,
  'currentTier': currentTier,
  'outcome': outcome,
  'elder': <String, dynamic>{
    'id': 'elder-1',
    'name': elderName,
    'phone': elderPhone,
    'addressLabel': 'Kilimani',
  },
  'acknowledgedBy': acknowledgedBy,
  'latitude': -1.286389,
  'longitude': 36.817223,
  'addressLabel': 'Kilimani, Nairobi',
  'triggeredAt': triggeredAt,
  'acknowledgedAt': null,
  'resolvedAt': null,
  'deadlineAt': null,
  'responderRequestedAt': null,
  'responseSeconds': null,
};

/// A detail body: a summary plus the three things only the detail screen reads.
Map<String, dynamic> detailBody({
  String state = 'NOTIFIED',
  Map<String, dynamic>? acknowledgedBy,
}) => <String, dynamic>{
  ...summaryBody(state: state, acknowledgedBy: acknowledgedBy),
  'severityFactors': <String, dynamic>{
    'score': 48,
    'band': 'ELEVATED',
    'factors': <Map<String, dynamic>>[
      <String, dynamic>{
        'key': 'careLevel',
        'label': 'Care level',
        'weight': 25,
        'value': 1,
        'contribution': 25,
        'detail': 'High care level',
      },
      <String, dynamic>{
        'key': 'awayFromHome',
        'label': 'Away from home',
        'weight': 15,
        'value': 0,
        'contribution': 0,
        'detail': 'At the registered home',
      },
    ],
  },
  'chain': <Map<String, dynamic>>[
    <String, dynamic>{
      'responderId': 'caregiver-1',
      'name': 'Peter Mwangi',
      'role': 'CAREGIVER',
      'priorityOrder': 1,
    },
    <String, dynamic>{
      'responderId': 'family-1',
      'name': 'Aisha Otieno',
      'role': 'FAMILY_MEMBER',
      'priorityOrder': 2,
    },
  ],
  // Action names and detail payloads as the server actually writes them. An earlier
  // version of this fixture invented 'TRIGGERED' and left every detail null, which meant
  // the screen was being tested against a shape the API never sends.
  'timeline': <Map<String, dynamic>>[
    <String, dynamic>{
      'id': 'audit-1',
      'action': 'EVENT_CREATED',
      'previousState': null,
      'newState': 'TRIGGERED',
      'actor': <String, dynamic>{'id': 'elder-1', 'name': 'Grace Wanjiru', 'role': 'ELDER'},
      'detail': null,
      'occurredAt': '2026-09-16T10:00:00.000Z',
      'secondsFromTrigger': 0,
    },
    <String, dynamic>{
      'id': 'audit-2',
      'action': 'SEVERITY_EVALUATED',
      'previousState': null,
      'newState': null,
      'actor': null,
      'detail': <String, dynamic>{'score': 48, 'band': 'ELEVATED'},
      'occurredAt': '2026-09-16T10:00:00.000Z',
      'secondsFromTrigger': 0,
    },
    <String, dynamic>{
      'id': 'audit-3',
      'action': 'TIER_DISPATCHED',
      'previousState': 'TRIGGERED',
      'newState': 'NOTIFIED',
      'actor': null,
      'detail': <String, dynamic>{
        'tier': 1,
        'reason': 'initial',
        'responderRole': 'CAREGIVER',
        'recipients': 1,
        'timeoutSeconds': 60,
      },
      'occurredAt': '2026-09-16T10:00:01.000Z',
      'secondsFromTrigger': 1,
    },
    <String, dynamic>{
      'id': 'audit-4',
      'action': 'ESCALATED',
      'previousState': 'NOTIFIED',
      'newState': 'ESCALATED',
      'actor': null,
      'detail': <String, dynamic>{'fromTier': 1, 'toTier': 2},
      'occurredAt': '2026-09-16T10:02:00.000Z',
      'secondsFromTrigger': 120,
    },
  ],
  'deliveries': <Map<String, dynamic>>[],
};

/// A phone whose location answers are scripted, and whose readings are pushed by hand.
class FakePositionSource implements PositionSource {
  FakePositionSource({this.answer = LocationAccess.granted, this.afterAsking});

  LocationAccess answer;

  /// What the person answers when the phone actually asks, if that differs.
  LocationAccess? afterAsking;
  final List<bool> asked = <bool>[];
  final StreamController<Fix> readings = StreamController<Fix>.broadcast();

  @override
  Future<LocationAccess> access({required bool ask}) async {
    asked.add(ask);
    if (ask && afterAsking != null) answer = afterAsking!;
    return answer;
  }

  @override
  Stream<Fix> watch() => readings.stream;

  @override
  Future<void> openSettings(LocationAccess access) async {}

  Future<void> close() => readings.close();
}

/// A voice room that connects at once and lets a test say who is in it.
class FakeVoiceRoom implements VoiceRoom {
  FakeVoiceRoom({this.fails = false});

  /// Refuse to connect, as an unreachable server or a refused microphone would.
  final bool fails;

  final StreamController<List<String>> _others = StreamController<List<String>>.broadcast();
  final StreamController<void> _dropped = StreamController<void>.broadcast();

  String? url;
  String? token;
  bool? microphone;
  bool? speaker;
  bool left = false;

  @override
  Stream<List<String>> get others => _others.stream;

  @override
  Stream<void> get dropped => _dropped.stream;

  @override
  Future<void> connect(String url, String token) async {
    if (fails) throw StateError('could not reach the room');
    this.url = url;
    this.token = token;
  }

  @override
  Future<void> setMicrophone(bool on) async {
    microphone = on;
  }

  @override
  Future<void> setSpeaker(bool on) async {
    speaker = on;
  }

  /// Somebody joins or leaves.
  void present(List<String> names) => _others.add(names);

  /// The connection is lost.
  void drop() => _dropped.add(null);

  @override
  Future<void> leave() async {
    left = true;
    // Not awaited, for the same reason as in the app: the close completes on the real
    // clock, which a widget test's fake clock never reaches.
    unawaited(_others.close());
    unawaited(_dropped.close());
  }
}

/// What the API answers to a request to join a voice room.
Map<String, dynamic> voiceAccessBody() => <String, dynamic>{
  'url': 'wss://test.livekit.cloud',
  'token': 'a.voice.token',
  'room': 'emergency-event-1',
  'expiresInSeconds': 3600,
};

/// A check-in as the API projects it. Due at nine on 22 October, Nairobi time.
Map<String, dynamic> checkInBody({
  String id = 'check-in-1',
  String status = 'PENDING',
  String dueAt = '2026-10-22T06:00:00.000Z',
  String deadlineAt = '2026-10-22T06:30:00.000Z',
  String? answeredAt,
  String? answeredVia,
  String? eventId,
}) => <String, dynamic>{
  'id': id,
  'dueAt': dueAt,
  'deadlineAt': deadlineAt,
  'status': status,
  'answeredAt': answeredAt ?? (status == 'ANSWERED' ? dueAt : null),
  'answeredVia': answeredVia,
  'eventId': eventId,
};

/// A check-in arrangement as the API projects it.
Map<String, dynamic> checkInScheduleBody({
  bool enabled = true,
  List<String> times = const <String>['09:00'],
  int graceMinutes = 30,
  bool waitingForElder = false,
  String? setByName = 'Mary Otieno',
}) => <String, dynamic>{
  'enabled': enabled,
  'times': times,
  'graceMinutes': graceMinutes,
  'waitingForElder': waitingForElder,
  'setBy': setByName == null ? null : <String, dynamic>{'id': 'carer-1', 'name': setByName},
};

/// Loads a real face for a test that measures what fits on a screen. The app names no
/// family, so the phone's own face is used: SF Pro on an iPhone, Roboto under test. The
/// test font draws every letter as a full square, nearly twice as wide as real text.
Future<void> loadRealFaces() async {
  const String dir = 'bin/cache/artifacts/material_fonts';
  final String root = Platform.environment['FLUTTER_ROOT'] ?? _flutterRoot();
  Future<ByteData> file(String name) async =>
      ByteData.sublistView(await File('$root/$dir/$name').readAsBytes());

  final FontLoader roboto = FontLoader('Roboto');
  for (final String weight in <String>['Regular', 'Medium', 'Bold']) {
    roboto.addFont(file('Roboto-$weight.ttf'));
  }
  final FontLoader icons = FontLoader('MaterialIcons')..addFont(file('MaterialIcons-Regular.otf'));
  await Future.wait(<Future<void>>[roboto.load(), icons.load()]);
}

/// Where Flutter is, from the running Dart executable when FLUTTER_ROOT is not set.
String _flutterRoot() {
  final String dart = Platform.resolvedExecutable;
  final int at = dart.indexOf('/bin/cache/');
  return at == -1 ? '' : dart.substring(0, at);
}
