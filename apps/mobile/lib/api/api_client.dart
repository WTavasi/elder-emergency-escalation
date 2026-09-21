import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

/// A request the API refused, carrying what it said.
class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  /// Whether signing in again is the way out of this.
  bool get isAuthFailure => statusCode == 401;

  @override
  String toString() => message;
}

/// The network could not be reached at all, which is a different problem from a
/// refusal and deserves a different message on screen.
class NetworkException implements Exception {
  NetworkException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Everything this app asks the API for.
///
/// One access token is short-lived by design, so any request can come back 401 at a
/// moment the person did not cause. The client refreshes once and replays, and gives
/// up after that: a second failure means the session is genuinely over, and retrying
/// past it would be a loop against the server rather than a recovery.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 12),
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final Duration timeout;
  final http.Client _http;

  Session? _session;

  /// Called when the tokens rotate or the session ends, so it can be persisted or
  /// cleared. Null means the session is over and the app should return to sign-in.
  void Function(Session? session)? onSessionChanged;

  Session? get session => _session;

  set session(Session? value) => _session = value;

  Future<Session> signIn({required String phone, required String password}) async {
    // No refresh attempt on this one. There is nothing to refresh yet, and retrying a
    // rejected sign-in would spend an attempt against the rate limit for nothing.
    final Map<String, dynamic> body = await _send(
      'POST',
      '/auth/login',
      body: <String, dynamic>{'phone': phone, 'password': password},
      authenticated: false,
    );

    final Session signedIn = Session.fromJson(body);
    _session = signedIn;
    onSessionChanged?.call(signedIn);
    return signedIn;
  }

  Future<void> signOut() async {
    try {
      await _send('POST', '/auth/logout', allowRetry: false);
    } on Exception {
      // The local session is cleared either way. A person tapping sign out on a phone
      // with no signal still expects to be signed out of the phone in front of them.
    } finally {
      _session = null;
      onSessionChanged?.call(null);
    }
  }

  Future<Account> me() async {
    final Map<String, dynamic> body = await _send('GET', '/auth/me');
    return Account.fromJson(body);
  }

  /// Raises an emergency. The location is captured once, here, at the moment it is
  /// raised, and is never sent again afterwards.
  Future<Emergency> raiseAlert(GeoPoint at) async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/alerts',
      body: <String, dynamic>{
        'latitude': at.latitude,
        'longitude': at.longitude,
        if (at.addressLabel != null) 'addressLabel': at.addressLabel,
      },
    );
    return Emergency.fromJson(body);
  }

  Future<Emergency> cancelAlert(String id) async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/alerts/$id/cancel',
      body: const <String, dynamic>{},
    );
    return Emergency.fromJson(body);
  }

  Future<Emergency> alert(String id) async {
    final Map<String, dynamic> body = await _send('GET', '/alerts/$id');
    return Emergency.fromJson(body);
  }

  void dispose() => _http.close();

  // ------------------------------------------------------------------ internals --

  Future<Map<String, dynamic>> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    bool authenticated = true,
    bool allowRetry = true,
  }) async {
    http.Response response;
    try {
      response = await _dispatch(method, path, body, authenticated);
    } on Exception catch (error) {
      throw NetworkException('Could not reach MzaziCare. Check the connection. ($error)');
    }

    if (response.statusCode == 401 && authenticated && allowRetry && _session != null) {
      if (await _refresh()) {
        try {
          response = await _dispatch(method, path, body, authenticated);
        } on Exception catch (error) {
          throw NetworkException('Could not reach MzaziCare. Check the connection. ($error)');
        }
      }
    }

    final Object? decoded = response.body.isEmpty ? null : jsonDecode(response.body);

    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, _messageFrom(decoded, response.statusCode));
    }

    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  Future<http.Response> _dispatch(
    String method,
    String path,
    Map<String, dynamic>? body,
    bool authenticated,
  ) {
    final Uri url = Uri.parse('$baseUrl$path');
    final Map<String, String> headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (authenticated && _session != null) 'Authorization': 'Bearer ${_session!.accessToken}',
    };

    final String? encoded = body == null ? null : jsonEncode(body);

    return switch (method) {
      'GET' => _http.get(url, headers: headers).timeout(timeout),
      'POST' => _http.post(url, headers: headers, body: encoded).timeout(timeout),
      _ => throw ArgumentError.value(method, 'method', 'unsupported'),
    };
  }

  Future<bool> _refresh() async {
    final Session? current = _session;
    if (current == null) return false;

    try {
      final http.Response response = await _http
          .post(
            Uri.parse('$baseUrl/auth/refresh'),
            headers: const <String, String>{'Content-Type': 'application/json'},
            body: jsonEncode(<String, dynamic>{'refreshToken': current.refreshToken}),
          )
          .timeout(timeout);

      if (response.statusCode >= 400) {
        _endSession();
        return false;
      }

      final Map<String, dynamic> body = jsonDecode(response.body) as Map<String, dynamic>;
      final Session renewed = current.withTokens(
        body['accessToken'] as String,
        body['refreshToken'] as String,
      );

      _session = renewed;
      onSessionChanged?.call(renewed);
      return true;
    } on Exception {
      // A refresh that could not be attempted is not proof the session is over, so the
      // tokens are kept. The original request still fails, and the screen says so.
      return false;
    }
  }

  void _endSession() {
    _session = null;
    onSessionChanged?.call(null);
  }

  /// The API's own message where there is one. It is written for the person rather
  /// than for a log, and rewording it here would undo the care taken over it: the
  /// sign-in failure in particular is worded identically for a wrong password and an
  /// unknown number, so that the app cannot be used to discover who is registered.
  static String _messageFrom(Object? decoded, int statusCode) {
    if (decoded is Map<String, dynamic>) {
      final Object? message = decoded['message'];
      if (message is String && message.isNotEmpty) return message;
      if (message is List && message.isNotEmpty) return message.join(', ');
    }
    return 'Something went wrong (error $statusCode).';
  }
}
