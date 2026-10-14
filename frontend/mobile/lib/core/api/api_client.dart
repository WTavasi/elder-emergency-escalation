import 'dart:convert';

import 'package:flutter/foundation.dart';
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

  /// The session in flight. Assigned by the app when it restores a saved one on launch,
  /// and by this client when tokens rotate.
  Session? session;

  /// Called when the tokens rotate or the session ends, so it can be persisted or
  /// cleared. Null means the session is over and the app should return to sign-in.
  void Function(Session? session)? onSessionChanged;

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
    session = signedIn;
    onSessionChanged?.call(signedIn);
    return signedIn;
  }

  /// Asks for a sign-up code to be sent to a phone. The answer is the same whether or
  /// not a code went out, so there is nothing to return.
  Future<void> requestCode(String phone) async {
    await _send(
      'POST',
      '/auth/verify-phone',
      body: <String, dynamic>{'phone': phone},
      authenticated: false,
    );
  }

  /// Asks for a password reset code. Like [requestCode], the answer is the same whether
  /// or not the number has an account, so there is nothing to return.
  Future<void> requestPasswordReset(String phone) async {
    await _send(
      'POST',
      '/auth/forgot-password',
      body: <String, dynamic>{'phone': phone},
      authenticated: false,
    );
  }

  /// Sets a new password with the code, and signs in, exactly as [signIn] does.
  Future<Session> resetPassword({
    required String phone,
    required String code,
    required String newPassword,
  }) async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/auth/reset-password',
      body: <String, dynamic>{'phone': phone, 'code': code, 'newPassword': newPassword},
      authenticated: false,
    );

    final Session signedIn = Session.fromJson(body);
    session = signedIn;
    onSessionChanged?.call(signedIn);
    return signedIn;
  }

  /// Creates an account and signs it in, exactly as [signIn] does.
  Future<Session> register({
    required String name,
    required String phone,
    required String code,
    required String password,
    required Role role,
    String? email,
  }) async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/auth/register',
      body: <String, dynamic>{
        'name': name,
        'phone': phone,
        'code': code,
        'password': password,
        'role': role == Role.familyMember ? 'FAMILY_MEMBER' : 'CAREGIVER',
        if (email != null && email.isNotEmpty) 'email': email,
        'acceptedPrivacyNotice': true,
      },
      authenticated: false,
    );

    final Session signedIn = Session.fromJson(body);
    session = signedIn;
    onSessionChanged?.call(signedIn);
    return signedIn;
  }

  /// The elders the signed-in person looks after.
  Future<List<ElderSummary>> myElders() async {
    final Object? body = await _sendRaw('GET', '/elders');
    if (body is! List<dynamic>) return const <ElderSummary>[];
    return body
        .whereType<Map<String, dynamic>>()
        .map(ElderSummary.fromJson)
        .toList(growable: false);
  }

  /// A caregiver registers an elder, whose phone has been sent a code.
  Future<ElderSummary> createElder({
    required String name,
    required String phone,
    required String code,
    required String password,
    required AddressMatch home,
    required String relationship,
    CareLevel? careLevel,
  }) async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/elders',
      body: <String, dynamic>{
        'name': name,
        'phone': phone,
        'code': code,
        'password': password,
        'home': <String, dynamic>{
          'latitude': home.latitude,
          'longitude': home.longitude,
          'label': home.label,
        },
        'relationship': relationship,
        if (careLevel != null) 'careLevel': careLevel.wire,
        'consentConfirmed': true,
      },
    );
    return ElderSummary.fromJson(body);
  }

  Future<ChainView> chain(String elderId) async {
    return ChainView.fromJson(await _send('GET', '/elders/$elderId/chain'));
  }

  /// Adds a family member by phone; their place is held if they have not signed up.
  Future<ChainView> addToChain(String elderId, {required String phone, String? name}) async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/elders/$elderId/chain',
      body: <String, dynamic>{'phone': phone, if (name != null && name.isNotEmpty) 'name': name},
    );
    return ChainView.fromJson(body);
  }

  /// Searches for an address, through the API, never directly from the phone.
  Future<AddressSearchResult> searchAddress(String query) async {
    final String q = Uri.encodeQueryComponent(query.trim());
    return AddressSearchResult.fromJson(await _send('GET', '/elders/address-search?q=$q'));
  }

  /// Changes the signed-in person's name or email. Pass [clearEmail] to remove it.
  Future<Account> updateProfile({String? name, String? email, bool clearEmail = false}) async {
    final Map<String, dynamic> body = await _send(
      'PATCH',
      '/auth/me',
      body: <String, dynamic>{
        'name': ?name,
        if (clearEmail) 'email': null else 'email': ?email,
      },
    );
    final Account account = Account.fromJson(body);
    final Session? current = session;
    if (current != null) {
      session = current.withAccount(account);
      onSessionChanged?.call(session);
    }
    return account;
  }

  /// Changes the password and takes the fresh tokens the server returns, which end every
  /// other session on the account.
  Future<void> changePassword({required String current, required String next}) async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/auth/change-password',
      body: <String, dynamic>{'currentPassword': current, 'newPassword': next},
    );
    final Session renewed = Session.fromJson(body);
    session = renewed;
    onSessionChanged?.call(renewed);
  }

  Future<ElderDetail> elder(String id) async =>
      ElderDetail.fromJson(await _send('GET', '/elders/$id'));

  /// A caregiver changing an elder's home or care level. [clearCareLevel] sets "not sure".
  Future<ElderDetail> updateElder(
    String id, {
    AddressMatch? home,
    CareLevel? careLevel,
    bool clearCareLevel = false,
  }) async {
    final Map<String, dynamic> body = await _send(
      'PATCH',
      '/elders/$id',
      body: <String, dynamic>{
        if (home != null)
          'home': <String, dynamic>{
            'latitude': home.latitude,
            'longitude': home.longitude,
            'label': home.label,
          },
        if (clearCareLevel) 'careLevel': null else if (careLevel != null) 'careLevel': careLevel.wire,
      },
    );
    return ElderDetail.fromJson(body);
  }

  /// Records that the elder is staying somewhere other than home.
  Future<void> setPlace(String elderId, AddressMatch place) async {
    await _send(
      'PUT',
      '/elders/$elderId/place',
      body: <String, dynamic>{
        'latitude': place.latitude,
        'longitude': place.longitude,
        'label': place.label,
      },
    );
  }

  /// Records that the elder is back home.
  Future<void> clearPlace(String elderId) async {
    await _send('DELETE', '/elders/$elderId/place');
  }

  /// Takes a person, or a held place, out of an elder's chain.
  Future<ChainView> removeFromChain(String elderId, String entryId) async {
    return ChainView.fromJson(await _send('DELETE', '/elders/$elderId/chain/$entryId'));
  }

  Future<void> signOut() async {
    try {
      await _send('POST', '/auth/logout', allowRetry: false);
    } on Exception {
      // The local session is cleared either way. A person tapping sign out on a phone
      // with no signal still expects to be signed out of the phone in front of them.
    } finally {
      session = null;
      onSessionChanged?.call(null);
    }
  }

  Future<Account> me() async {
    final Map<String, dynamic> body = await _send('GET', '/auth/me');
    return Account.fromJson(body);
  }

  /// Raises an emergency. The body is empty, and that is the point.
  ///
  /// This app never reads the device's location and never sends a coordinate. Where an
  /// emergency is happening is decided by the server from the elder's own record: their
  /// registered home, or a stay away from home that a caregiver recorded. So there is no
  /// location permission to ask for, no trail to protect, and nothing for this client to
  /// get wrong at the worst possible moment.
  Future<Emergency> raiseAlert() async {
    final Map<String, dynamic> body = await _send(
      'POST',
      '/alerts',
      body: const <String, dynamic>{},
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

  /// The emergencies this account can see, newest first from the API and re-ordered for
  /// urgency by the caller.
  ///
  /// [open] narrows to the ones still running, which is what a responder wants nearly
  /// always; the full history is the same call without it.
  Future<List<AlertSummary>> alerts({bool open = false, int limit = 50}) async {
    final String query = open ? '?open=true&limit=$limit' : '?limit=$limit';
    final Object? body = await _sendRaw('GET', '/alerts$query');
    if (body is! List<dynamic>) return const <AlertSummary>[];
    return body
        .whereType<Map<String, dynamic>>()
        .map(AlertSummary.fromJson)
        .toList(growable: false);
  }

  /// One emergency in full: the chain, the timeline and the severity reasoning.
  Future<AlertDetail> alertDetail(String id) async {
    final Map<String, dynamic> body = await _send('GET', '/alerts/$id');
    return AlertDetail.fromJson(body);
  }

  /// Take responsibility. The API settles the race, so two people pressing at once
  /// produces one owner and a 409 for the other rather than two owners.
  ///
  /// [at] is where the responder is, when the device will say. It is optional because
  /// refusing an acknowledgement over a missing coordinate would be the wrong trade.
  Future<void> acknowledge(String id, {GeoPoint? at}) async {
    await _send(
      'POST',
      '/alerts/$id/acknowledge',
      body: at == null
          ? const <String, dynamic>{}
          : <String, dynamic>{'latitude': at.latitude, 'longitude': at.longitude},
    );
  }

  /// Say you cannot come. The emergency stops waiting on you, and once nobody at this
  /// tier is still being waited on it climbs immediately.
  Future<void> decline(String id, {String? reason}) async {
    await _send(
      'POST',
      '/alerts/$id/decline',
      body: <String, dynamic>{if (reason != null && reason.isNotEmpty) 'reason': reason},
    );
  }

  /// Close it, recording how it ended.
  ///
  /// [note] is what the person closing it said happened. The server requires one for the
  /// OTHER outcome and accepts one alongside any of the others.
  Future<void> resolve(String id, Outcome outcome, {String? note}) async {
    await _send(
      'POST',
      '/alerts/$id/resolve',
      body: <String, dynamic>{
        'outcome': outcome.wire,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
      },
    );
  }

  /// Escalate past the care circle to an emergency responder, by hand.
  Future<void> requestResponder(String id) async {
    await _send('POST', '/alerts/$id/request-responder', body: const <String, dynamic>{});
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
    final Object? decoded = await _sendRaw(
      method,
      path,
      body: body,
      authenticated: authenticated,
      allowRetry: allowRetry,
    );
    return decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
  }

  /// What to say when the server could not be reached.
  ///
  /// In a debug build the message names the address that was tried. Nearly every
  /// "could not reach" during development is the app pointed at the wrong address for
  /// the device it is on, and naming it turns a twelve second mystery into a one line
  /// fix. A release build keeps to the plain sentence.
  String _unreachable(Object error) {
    final String where = kDebugMode ? ' at ${Uri.parse(baseUrl).origin}' : '';
    return 'Could not reach MzaziCare$where. Check the connection. ($error)';
  }

  /// The decoded body, whatever JSON shape it is.
  ///
  /// Most endpoints answer with an object and [_send] is the convenient wrapper; the
  /// list endpoint answers with an array, which would be flattened to an empty map if
  /// it had to come back through there.
  Future<Object?> _sendRaw(
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
      throw NetworkException(_unreachable(error));
    }

    if (response.statusCode == 401 && authenticated && allowRetry && session != null) {
      if (await _refresh()) {
        try {
          response = await _dispatch(method, path, body, authenticated);
        } on Exception catch (error) {
          throw NetworkException(_unreachable(error));
        }
      }
    }

    final Object? decoded = response.body.isEmpty ? null : jsonDecode(response.body);

    if (response.statusCode >= 400) {
      throw ApiException(response.statusCode, _messageFrom(decoded, response.statusCode));
    }

    return decoded;
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
      if (authenticated && session != null) 'Authorization': 'Bearer ${session!.accessToken}',
    };

    final String? encoded = body == null ? null : jsonEncode(body);

    return switch (method) {
      'GET' => _http.get(url, headers: headers).timeout(timeout),
      'POST' => _http.post(url, headers: headers, body: encoded).timeout(timeout),
      'PATCH' => _http.patch(url, headers: headers, body: encoded).timeout(timeout),
      'PUT' => _http.put(url, headers: headers, body: encoded).timeout(timeout),
      'DELETE' => _http.delete(url, headers: headers).timeout(timeout),
      _ => throw ArgumentError.value(method, 'method', 'unsupported'),
    };
  }

  Future<bool> _refresh() async {
    final Session? current = session;
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

      session = renewed;
      onSessionChanged?.call(renewed);
      return true;
    } on Exception {
      // A refresh that could not be attempted is not proof the session is over, so the
      // tokens are kept. The original request still fails, and the screen says so.
      return false;
    }
  }

  void _endSession() {
    session = null;
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
