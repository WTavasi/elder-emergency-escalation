import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/models.dart';

/// Where the session lives between launches.
///
/// The Keychain on iOS and the Android Keystore, not shared preferences. A refresh
/// token is a credential that stays valid for thirty days, and this app runs on a
/// device an older person may leave on a table or hand to somebody to look at. Plain
/// preferences are readable by anything with file access on a rooted or jailbroken
/// device, and the whole point of storing a fingerprint rather than the token on the
/// server was to make a stolen copy useless. Storing the real one carelessly here
/// would give that back.
///
/// Every method swallows storage failures and reports "nothing stored" instead. A
/// keychain that cannot be read is a reason to ask somebody to sign in again, never a
/// reason for the app to fail to start.
class SessionStore {
  SessionStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  static const String _key = 'mzazicare.session';

  final FlutterSecureStorage _storage;

  Future<Session?> read() async {
    try {
      final String? raw = await _storage.read(key: _key);
      if (raw == null) return null;
      return Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on Exception {
      // Unreadable or written by an older version of the app. Either way there is
      // nothing usable here, and a clean sign-in is the recovery.
      return null;
    }
  }

  Future<void> write(Session session) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(session.toJson()));
    } on Exception {
      // The session still works for this launch; it just will not survive a restart.
    }
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } on Exception {
      // Nothing more can be done, and the in-memory session is cleared regardless.
    }
  }
}
