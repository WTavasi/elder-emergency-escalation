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
    EventState.escalated => true,
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
  const GeoPoint({required this.latitude, required this.longitude, this.addressLabel});

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
  const Session({required this.account, required this.accessToken, required this.refreshToken});

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
      acknowledgedByName: acknowledgedBy is Map<String, dynamic>
          ? acknowledgedBy['name'] as String?
          : null,
    );
  }
}

/// One emergency as a row in a responder's list.
///
/// The API projects this for every client, so the fields are the ones a person acting
/// on an emergency needs rather than the columns the table happens to have: a name
/// instead of a foreign key, a number instead of a Decimal, and an ISO string instead
/// of a Date whose serialisation depends on who touched it last.
class AlertSummary {
  const AlertSummary({
    required this.eventId,
    required this.state,
    required this.severity,
    required this.severityScore,
    required this.currentTier,
    required this.elderName,
    required this.triggeredAt,
    this.addressLabel,
    this.ownerName,
    this.deadlineAt,
    this.responseSeconds,
    this.outcome,
  });

  final String eventId;
  final EventState state;
  final Severity severity;
  final int severityScore;
  final int currentTier;
  final String elderName;
  final DateTime triggeredAt;
  final String? addressLabel;

  /// Who took responsibility, once somebody has.
  final String? ownerName;

  /// When the current tier's window runs out. Null when nothing is timing.
  final DateTime? deadlineAt;

  /// Seconds between the alert and its acknowledgement. Null while unanswered.
  final int? responseSeconds;

  /// How it ended, once it has. The wire value, because the set is administrator-facing
  /// and a screen showing an unrecognised one verbatim is better than one showing
  /// nothing.
  final String? outcome;

  bool get isAnswered => ownerName != null;

  factory AlertSummary.fromJson(Map<String, dynamic> json) {
    final Object? owner = json['acknowledgedBy'];
    final Object? elder = json['elder'];
    final Object? deadline = json['deadlineAt'];
    final Object? response = json['responseSeconds'];

    return AlertSummary(
      eventId: (json['eventId'] ?? json['id'])! as String,
      state: EventState.parse(json['state'] as String),
      severity: Severity.parse(json['severity'] as String),
      severityScore: (json['severityScore'] as num?)?.toInt() ?? 0,
      currentTier: (json['currentTier'] as num).toInt(),
      elderName: elder is Map<String, dynamic> ? elder['name'] as String : 'Unknown',
      triggeredAt: DateTime.parse(json['triggeredAt'] as String).toLocal(),
      addressLabel: json['addressLabel'] as String?,
      ownerName: owner is Map<String, dynamic> ? owner['name'] as String? : null,
      deadlineAt: deadline is String ? DateTime.parse(deadline).toLocal() : null,
      responseSeconds: response is num ? response.toInt() : null,
      outcome: json['outcome'] as String?,
    );
  }
}

/// One factor of the severity score, with the arithmetic that produced it.
class SeverityFactor {
  const SeverityFactor({
    required this.key,
    required this.label,
    required this.weight,
    required this.contribution,
    this.detail,
  });

  final String key;

  /// The wording the policy itself carries, so the screen never has to invent a name
  /// for a factor an administrator added after this code was written.
  final String label;
  final int weight;
  final int contribution;
  final String? detail;

  /// True when this factor added nothing, which is most of them on a quiet alert.
  bool get isIdle => contribution == 0;

  factory SeverityFactor.fromJson(Map<String, dynamic> json) => SeverityFactor(
    key: json['key'] as String,
    label: json['label'] as String? ?? json['key'] as String,
    weight: (json['weight'] as num).toInt(),
    contribution: (json['contribution'] as num).toInt(),
    detail: json['detail'] as String?,
  );
}

/// One line of what happened, for the timeline.
class TimelineEntry {
  const TimelineEntry({
    required this.id,
    required this.action,
    required this.secondsFromTrigger,
    this.actorName,
  });

  final String id;
  final String action;
  final int secondsFromTrigger;

  /// Null for everything the system did on its own, which is what makes an automatic
  /// escalation distinguishable from a human decision when the trail is read back.
  final String? actorName;

  factory TimelineEntry.fromJson(Map<String, dynamic> json) {
    final Object? actor = json['actor'];
    return TimelineEntry(
      id: json['id'] as String,
      action: json['action'] as String,
      secondsFromTrigger: (json['secondsFromTrigger'] as num).toInt(),
      actorName: actor is Map<String, dynamic> ? actor['name'] as String? : null,
    );
  }
}

/// One rung of the chain, in the order it would be dispatched.
class ChainMember {
  const ChainMember({
    required this.responderId,
    required this.name,
    required this.role,
    required this.priorityOrder,
  });

  final String responderId;
  final String name;
  final Role role;
  final int priorityOrder;

  factory ChainMember.fromJson(Map<String, dynamic> json) => ChainMember(
    responderId: json['responderId'] as String,
    name: json['name'] as String,
    role: Role.parse(json['role'] as String),
    priorityOrder: (json['priorityOrder'] as num).toInt(),
  );
}

/// Everything the detail screen needs, in one request.
///
/// Deliberately without the delivery log. A responder is deciding whether to go, not
/// auditing which push failed; that belongs on the operations console.
class AlertDetail {
  const AlertDetail({
    required this.summary,
    required this.factors,
    required this.timeline,
    required this.chain,
  });

  final AlertSummary summary;
  final List<SeverityFactor> factors;
  final List<TimelineEntry> timeline;
  final List<ChainMember> chain;

  factory AlertDetail.fromJson(Map<String, dynamic> json) {
    final Object? severity = json['severityFactors'];
    final List<dynamic> rawFactors = severity is Map<String, dynamic>
        ? (severity['factors'] as List<dynamic>? ?? const [])
        : const [];

    return AlertDetail(
      summary: AlertSummary.fromJson(json),
      factors: rawFactors
          .map((dynamic f) => SeverityFactor.fromJson(f as Map<String, dynamic>))
          .toList(),
      timeline: (json['timeline'] as List<dynamic>? ?? const [])
          .map((dynamic t) => TimelineEntry.fromJson(t as Map<String, dynamic>))
          .toList(),
      chain: (json['chain'] as List<dynamic>? ?? const [])
          .map((dynamic c) => ChainMember.fromJson(c as Map<String, dynamic>))
          .toList(),
    );
  }
}

/// How an emergency ended. The subset a caregiver can choose from: cancellation is the
/// elder's own path, and no-response is something the system concludes, not a person.
enum Outcome {
  handledAtHome('HANDLED_AT_HOME', 'Handled at home'),
  falseAlarm('FALSE_ALARM', 'False alarm'),
  responderAttended('RESPONDER_ATTENDED', 'An emergency responder attended'),
  hospitalTransfer('HOSPITAL_TRANSFER', 'Taken to hospital');

  const Outcome(this.wire, this.label);

  final String wire;
  final String label;
}
