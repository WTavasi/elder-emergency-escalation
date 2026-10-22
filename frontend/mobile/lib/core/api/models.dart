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

  /// Whether this role takes emergencies on: everybody but the elder and the
  /// administrator.
  bool get responds => switch (this) {
    Role.caregiver || Role.familyMember || Role.emergencyResponder => true,
    Role.elder || Role.administrator => false,
  };
}

enum EventState {
  triggered,
  notified,
  acknowledged,

  /// The person who took it on is with the elder.
  onScene,
  escalated,
  resolved,
  cancelled;

  static EventState parse(String value) => switch (value) {
    'TRIGGERED' => EventState.triggered,
    'NOTIFIED' => EventState.notified,
    'ACKNOWLEDGED' => EventState.acknowledged,
    'ON_SCENE' => EventState.onScene,
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
    EventState.onScene ||
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

/// What raised an emergency: the elder pressing for help, or a daily check-in that
/// nobody answered. Anything unrecognised reads as a press, which is what every alert
/// was before check-ins existed.
enum AlertTrigger {
  panic,
  missedCheckIn;

  static AlertTrigger parse(Object? value) =>
      value == 'MISSED_CHECK_IN' ? AlertTrigger.missedCheckIn : AlertTrigger.panic;
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
    this.email,
    this.home,
  });

  final String id;
  final String name;
  final String phone;
  final Role role;

  /// Optional; most elders have none.
  final String? email;

  /// The elder's registered home. Null for every other role.
  final GeoPoint? home;

  factory Account.fromJson(Map<String, dynamic> json) => Account(
    id: json['id'] as String,
    name: json['name'] as String,
    phone: json['phone'] as String,
    role: Role.parse(json['role'] as String),
    email: json['email'] as String?,
    home: GeoPoint.fromJson(json['home'] as Map<String, dynamic>?),
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'id': id,
    'name': name,
    'phone': phone,
    'email': email,
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

  /// The same session with the account's details replaced, after a profile edit.
  Session withAccount(Account updated) =>
      Session(account: updated, accessToken: accessToken, refreshToken: refreshToken);

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
    this.arrivedAt,
    this.journey,
    this.voice = Voice.off,
    this.trigger = AlertTrigger.panic,
  });

  final String id;
  final EventState state;
  final Severity severity;
  final int currentTier;
  final DateTime triggeredAt;

  /// Who took responsibility, once somebody has. This is the single most reassuring
  /// thing the screen can show, so it is carried explicitly rather than derived.
  final String? acknowledgedByName;

  /// When that person reached the elder. Stays set if the emergency later moves on, so
  /// "they came" is never taken back by a call for a responder.
  final DateTime? arrivedAt;

  /// How long until they arrive, while they are sharing their way there. The elder's
  /// copy never carries a position: the server leaves the coordinates out for them.
  final Journey? journey;

  /// Whether somebody has started talking to the elder through the app.
  final Voice voice;

  /// A press of the button, or a check-in the elder did not answer.
  final AlertTrigger trigger;

  bool get hasArrived => arrivedAt != null;

  bool get fromMissedCheckIn => trigger == AlertTrigger.missedCheckIn;

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
      arrivedAt: _date(json['arrivedAt']),
      journey: Journey.fromJson(json['journey']),
      voice: Voice.fromJson(json['voice']),
      trigger: AlertTrigger.parse(json['trigger']),
    );
  }
}

/// Talking through the app during an emergency.
class Voice {
  const Voice({required this.available, this.startedBy, this.startedAt});

  /// Nothing set up, or an emergency that is over.
  static const Voice off = Voice(available: false);

  /// The server has a voice service and the emergency is open.
  final bool available;

  /// First name of whoever first joined to talk to the elder. Null until somebody has.
  final String? startedBy;
  final DateTime? startedAt;

  bool get hasStarted => available && startedBy != null;

  static Voice fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return off;
    return Voice(
      available: json['available'] as bool? ?? false,
      startedBy: json['startedBy'] as String?,
      startedAt: _date(json['startedAt']),
    );
  }
}

