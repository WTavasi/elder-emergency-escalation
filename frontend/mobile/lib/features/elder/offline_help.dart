import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/offline/help_card.dart';

/// The elder's ways to ask for help that do not need MzaziCare: texting HELP to its
/// shortcode, texting the family, and calling.
///
/// Read from the phone first, so it is there the moment the app opens with no
/// connection, then refreshed from the server and saved again. It is only ever as old
/// as the last time the app opened with a connection.
class OfflineHelp extends ChangeNotifier {
  OfflineHelp({required ApiClient api, required this.account, HelpCardStore? store})
    : _api = api,
      _store = store ?? HelpCardStore();

  final ApiClient _api;
  final HelpCardStore _store;

  /// The elder, from the session, which is kept on the phone too: their name and home
  /// for the message, without asking anybody.
  final Account account;

  HelpCard? _card;
  bool _disposed = false;

  /// Null until something has been found on the phone or fetched.
  HelpCard? get card => _card;

  Future<void> load() async {
    final HelpCard? stored = await _store.read(account.id);
    if (_disposed) return;
    if (stored != null && _card == null) {
      _card = stored;
      notifyListeners();
    }

    try {
      final Profile profile = await _api.profile();
      if (_disposed) return;
      final HelpCard fresh = HelpCard(
        accountId: account.id,
        carers: profile.carers,
        helpByText: profile.helpByText,
      );
      _card = fresh;
      notifyListeners();
      await _store.write(fresh);
    } on Exception {
      // No connection, most likely, which is exactly when the stored card is for.
    }
  }

  /// What the family is sent when the elder texts them directly.
  ///
  /// Written for somebody reading it on a basic phone with no app: who, that it is help,
  /// why it came this way, and where. The address is the registered home, the same place
  /// an alert is located when no stay is recorded; the phone is never asked where it is.
  String get familyMessage => messageFor(account);

  @visibleForTesting
  static String messageFor(Account account) {
    final String name = account.name.trim().split(RegExp(r'\s+')).first;
    final String? home = account.home?.addressLabel;
    final String where = home == null || home.isEmpty ? '' : ' Home: $home.';
    return 'HELP. $name needs help now. This was sent from the MzaziCare app, '
        'which could not connect.$where Please call $name.';
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
