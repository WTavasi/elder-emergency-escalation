import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import 'session_store.dart';

/// Who is signed in, and how that changes.
class AuthController extends ChangeNotifier {
  AuthController({required ApiClient api, required SessionStore store})
    : _api = api,
      _store = store {
    // The client rotates tokens on its own when one expires, and it ends the session
    // when a refresh is refused. Both have to reach the app: the first so the new
    // tokens are persisted, the second so the person is returned to sign-in rather
    // than left looking at a screen whose every request is being refused.
    _api.onSessionChanged = _onSessionChanged;
  }

  final ApiClient _api;
  final SessionStore _store;

  Session? _session;
  bool _restoring = true;
  String? _error;
  bool _busy = false;

  Session? get session => _session;
  Account? get account => _session?.account;
  bool get isSignedIn => _session != null;

  /// True until the stored session has been looked for. The app shows nothing
  /// decisive while this is true, so a signed-in person never sees the sign-in screen
  /// flash past on launch.
  bool get isRestoring => _restoring;
  bool get isBusy => _busy;
  String? get error => _error;

  Future<void> restore() async {
    final Session? stored = await _store.read();
    if (stored != null) {
      _session = stored;
      _api.session = stored;
    }
    _restoring = false;
    notifyListeners();
  }

  Future<bool> signIn({required String phone, required String password}) async {
    _busy = true;
    _error = null;
    notifyListeners();

    try {
      await _api.signIn(phone: phone.trim(), password: password);
      return true;
    } on ApiException catch (error) {
      _error = error.message;
      return false;
    } on NetworkException catch (error) {
      _error = error.message;
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    await _api.signOut();
  }

  void _onSessionChanged(Session? session) {
    _session = session;
    if (session == null) {
      unawaited(_store.clear());
    } else {
      unawaited(_store.write(session));
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _api.onSessionChanged = null;
    super.dispose();
  }
}