/// What the phone needs to join an emergency's voice room.
class VoiceAccess {
  const VoiceAccess({required this.url, required this.token, required this.room});

  final String url;
  final String token;
  final String room;

  factory VoiceAccess.fromJson(Map<String, dynamic> json) => VoiceAccess(
    url: json['url'] as String,
    token: json['token'] as String,
    room: json['room'] as String,
  );
}

/// The person who took an emergency on, on their way there.
///
/// Only exists while they share it, and only for three minutes after the last report:
/// the server keeps it in memory and never writes a position to the database.
class Journey {
  const Journey({
    required this.etaSeconds,
    required this.distanceMetres,
    required this.byRoad,
    required this.updatedAt,
    this.latitude,
    this.longitude,
  });

  final int etaSeconds;
  final int distanceMetres;

  /// True when a router worked out the route; false for the straight-line estimate.
  final bool byRoad;

  /// When their phone last reported.
  final DateTime updatedAt;

  /// Where they are. Null for the elder, who is shown the time and not a map.
  final double? latitude;
  final double? longitude;

  bool get hasPosition => latitude != null && longitude != null;

  /// Null for anything that is not a journey, which is what an emergency with nobody
  /// on the way carries.
  static Journey? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final Object? eta = json['etaSeconds'];
    final Object? distance = json['distanceMetres'];
    final DateTime? updated = _date(json['updatedAt']);
    if (eta is! num || distance is! num || updated == null) return null;
    return Journey(
      etaSeconds: eta.toInt(),
      distanceMetres: distance.toInt(),
      byRoad: json['source'] == 'osrm',
      updatedAt: updated,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
    );
  }
}

/// What the server said to one shared position.
class PositionResult {
  const PositionResult({required this.arrived, this.journey});

  /// They are there, by this report or an earlier one. The phone stops sharing.
  final bool arrived;
  final Journey? journey;

  factory PositionResult.fromJson(Map<String, dynamic> json) => PositionResult(
    arrived: json['arrived'] as bool? ?? false,
    journey: Journey.fromJson(json['journey']),
  );
}

/// The signed-in person's own choices.
class Preferences {
  const Preferences({required this.shareWayThere});

  /// Whether their position is shared while they are on their way to an emergency
  /// they took on. Off until they turn it on.
  final bool shareWayThere;

  factory Preferences.fromJson(Map<String, dynamic> json) =>
      Preferences(shareWayThere: json['shareWayThere'] as bool? ?? false);
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
    this.elderPhone,
    this.addressLabel,
    this.latitude,
    this.longitude,
    this.ownerName,
    this.ownerId,
    this.arrivedAt,
    this.deadlineAt,
    this.responseSeconds,
    this.outcome,
    this.outcomeNote,
    this.trigger = AlertTrigger.panic,
  });

  final String eventId;
  final EventState state;
  final Severity severity;
  final int severityScore;
  final int currentTier;
  final String elderName;

  /// So a caregiver can ring before deciding whether to set off. Null only if the API
  /// ever stops sending it, in which case the call button simply does not appear.
  final String? elderPhone;
  final DateTime triggeredAt;
  final String? addressLabel;

  /// Where the alert was placed: where the elder is staying if their circle recorded a
  /// stay away from home, otherwise their registered home. Never the phone's position,
  /// because the app never reads it. Null only if a response leaves them out.
  final double? latitude;
  final double? longitude;

  /// Both coordinates or nothing, so a directions link is never built from half a place.
  bool get hasPlace => latitude != null && longitude != null;

  /// Who took responsibility, once somebody has.
  final String? ownerName;

  /// Their account, so a screen can tell whether the person holding the phone is them.
  final String? ownerId;

  /// When they reached the elder. Stays set if the emergency later moves on.
  final DateTime? arrivedAt;

  /// When the current tier's window runs out. Null when nothing is timing.
  final DateTime? deadlineAt;

  /// Seconds between the alert and its acknowledgement. Null while unanswered.
  final int? responseSeconds;

  /// How it ended, once it has. The wire value, because the set is administrator-facing
  /// and a screen showing an unrecognised one verbatim is better than one showing
  /// nothing.
  final String? outcome;

  /// What the person who closed it said happened. Always present for an OTHER outcome.
  final String? outcomeNote;

  /// A press of the button, or a check-in the elder did not answer. A missed check-in
  /// is read differently: nobody asked for help, so the first thing to do is call.
  final AlertTrigger trigger;

  bool get fromMissedCheckIn => trigger == AlertTrigger.missedCheckIn;

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
      elderPhone: elder is Map<String, dynamic> ? elder['phone'] as String? : null,
      triggeredAt: DateTime.parse(json['triggeredAt'] as String).toLocal(),
      addressLabel: json['addressLabel'] as String?,
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      ownerName: owner is Map<String, dynamic> ? owner['name'] as String? : null,
      ownerId: owner is Map<String, dynamic> ? owner['id'] as String? : null,
      arrivedAt: _date(json['arrivedAt']),
      deadlineAt: deadline is String ? DateTime.parse(deadline).toLocal() : null,
      responseSeconds: response is num ? response.toInt() : null,
      outcome: json['outcome'] as String?,
      outcomeNote: json['outcomeNote'] as String?,
      trigger: AlertTrigger.parse(json['trigger']),
    );
  }
}

