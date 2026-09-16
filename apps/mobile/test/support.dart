import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mzazicare/api/api_client.dart';
import 'package:mzazicare/api/models.dart';

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
    calls.add(
      Exchange(request.method, request.url.path, request.headers['Authorization']),
    );
    final List<http.Response> answers = handler(request, index);
    index += 1;
    return answers.first;
  });

  return (
    api: ApiClient(baseUrl: 'http://api.test/api/v1', httpClient: transport),
    calls: calls,
  );
}

http.Response json(Object body, [int status = 200]) =>
    http.Response(jsonEncode(body), status, headers: const <String, String>{
      'content-type': 'application/json',
    });

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
}) =>
    <String, dynamic>{
      'id': 'event-1',
      'state': state,
      'severity': 'ELEVATED',
      'currentTier': 1,
      'triggeredAt': '2026-09-16T10:00:00.000Z',
      if (acknowledgedBy != null) 'acknowledgedBy': acknowledgedBy,
    };

const GeoPoint testHome = GeoPoint(
  latitude: -1.286389,
  longitude: 36.817223,
  addressLabel: 'Kilimani, Nairobi',
);
