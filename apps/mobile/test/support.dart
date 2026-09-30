import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mzazicare/api/api_client.dart';

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
  'elder': <String, dynamic>{'id': 'elder-1', 'name': elderName, 'addressLabel': 'Kilimani'},
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