/// One factor of the severity score, with the arithmetic that produced it.
///
/// Parsed but deliberately not shown anywhere in this app. The reasoning is an operations
/// concern and lives on the web console; this exists so the model matches what the API
/// sends, and so a test fails if that shape changes.
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
    this.tier,
    this.toTier,
    this.recipients,
    this.outcome,
    this.byText = false,
    this.trigger,
    this.reason,
  });

  final String id;
  final String action;
  final int secondsFromTrigger;

  /// Null for everything the system did on its own, which is what makes an automatic
  /// escalation distinguishable from a human decision when the trail is read back.
  final String? actorName;

  /// Pulled out of the audit entry's detail payload, so a screen can write a sentence a
  /// person would say instead of printing an enum. Each is null for the actions that do
  /// not carry it.
  final int? tier;
  final int? toTier;
  final int? recipients;
  final String? outcome;

  /// Answered by replying to the alert SMS rather than in the app.
  final bool byText;

  /// What raised it, on the entry that records the emergency being raised.
  final AlertTrigger? trigger;

  /// Why, where the server says: "checked-in-late" on a withdrawal by a late answer.
  final String? reason;

  factory TimelineEntry.fromJson(Map<String, dynamic> json) {
    final Object? actor = json['actor'];
    final Object? detail = json['detail'];
    final Map<String, dynamic> d = detail is Map<String, dynamic>
        ? detail
        : const <String, dynamic>{};

    int? asInt(Object? value) => value is num ? value.toInt() : null;

    return TimelineEntry(
      id: json['id'] as String,
      action: json['action'] as String,
      secondsFromTrigger: (json['secondsFromTrigger'] as num).toInt(),
      actorName: actor is Map<String, dynamic> ? actor['name'] as String? : null,
      tier: asInt(d['tier']) ?? asInt(d['fromTier']),
      toTier: asInt(d['toTier']),
      recipients: asInt(d['recipients']),
      outcome: d['outcome'] as String?,
      byText: d['via'] == 'sms',
      trigger: d.containsKey('trigger') ? AlertTrigger.parse(d['trigger']) : null,
      reason: d['reason'] as String?,
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
    this.journey,
    this.voice = Voice.off,
  });

  final AlertSummary summary;
  final List<SeverityFactor> factors;
  final List<TimelineEntry> timeline;
  final List<ChainMember> chain;

  /// The person who took it on, on their way, while they share it.
  final Journey? journey;

  /// Whether talking through the app is possible here, and who started it.
  final Voice voice;

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
      journey: Journey.fromJson(json['journey']),
      voice: Voice.fromJson(json['voice']),
    );
  }
}

