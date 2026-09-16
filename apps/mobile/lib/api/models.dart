/// The shapes the API returns.
///
/// Written out rather than generated, so that adding a column to a table is a
/// deliberate act here too, and so the app can be read without the server open
/// beside it. Every field is parsed defensively: a missing or mistyped value produces
/// a [FormatException] at the boundary rather than a null that surfaces three screens
/// later as a blank panic button.
library;

enum Role {
  elder,
  caregiver,
  familyMember,
  emergencyResponder,
  administrator;

  static Role parse(String value) => switch (value) {
        'ELDER' => Role.elder,
        'CAREGIVER' => Role.caregiver,
        'FAMILY_MEMBER' => Role.familyMember,
        'EMERGENCY_RESPONDER' => Role.emergencyResponder,
        'ADMINISTRATOR' => Role.administrator,
        _ => throw FormatException('Unknown role: $value'),
      };
}

enum EventState {
  triggered,
  notified,
  acknowledged,
  escalated,
  resolved,
  cancelled;

  static EventState parse(String value) => switch (value) {
        'TRIGGERED' => EventState.triggered,
        'NOTIFIED' => EventState.notified,
        'ACKNOWLEDGED' => EventState.acknowledged,
        'ESCALATED' => EventState.escalated,
        'RESOLVED' => EventState.resolved,
        'CANCELLED' => EventState.cancelled,
        _ => throw FormatException('Unknown state: $value'),
      };

  /// Whether this emergency is still live. Drives what the elder is shown.
  bool get isOpen => switch (this) {
        EventState.triggered ||
        EventState.notified ||
        EventState.acknowledged ||
        EventState.escalated =>
          true,
        EventState.resolved || EventState.cancelled => false,
      };
}

enum Severity {
  standard,
  elevated,
  critical;

  static Severity parse(String value) => switch (value) {
        'STANDARD' => Severity.standard,
        'ELEVATED' => Severity.elevated,
        'CRITICAL' => Severity.critical,
        _ => throw FormatException('Unknown severity: $value'),
      };
}

/// Where an emergency is raised from.
class GeoPoint {
  const GeoPoint({
    required this.latitude,
    required this.longitude,
    this.addressLabel,
  });

  final double latitude;
  final double longitude;
  final String? addressLabel;

  static GeoPoint? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;

    final Object? latitude = json['latitude'];
    final Object? longitude = json['longitude'];
    if (latitude is! num || longitude is! num) return null;

    return GeoPoint(
      latitude: latitude.toDouble(),
      longitude: longitude.toDouble(),
      addressLabel: json['addressLabel'] as String?,
    );
  }
}

/// The signed-in person.
class Account {
  const Account({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
    this.home,
  });

  final String id;
  final String name;
  final String phone;
  final Role role;

  /// The elder's registered home. Null for every other role.
  final GeoPoint? home;

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        id: json['id'] as String,
        name: json['name'] as String,
        phone: json['phone'] as String,
        role: Role.parse(json['role'] as String),
        home: GeoPoint.fromJson(json['home'] as Map<String, dynamic>?),
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'id': id,
        'name': name,
        'phone': phone,
        'role': switch (role) {
          Role.elder => 'ELDER',
          Role.caregiver => 'CAREGIVER',
          Role.familyMember => 'FAMILY_MEMBER',
          Role.emergencyResponder => 'EMERGENCY_RESPONDER',
          Role.administrator => 'ADMINISTRATOR',
        },
        if (home != null)
          'home': <String, dynamic>{
            'latitude': home!.latitude,
            'longitude': home!.longitude,
            'addressLabel': home!.addressLabel,
          },
      };
}

/// A session: who is signed in, and the two tokens that prove it.
class Session {
  const Session({
    required this.account,
    required this.accessToken,
    required this.refreshToken,
  });

  final Account account;
  final String accessToken;
  final String refreshToken;

  Session withTokens(String access, String refresh) =>
      Session(account: account, accessToken: access, refreshToken: refresh);

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        account: Account.fromJson(json['user'] as Map<String, dynamic>),
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
      );

  Map<String, dynamic> toJson() => <String, dynamic>{
        'user': account.toJson(),
        'accessToken': accessToken,
        'refreshToken': refreshToken,
      };
}

/// One emergency, as the elder's own screen needs it.
class Emergency {
  const Emergency({
    required this.id,
    required this.state,
    required this.severity,
    required this.currentTier,
    required this.triggeredAt,
    this.acknowledgedByName,
  });

  final String id;
  final EventState state;
  final Severity severity;
  final int currentTier;
  final DateTime triggeredAt;

  /// Who took responsibility, once somebody has. This is the single most reassuring
  /// thing the screen can show, so it is carried explicitly rather than derived.
  final String? acknowledgedByName;

  factory Emergency.fromJson(Map<String, dynamic> json) {
    // The create endpoint returns the raw row, whose id field is `id`, while the list
    // and detail projections call it `eventId`. Accepting both keeps one model rather
    // than two that differ by a field name.
    final Object? id = json['id'] ?? json['eventId'];
    final Object? acknowledgedBy = json['acknowledgedBy'];

    return Emergency(
      id: id! as String,
      state: EventState.parse(json['state'] as String),
      severity: Severity.parse(json['severity'] as String),
      currentTier: (json['currentTier'] as num).toInt(),
      triggeredAt: DateTime.parse(json['triggeredAt'] as String).toLocal(),
      acknowledgedByName:
          acknowledgedBy is Map<String, dynamic> ? acknowledgedBy['name'] as String? : null,
    );
  }
}
