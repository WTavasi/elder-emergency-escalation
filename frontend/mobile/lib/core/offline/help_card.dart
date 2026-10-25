import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/models.dart';

/// What an elder's phone keeps so it can still ask for help when it cannot reach
/// MzaziCare: who looks after them, with their numbers, and where to text HELP.
///
/// Everything else the fallback needs is already on the phone. The elder's name and home
/// travel with the session, and 999 is a constant. So this is the only thing that has to
/// be fetched ahead of time, and it is refreshed every time the app opens with a
/// connection, so a change to the chain reaches the phone before it is needed.
class HelpCard {
  const HelpCard({required this.accountId, this.carers = const <Carer>[], this.helpByText});

  /// Whose card this is, so a phone handed to somebody else never offers the previous
  /// person's family.
  final String accountId;

  /// In the order the chain asks them.
  final List<Carer> carers;

  /// Null when the server does not read texts.
  final HelpByText? helpByText;

  /// The first person in the chain, the one a call goes to.
  Carer? get first => carers.isEmpty ? null : carers.first;

  factory HelpCard.fromJson(Map<String, dynamic> json) => HelpCard(
    accountId: json['accountId'] as String,
    carers: <Carer>[
      for (final Object? row in (json['carers'] as List<Object?>? ?? const <Object?>[]))
        if (row is Map<String, dynamic>) Carer.fromJson(row),
    ],
    helpByText: HelpByText.fromJson(json['helpByText']),
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'accountId': accountId,
    'carers': <Map<String, dynamic>>[for (final Carer carer in carers) carer.toJson()],
    if (helpByText != null) 'helpByText': helpByText!.toJson(),
  };
}

/// Where the card lives between launches.
///
/// The Keychain and the Android Keystore, like the session, rather than shared
/// preferences: these are other people's phone numbers, on a phone that may be left on a
/// table. Cleared when the elder signs out.
///
/// Every method swallows storage failures. A card that cannot be read leaves the elder
/// with 999 and the shortcode the server last gave, never with an app that fails to open.
class HelpCardStore {
  HelpCardStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  static const String _key = 'mzazicare.help-card';

  final FlutterSecureStorage _storage;

  /// The card for this account, or null if there is none or it is somebody else's.
  Future<HelpCard?> read(String accountId) async {
    try {
      final String? raw = await _storage.read(key: _key);
      if (raw == null) return null;
      final HelpCard card = HelpCard.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      return card.accountId == accountId ? card : null;
    } on Exception {
      return null;
    } on TypeError {
      // Written by an older version of the app in another shape.
      return null;
    }
  }

  Future<void> write(HelpCard card) async {
    try {
      await _storage.write(key: _key, value: jsonEncode(card.toJson()));
    } on Exception {
      // The card in memory still works for this launch.
    }
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _key);
    } on Exception {
      // Nothing more can be done.
    }
  }
}