/// How an emergency ended. The subset a caregiver can choose from: cancellation is the
/// elder's own path, and no-response is something the system concludes, not a person.
enum Outcome {
  handledAtHome('HANDLED_AT_HOME', 'Handled at home', 'Sorted out where she was'),
  falseAlarm('FALSE_ALARM', 'False alarm', 'No help was needed'),
  responderAttended(
    'RESPONDER_ATTENDED',
    'An emergency responder attended',
    'An ambulance or responder came out',
  ),
  hospitalTransfer('HOSPITAL_TRANSFER', 'Taken to hospital', 'She was moved for treatment'),
  other('OTHER', 'Something else', 'None of these fit. You will be asked to say what happened');

  const Outcome(this.wire, this.label, this.hint);

  final String wire;
  final String label;

  /// One line under the label, because 'Handled at home' and 'False alarm' are not as
  /// obviously different to somebody choosing quickly as they look on this page.
  final String hint;

  /// The only outcome that cannot be recorded on its own. An OTHER with nothing written
  /// against it is a closed emergency nobody can account for later, which is worse than
  /// choosing the nearest imperfect option.
  bool get needsNote => this == Outcome.other;
}

/// How much help an elder needs day to day. A severity input, chosen at registration.
enum CareLevel {
  independent('INDEPENDENT', 'Manages on their own'),
  assisted('ASSISTED', 'Needs some help'),
  highDependency('HIGH_DEPENDENCY', 'Needs help with most things');

  const CareLevel(this.wire, this.label);

  final String wire;
  final String label;
}

/// One elder the signed-in person looks after.
class ElderSummary {
  const ElderSummary({
    required this.id,
    required this.name,
    required this.phone,
    required this.myTier,
    required this.canEditChain,
    this.homeLabel,
    this.withheld = const <String>[],
  });

  final String id;
  final String name;

  /// Null when the elder has withdrawn consent to share it and no emergency is open.
  final String? phone;
  final String? homeLabel;
  final int myTier;
  final bool canEditChain;

  /// What the server left out because of a withdrawn consent: "phone", "location".
  final List<String> withheld;

  factory ElderSummary.fromJson(Map<String, dynamic> json) => ElderSummary(
    id: json['id'] as String,
    name: json['name'] as String,
    phone: json['phone'] as String?,
    homeLabel: json['homeLabel'] as String?,
    myTier: (json['myTier'] as num).toInt(),
    canEditChain: json['canEditChain'] as bool? ?? false,
    withheld: _strings(json['withheld']),
  );
}

/// A list of strings from JSON, or an empty one for anything else.
List<String> _strings(Object? value) =>
    value is List<dynamic> ? value.whereType<String>().toList(growable: false) : const <String>[];

/// One place in an elder's chain: a person in it, or a place held for somebody who has
/// not signed up yet.
class ChainPlace {
  const ChainPlace({
    required this.id,
    required this.tier,
    required this.name,
    required this.phone,
    required this.isInvited,
    this.removable = false,
    this.role,
  });

  /// The care assignment's id, or the invitation's while the place is only held.
  final String id;
  final int tier;
  final String name;
  final String phone;
  final Role? role;
  final bool isInvited;

  /// Whether the signed-in caregiver may take this place out of the chain.
  final bool removable;

  factory ChainPlace.fromJson(Map<String, dynamic> json) {
    final Object? role = json['role'];
    return ChainPlace(
      id: json['id'] as String,
      tier: (json['tier'] as num).toInt(),
      name: json['name'] as String,
      phone: json['phone'] as String,
      role: role is String ? Role.parse(role) : null,
      isInvited: json['status'] == 'invited',
      removable: json['removable'] as bool? ?? false,
    );
  }
}

class ChainView {
  const ChainView({
    required this.elderId,
    required this.elderName,
    required this.canEdit,
    required this.places,
  });

  final String elderId;
  final String elderName;
  final bool canEdit;
  final List<ChainPlace> places;

