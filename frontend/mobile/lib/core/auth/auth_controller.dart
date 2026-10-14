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

  /// Asks for a sign-up code. Returns why it could not be asked for, or null. A null
  /// does not mean a code is on its way: the server answers the same either way.
  Future<String?> requestCode(String phone) async {
    try {
      await _api.requestCode(phone);
      return null;
    } on ApiException catch (error) {
      return error.message;
    } on NetworkException catch (error) {
      return error.message;
    }
  }

  /// Creates an account and signs straight into it.
  Future<bool> signUp({
    required String name,
    required String phone,
    required String code,
    required String password,
    required Role role,
    String? email,
  }) async {
    _busy = true;
    _error = null;
    notifyListeners();

    try {
      await _api.register(
        name: name.trim(),
        phone: phone,
        code: code.trim(),
        password: password,
        role: role,
        email: email?.trim(),
      );
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

  /// Asks for a password reset code. Returns why it could not be asked for, or null.
  /// As with sign-up, a null does not mean a code is on its way.
  Future<String?> requestPasswordReset(String phone) async {
    try {
      await _api.requestPasswordReset(phone);
      return null;
    } on ApiException catch (error) {
      return error.message;
    } on NetworkException catch (error) {
      return error.message;
    }
  }

  /// Sets a new password with the code and signs straight in.
  Future<bool> resetPassword({
    required String phone,
    required String code,
    required String newPassword,
  }) async {
    _busy = true;
    _error = null;
    notifyListeners();

    try {
      await _api.resetPassword(phone: phone, code: code.trim(), newPassword: newPassword);
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

  /// Saves a name or email change. Returns why it failed, or null when it saved.
  Future<String?> updateProfile({String? name, String? email, bool clearEmail = false}) async {
    try {
      await _api.updateProfile(name: name, email: email, clearEmail: clearEmail);
      return null;
    } on ApiException catch (error) {
      return error.message;
    } on NetworkException catch (error) {
      return error.message;
    }
  }

  /// Changes the password. Returns why it failed, or null when it changed.
  Future<String?> changePassword({required String current, required String next}) async {
    try {
      await _api.changePassword(current: current, next: next);
      return null;
    } on ApiException catch (error) {
      return error.message;
    } on NetworkException catch (error) {
      return error.message;
    }
  }

  /// Clears a message left by a previous attempt, when the person moves screens.
  void clearError() {
    if (_error == null) return;
    _error = null;
    notifyListeners();
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