  factory ChainView.fromJson(Map<String, dynamic> json) => ChainView(
    elderId: json['elderId'] as String,
    elderName: json['elderName'] as String,
    canEdit: json['canEdit'] as bool? ?? false,
    places: (json['entries'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(ChainPlace.fromJson)
        .toList(growable: false),
  );
}

/// A place an address search found.
class AddressMatch {
  const AddressMatch({required this.label, required this.latitude, required this.longitude});

  final String label;
  final double latitude;
  final double longitude;

  factory AddressMatch.fromJson(Map<String, dynamic> json) => AddressMatch(
    label: json['label'] as String,
    latitude: (json['latitude'] as num).toDouble(),
    longitude: (json['longitude'] as num).toDouble(),
  );
}

class AddressSearchResult {
  const AddressSearchResult({required this.matches, required this.attribution});

  final List<AddressMatch> matches;

  /// Shown under the results, as OpenStreetMap's licence requires.
  final String attribution;

  factory AddressSearchResult.fromJson(Map<String, dynamic> json) => AddressSearchResult(
    matches: (json['results'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(AddressMatch.fromJson)
        .toList(growable: false),
    attribution: json['attribution'] as String? ?? '',
  );
}

/// Where an elder is right now: at home, or staying somewhere their circle recorded.
class PlaceView {
  const PlaceView({
    required this.isAtHome,
    this.latitude,
    this.longitude,
    this.label,
    this.withheld = false,
  });

  final bool isAtHome;
  final double? latitude;
  final double? longitude;
  final String? label;

  /// The elder has withdrawn consent to share where they are, so none of this is known.
  final bool withheld;

  factory PlaceView.fromJson(Map<String, dynamic> json) => PlaceView(
    isAtHome: json['isAtHome'] as bool? ?? true,
    latitude: (json['latitude'] as num?)?.toDouble(),
    longitude: (json['longitude'] as num?)?.toDouble(),
    label: json['label'] as String?,
    withheld: json['withheld'] as bool? ?? false,
  );
}

/// One elder, as their page in the app shows them.
class ElderDetail {
  const ElderDetail({
    required this.id,
    required this.name,
    required this.phone,
    required this.place,
    required this.canEdit,
    this.careLevel,
    this.home,
    this.withheld = const <String>[],
  });

  final String id;
  final String name;

  /// Null when the elder has withdrawn consent to share it and no emergency is open.
  final String? phone;
  final CareLevel? careLevel;

  /// What the server left out because of a withdrawn consent: "phone", "location".
  final List<String> withheld;

  /// The registered home, which alerts are sent to unless a stay is recorded.
  final AddressMatch? home;
  final PlaceView place;
  final bool canEdit;

  factory ElderDetail.fromJson(Map<String, dynamic> json) {
    final Object? home = json['home'];
    final Object? level = json['careLevel'];
    return ElderDetail(
      id: json['id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String?,
      careLevel: level is String
          ? CareLevel.values.where((CareLevel c) => c.wire == level).firstOrNull
          : null,
      home: home is Map<String, dynamic>
          ? AddressMatch(
              label: home['label'] as String? ?? '',
              latitude: (home['latitude'] as num).toDouble(),
              longitude: (home['longitude'] as num).toDouble(),
            )
          : null,
      place: PlaceView.fromJson(
        json['place'] as Map<String, dynamic>? ?? const <String, dynamic>{},
      ),
      canEdit: json['canEdit'] as bool? ?? false,
      withheld: _strings(json['withheld']),
    );
  }
}

/// The kinds of consent recorded about an elder.
enum ConsentKind {
  dataProcessing('DATA_PROCESSING'),
  locationSharing('LOCATION_SHARING'),
  contactSharing('CONTACT_SHARING');

  const ConsentKind(this.wire);

  /// The name the API uses.
  final String wire;

  static ConsentKind? parse(Object? value) =>
      ConsentKind.values.where((ConsentKind kind) => kind.wire == value).firstOrNull;
}

/// One consent about an elder: who gave it, whether the elder confirmed it, and whether
/// it still stands.
class ConsentItem {
  const ConsentItem({
    required this.kind,
    required this.active,
    this.givenByName,
    this.givenByRelationship,
    this.givenAt,
    this.confirmedAt,
    this.withdrawnAt,
  });

  final ConsentKind kind;

  /// Given and not withdrawn.
  final bool active;

  /// Who first gave it on the elder's behalf, and how they described themselves.
  final String? givenByName;
  final String? givenByRelationship;
  final DateTime? givenAt;

  /// When the elder confirmed it themselves. Null until they do.
  final DateTime? confirmedAt;
  final DateTime? withdrawnAt;

  /// Null for a kind this version of the app does not know, which is then left out
  /// rather than shown wrongly.
  static ConsentItem? fromJson(Map<String, dynamic> json) {
    final ConsentKind? kind = ConsentKind.parse(json['type']);
    if (kind == null) return null;
    final Object? givenBy = json['givenBy'];
    return ConsentItem(
      kind: kind,
      active: json['active'] as bool? ?? false,
      givenByName: givenBy is Map<String, dynamic> ? givenBy['name'] as String? : null,
      givenByRelationship: givenBy is Map<String, dynamic>
          ? givenBy['relationship'] as String?
          : null,
      givenAt: _date(json['givenAt']),
      confirmedAt: _date(json['confirmedAt']),
      withdrawnAt: _date(json['withdrawnAt']),
    );
  }
}

/// Everything recorded about consent for one elder.
class ConsentView {
  const ConsentView({
    required this.elderId,
    required this.elderName,
    required this.needsConfirmation,
    required this.canWithdraw,
    required this.items,
  });

  final String elderId;
  final String elderName;

  /// The elder has never confirmed, for themselves, what was agreed on their behalf.
  final bool needsConfirmation;

  /// Whether the signed-in person may withdraw: the elder, or a caregiver in the chain.
  final bool canWithdraw;
  final List<ConsentItem> items;

  /// The first person who agreed on the elder's behalf, if anybody did.
  ConsentItem? get givenOnBehalf =>
      items.where((ConsentItem item) => item.givenByName != null).firstOrNull;

  factory ConsentView.fromJson(Map<String, dynamic> json) => ConsentView(
    elderId: json['elderId'] as String? ?? '',
    elderName: json['elderName'] as String? ?? '',
    needsConfirmation: json['needsConfirmation'] as bool? ?? false,
    canWithdraw: json['canWithdraw'] as bool? ?? false,
    items: (json['items'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .map(ConsentItem.fromJson)
        .whereType<ConsentItem>()
        .toList(growable: false),
  );
}

DateTime? _date(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;

/// Where one day's check-in stands.
enum CheckInStatus {
  pending,
  answered,
  missed;

  static CheckInStatus parse(Object? value) => switch (value) {
    'ANSWERED' => CheckInStatus.answered,
    'MISSED' => CheckInStatus.missed,
    _ => CheckInStatus.pending,
  };
}

/// One "are you all right?", asked at one of the elder's times.
class CheckIn {
  const CheckIn({
    required this.id,
    required this.dueAt,
    required this.deadlineAt,
    required this.status,
    this.answeredAt,
    this.answeredVia,
    this.eventId,
  });

  final String id;
  final DateTime dueAt;

  /// When the care circle is told if nobody has answered.
  final DateTime deadlineAt;
  final CheckInStatus status;
  final DateTime? answeredAt;

  /// "app" or "sms".
  final String? answeredVia;

  /// The alert raised when it was missed.
  final String? eventId;

  /// Missed, but answered afterwards.
  bool get answeredLate => status == CheckInStatus.missed && answeredAt != null;

  static CheckIn? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final DateTime? due = _date(json['dueAt']);
    final DateTime? deadline = _date(json['deadlineAt']);
    final Object? id = json['id'];
    if (id is! String || due == null || deadline == null) return null;
    return CheckIn(
      id: id,
      dueAt: due,
      deadlineAt: deadline,
      status: CheckInStatus.parse(json['status']),
      answeredAt: _date(json['answeredAt']),
      answeredVia: json['answeredVia'] as String?,
      eventId: json['eventId'] as String?,
    );
  }
}

/// When an elder is asked, and by whose arrangement.
class CheckInSchedule {
  const CheckInSchedule({
    required this.enabled,
    required this.times,
    required this.graceMinutes,
    this.waitingForElder = false,
    this.setByName,
    this.setById,
  });

  final bool enabled;

  /// "09:00", in the elder's own time zone, earliest first.
  final List<String> times;

  /// How long the elder has to answer before their circle is told.
  final int graceMinutes;

  /// Set up by somebody else and not yet agreed by the elder, so nothing is being asked.
  final bool waitingForElder;
  final String? setByName;
  final String? setById;

  /// "09:00", "09:00 and 18:00", "08:00, 13:00 and 20:00".
  String get timesInWords {
    if (times.isEmpty) return '';
    if (times.length == 1) return times.first;
    return '${times.sublist(0, times.length - 1).join(', ')} and ${times.last}';
  }

  static CheckInSchedule? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final Object? setBy = json['setBy'];
    return CheckInSchedule(
      enabled: json['enabled'] as bool? ?? false,
      times: (json['times'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<String>()
          .toList(growable: false),
      graceMinutes: (json['graceMinutes'] as num?)?.toInt() ?? 30,
      waitingForElder: json['waitingForElder'] as bool? ?? false,
      setByName: setBy is Map<String, dynamic> ? setBy['name'] as String? : null,
      setById: setBy is Map<String, dynamic> ? setBy['id'] as String? : null,
    );
  }
}

/// An elder's check-ins as their circle sees them: the arrangement and the last week.
class CheckInsOverview {
  const CheckInsOverview({required this.schedule, required this.recent, required this.canEdit});

  final CheckInSchedule? schedule;

  /// Newest first.
  final List<CheckIn> recent;

  /// Whether the person asking may set it up or change it.
  final bool canEdit;

  bool get isOn => schedule?.enabled ?? false;

  factory CheckInsOverview.fromJson(Map<String, dynamic> json) => CheckInsOverview(
    schedule: CheckInSchedule.fromJson(json['schedule']),
    recent: (json['recent'] as List<dynamic>? ?? const <dynamic>[])
        .map(CheckIn.fromJson)
        .whereType<CheckIn>()
        .toList(growable: false),
    canEdit: json['canEdit'] as bool? ?? false,
  );
}

/// What the elder's own phone needs: a check-in to answer, and a set-up to agree to.
class ElderCheckIns {
  const ElderCheckIns({this.checkIn, this.waitingForAgreement});

  static const ElderCheckIns none = ElderCheckIns();

  /// Waiting for an answer, or missed with its alert still open.
  final CheckIn? checkIn;

  /// Somebody else's set-up, not yet agreed.
  final CheckInSchedule? waitingForAgreement;

  /// A check-in still inside its time to answer.
  CheckIn? get waiting => checkIn?.status == CheckInStatus.pending ? checkIn : null;

  factory ElderCheckIns.fromJson(Map<String, dynamic> json) => ElderCheckIns(
    checkIn: CheckIn.fromJson(json['checkIn']),
    waitingForAgreement: CheckInSchedule.fromJson(json['waitingForAgreement']),
  );
}

/// What answering "I am all right" did.
enum CheckInAnswer {
  /// The check-in was waiting and is now answered.
  answered,

  /// It had been missed and its alert was withdrawn, because nobody had taken it on.
  withdrawn,

  /// It had been missed and somebody is already coming; they can see the answer.
  noted,

  /// There was nothing to answer.
  nothing;

  static CheckInAnswer parse(Object? value) => switch (value) {
    'answered' => CheckInAnswer.answered,
    'withdrawn' => CheckInAnswer.withdrawn,
    'noted' => CheckInAnswer.noted,
    _ => CheckInAnswer.nothing,
  };
}
