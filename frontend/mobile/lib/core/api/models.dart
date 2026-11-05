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
  administrator,

  /// A vetted volunteer, asked to go to an elder near them. Never takes an emergency on.
  communityResponder;

  static Role parse(String value) => switch (value) {
    'ELDER' => Role.elder,
    'CAREGIVER' => Role.caregiver,
    'FAMILY_MEMBER' => Role.familyMember,
    'EMERGENCY_RESPONDER' => Role.emergencyResponder,
    'ADMINISTRATOR' => Role.administrator,
    'COMMUNITY_RESPONDER' => Role.communityResponder,
    _ => throw FormatException('Unknown role: $value'),
  };

  /// The name the API uses.
  String get wire => switch (this) {
    Role.elder => 'ELDER',
    Role.caregiver => 'CAREGIVER',
    Role.familyMember => 'FAMILY_MEMBER',
    Role.emergencyResponder => 'EMERGENCY_RESPONDER',
    Role.administrator => 'ADMINISTRATOR',
    Role.communityResponder => 'COMMUNITY_RESPONDER',
  };

  /// Whether this role takes emergencies on: everybody but the elder, the administrator
  /// and a community volunteer, who goes beside the chain and never takes one on.
  bool get responds => switch (this) {
    Role.caregiver || Role.familyMember || Role.emergencyResponder => true,
    Role.elder || Role.administrator || Role.communityResponder => false,
  };

  /// Whether this role can be on its way to somebody, and so share its location: those
  /// who take emergencies on, and a community volunteer who said they would go.
  bool get travels => responds || this == Role.communityResponder;
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

/// What is happening, as the elder or somebody helping says. [said] is the elder's own
/// words on their button; [label] is how everybody else reads it. [service] is who the
/// server asks for it by default, mirrored here only to name the button that asks.
enum EmergencyType {
  fall('FALL', 'I fell', 'Fall', ResponderService.ambulance),
  breathing(
    'BREATHING',
    'Chest pain or breathing',
    'Chest or breathing',
    ResponderService.ambulance,
  ),
  unwell('UNWELL', 'I feel unwell', 'Unwell', ResponderService.ambulance),
  fire('FIRE', 'Fire', 'Fire', ResponderService.fire),
  unsafe('UNSAFE', "I'm not safe", 'Not safe', ResponderService.police);

  const EmergencyType(this.wire, this.said, this.label, this.service);

  final String wire;
  final String said;
  final String label;
  final ResponderService service;

  /// Null for nothing reported, and for a type a newer server added that this app does
  /// not know: better unsaid than wrong.
  static EmergencyType? parse(Object? value) {
    for (final EmergencyType type in EmergencyType.values) {
      if (type.wire == value) return type;
    }
    return null;
  }
}

/// Which service an emergency responder is. General takes any call.
enum ResponderService {
  general(
    'GENERAL',
    'Emergency responder',
    'Ask for an emergency responder',
    "We've asked for an emergency responder.",
  ),
  ambulance('AMBULANCE', 'Ambulance', 'Ask for an ambulance', "We've asked for an ambulance."),
  fire('FIRE', 'Fire service', 'Ask for the fire service', "We've asked for the fire service."),
  police('POLICE', 'Police', 'Ask for the police', "We've asked for the police.");

  const ResponderService(this.wire, this.title, this.ask, this.asked);

  final String wire;

  /// The service by name, at the start of a sentence.
  final String title;

  /// The button that asks for this service.
  final String ask;

  /// What the screen says once it has been asked.
  final String asked;

  static ResponderService? parse(Object? value) {
    for (final ResponderService service in ResponderService.values) {
      if (service.wire == value) return service;
    }
    return null;
  }
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
    'role': role.wire,
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
    this.journeys = const <Journey>[],
    this.voice = Voice.off,
    this.trigger = AlertTrigger.panic,
    this.volunteer,
    this.reportedType,
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

  /// Everybody sharing their way there, soonest first, times only on the elder's copy.
  final List<Journey> journeys;

  /// The volunteer's own journey, while they share it.
  Journey? get volunteerJourney {
    for (final Journey journey in journeys) {
      if (journey.traveller == Traveller.volunteer) return journey;
    }
    return null;
  }

  /// Whether somebody has started talking to the elder through the app.
  final Voice voice;

  /// A press of the button, or a check-in the elder did not answer.
  final AlertTrigger trigger;

  /// A community volunteer, when any were asked. The elder's copy has the first name only.
  final VolunteerOnAlert? volunteer;

  /// What the elder said is happening, once they said.
  final EmergencyType? reportedType;

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
      journeys: Journey.listFromJson(json['journeys'], orOnly: json['journey']),
      voice: Voice.fromJson(json['voice']),
      trigger: AlertTrigger.parse(json['trigger']),
      volunteer: VolunteerOnAlert.fromJson(json['volunteer']),
      reportedType: EmergencyType.parse(json['reportedType']),
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

/// Who is on their way: the person who took the emergency on, or the volunteer going.
enum Traveller {
  owner,
  volunteer;

  static Traveller parse(Object? value) =>
      value == 'volunteer' ? Traveller.volunteer : Traveller.owner;
}

/// Somebody on their way to the elder: the person who took the emergency on, or the
/// community volunteer going.
///
/// Only exists while they share it, and only for three minutes after the last report:
/// the server keeps it in memory and never writes a position to the database.
class Journey {
  const Journey({
    required this.etaSeconds,
    required this.distanceMetres,
    required this.byRoad,
    required this.updatedAt,
    this.userId,
    this.traveller = Traveller.owner,
    this.latitude,
    this.longitude,
    this.path = const <MapPoint>[],
  });

  /// Whose journey this is. Null from a server older than several people on the way.
  final String? userId;
  final Traveller traveller;

  final int etaSeconds;
  final int distanceMetres;

  /// True when a router worked out the route; false for the straight-line estimate.
  final bool byRoad;

  /// When their phone last reported.
  final DateTime updatedAt;

  /// Where they are. Null for the elder, who is shown the time and not a map.
  final double? latitude;
  final double? longitude;

  /// The road they are taking, for the map. Empty for the elder, and when the time is
  /// a straight-line estimate: then no road is drawn, rather than a made-up one.
  final List<MapPoint> path;

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
      userId: json['userId'] as String?,
      traveller: Traveller.parse(json['traveller']),
      latitude: (json['latitude'] as num?)?.toDouble(),
      longitude: (json['longitude'] as num?)?.toDouble(),
      path: MapPoint.listFromJson(json['path']),
    );
  }

  /// Every journey in a list, skipping anything that is not one. A server from before
  /// several people could share sends only the owner's, as [orOnly].
  static List<Journey> listFromJson(Object? json, {Object? orOnly}) {
    if (json is List<dynamic>) return json.map(Journey.fromJson).whereType<Journey>().toList();
    final Journey? only = Journey.fromJson(orOnly);
    return only == null ? const <Journey>[] : <Journey>[only];
  }
}

/// One point on a map: a latitude and a longitude, nothing else.
class MapPoint {
  const MapPoint(this.latitude, this.longitude);

  final double latitude;
  final double longitude;

  /// A road as the server sends it: [latitude, longitude] pairs. Anything else is
  /// skipped, so a malformed point loses a corner of the line, not the whole map.
  static List<MapPoint> listFromJson(Object? json) {
    if (json is! List<dynamic>) return const <MapPoint>[];
    final List<MapPoint> points = <MapPoint>[];
    for (final Object? pair in json) {
      if (pair is List<dynamic> && pair.length >= 2 && pair[0] is num && pair[1] is num) {
        points.add(MapPoint((pair[0] as num).toDouble(), (pair[1] as num).toDouble()));
      }
    }
    return points;
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
    this.responderRequestedAt,
    this.reportedType,
    this.confirmedType,
    this.serviceRequested,
    this.serviceRequestedAt,
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

  /// When somebody in the chain asked for an emergency responder. Null until then.
  final DateTime? responderRequestedAt;

  /// What is happening, as the elder or somebody helping said. Null when nobody said.
  final EmergencyType? reportedType;

  /// What the person who closed it says happened.
  final EmergencyType? confirmedType;

  /// The service asked, at once for an urgent type or by a person, and when.
  final ResponderService? serviceRequested;
  final DateTime? serviceRequestedAt;

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
      responderRequestedAt: _date(json['responderRequestedAt']),
      reportedType: EmergencyType.parse(json['reportedType']),
      confirmedType: EmergencyType.parse(json['confirmedType']),
      serviceRequested: ResponderService.parse(json['serviceRequested']),
      serviceRequestedAt: _date(json['serviceRequestedAt']),
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
    this.type,
    this.service,
    this.stationName,
    this.seconds,
    this.byRoad = false,
    this.via,
    this.heardType,
  });

  final String id;
  final String action;
  final int secondsFromTrigger;

  /// How it was said or raised, beyond the app's own buttons: `sms`, `voice` (spoken
  /// after the press), `siri`, `assistant`, `widget` or `tile`.
  final String? via;

  /// On the entry that records the elder speaking: what the words were heard to mean.
  final EmergencyType? heardType;

  /// On the entry that records a station asked: which, how far, and whether by road.
  final String? stationName;
  final int? seconds;
  final bool byRoad;

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

  /// What was reported, on the entry that records a report.
  final EmergencyType? type;

  /// Which service was asked, on the entry that records asking one at once.
  final ResponderService? service;

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
      type: EmergencyType.parse(d['type']),
      service: ResponderService.parse(d['service']),
      stationName: d['name'] as String?,
      seconds: asInt(d['seconds']),
      byRoad: d['byRoad'] == true,
      via: (d['via'] ?? d['from']) as String?,
      heardType: EmergencyType.parse(d['heardType']),
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
    this.journeys = const <Journey>[],
    this.voice = Voice.off,
    this.volunteer,
    this.stations = const <StationOnAlert>[],
    this.speech = const <SpeechHeard>[],
  });

  final AlertSummary summary;
  final List<SeverityFactor> factors;
  final List<TimelineEntry> timeline;
  final List<ChainMember> chain;

  /// The person who took it on, on their way, while they share it.
  final Journey? journey;

  /// Everybody sharing their way there, soonest first: the owner and the volunteer.
  final List<Journey> journeys;

  /// Whether talking through the app is possible here, and who started it.
  final Voice voice;

  /// Community volunteers asked about it, and the one going.
  final VolunteerOnAlert? volunteer;

  /// The stations asked, nearest first, then any asked after a decline or no answer.
  final List<StationOnAlert> stations;

  /// What the elder said after pressing help, oldest first.
  final List<SpeechHeard> speech;

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
      journeys: Journey.listFromJson(json['journeys'], orOnly: json['journey']),
      voice: Voice.fromJson(json['voice']),
      volunteer: VolunteerOnAlert.fromJson(json['volunteer']),
      stations: StationOnAlert.listFromJson(json['stations']),
      speech: SpeechHeard.listFromJson(json['speech']),
    );
  }
}

/// How an emergency ended. The subset a caregiver can choose from: cancellation is the
/// elder's own path, and no-response is something the system concludes, not a person.
enum Outcome {
  handledAtHome('HANDLED_AT_HOME', 'Handled at home', 'Solved where they were'),
  falseAlarm('FALSE_ALARM', 'False alarm', 'No help was needed'),
  responderAttended(
    'RESPONDER_ATTENDED',
    'Emergency responder came',
    'An ambulance or responder came',
  ),
  hospitalTransfer('HOSPITAL_TRANSFER', 'Taken to hospital', 'Moved for treatment'),
  other('OTHER', 'Something else', "You'll describe what happened");

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
  contactSharing('CONTACT_SHARING'),

  /// Vetted volunteers near the elder may be asked to go, and the one who accepts is
  /// told their name and address.
  communityHelp('COMMUNITY_HELP'),

  /// Medical details are kept and shown to those asked about an open emergency.
  /// Withdrawing it deletes them.
  medicalProfile('MEDICAL_PROFILE'),

  /// After pressing help, the elder may say what is happening, written down by our own
  /// speech server. The words are kept 30 days; the recording is not kept.
  voiceReports('VOICE_REPORTS');

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
      times: (json['times'] as List<dynamic>? ?? const <dynamic>[]).whereType<String>().toList(
        growable: false,
      ),
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

/// Community volunteers on one emergency, as the elder and their circle see it.
class VolunteerOnAlert {
  const VolunteerOnAlert({
    required this.asked,
    this.name,
    this.phone,
    this.distanceMetres,
    this.byRoad = false,
    this.acceptedAt,
    this.arrivedAt,
  });

  /// How many nearby were asked. Zero when nobody was available.
  final int asked;

  /// The one going. First name only on the elder's copy.
  final String? name;

  /// For the circle, to ring them. Never on the elder's copy.
  final String? phone;
  final int? distanceMetres;

  /// Whether that distance is along roads rather than the straight line.
  final bool byRoad;
  final DateTime? acceptedAt;
  final DateTime? arrivedAt;

  bool get going => name != null && acceptedAt != null;
  bool get hasArrived => going && arrivedAt != null;

  static VolunteerOnAlert? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    return VolunteerOnAlert(
      asked: (json['asked'] as num?)?.toInt() ?? 0,
      name: json['name'] as String?,
      phone: json['phone'] as String?,
      distanceMetres: (json['distanceMetres'] as num?)?.toInt(),
      byRoad: json['byRoad'] as bool? ?? false,
      acceptedAt: _date(json['acceptedAt']),
      arrivedAt: _date(json['arrivedAt']),
    );
  }
}

/// Where a volunteer's application stands.
enum VolunteerStatus {
  notApplied('NOT_APPLIED'),
  pending('PENDING'),
  approved('APPROVED'),
  rejected('REJECTED'),
  suspended('SUSPENDED');

  const VolunteerStatus(this.wire);
  final String wire;

  static VolunteerStatus parse(Object? value) => VolunteerStatus.values.firstWhere(
    (VolunteerStatus status) => status.wire == value,
    orElse: () => notApplied,
  );
}

/// What a volunteer says they can do.
enum VolunteerTraining {
  firstAid('FIRST_AID', 'First aid'),
  cpr('CPR', 'CPR'),
  communityHealthPromoter('COMMUNITY_HEALTH_PROMOTER', 'Community Health Promoter'),
  healthProfessional('HEALTH_PROFESSIONAL', 'Health professional'),
  other('OTHER', 'Something else');

  const VolunteerTraining(this.wire, this.label);
  final String wire;
  final String label;

  static VolunteerTraining? parse(Object? value) =>
      VolunteerTraining.values.where((VolunteerTraining kind) => kind.wire == value).firstOrNull;
}

/// A volunteer's own application and standing.
class VolunteerProfile {
  const VolunteerProfile({
    required this.status,
    required this.training,
    required this.available,
    this.note,
    this.area,
    this.radiusKm,
    this.reviewNote,
  });

  static const VolunteerProfile none = VolunteerProfile(
    status: VolunteerStatus.notApplied,
    training: <VolunteerTraining>[],
    available: false,
  );

  final VolunteerStatus status;
  final List<VolunteerTraining> training;
  final bool available;
  final String? note;
  final AddressMatch? area;
  final double? radiusKm;

  /// Why it was not approved, or was suspended, in the reviewer's words.
  final String? reviewNote;

  bool get approved => status == VolunteerStatus.approved;

  factory VolunteerProfile.fromJson(Map<String, dynamic> json) {
    final Object? area = json['area'];
    return VolunteerProfile(
      status: VolunteerStatus.parse(json['status']),
      training: (json['training'] as List<dynamic>? ?? const <dynamic>[])
          .map(VolunteerTraining.parse)
          .whereType<VolunteerTraining>()
          .toList(growable: false),
      available: json['available'] as bool? ?? false,
      note: json['note'] as String?,
      area: area is Map<String, dynamic> && area['latitude'] is num && area['longitude'] is num
          ? AddressMatch(
              label: area['label'] as String? ?? '',
              latitude: (area['latitude'] as num).toDouble(),
              longitude: (area['longitude'] as num).toDouble(),
            )
          : null,
      radiusKm: (json['radiusKm'] as num?)?.toDouble(),
      reviewNote: json['reviewNote'] as String?,
    );
  }
}

/// What a volunteer said about one emergency.
enum VolunteerCallStatus {
  asked('ASKED'),
  accepted('ACCEPTED'),
  declined('DECLINED'),
  stoodDown('STOOD_DOWN'),
  withdrawn('WITHDRAWN');

  const VolunteerCallStatus(this.wire);
  final String wire;

  static VolunteerCallStatus parse(Object? value) => VolunteerCallStatus.values.firstWhere(
    (VolunteerCallStatus status) => status.wire == value,
    orElse: () => asked,
  );
}

/// Who and where, given only to the volunteer who accepted, and only while it is open.
class VolunteerCallElder {
  const VolunteerCallElder({
    required this.name,
    required this.phone,
    required this.latitude,
    required this.longitude,
    this.addressLabel,
  });

  final String name;
  final String phone;
  final double latitude;
  final double longitude;
  final String? addressLabel;
}

/// One emergency a volunteer was asked about.
class VolunteerCall {
  const VolunteerCall({
    required this.eventId,
    required this.status,
    required this.distanceMetres,
    required this.severity,
    required this.raisedAt,
    required this.open,
    required this.takenByAnother,
    this.byRoad = false,
    this.elder,
    this.circleOwner,
    this.acceptedAt,
    this.arrivedAt,
  });

  final String eventId;
  final VolunteerCallStatus status;
  final int distanceMetres;

  /// Whether that distance is along roads rather than the straight line.
  final bool byRoad;
  final Severity severity;
  final DateTime raisedAt;
  final bool open;
  final bool takenByAnother;
  final VolunteerCallElder? elder;

  /// First name of somebody from the elder's circle who is also on the way.
  final String? circleOwner;
  final DateTime? acceptedAt;
  final DateTime? arrivedAt;

  bool get going => status == VolunteerCallStatus.accepted && open;

  /// Still waiting for this volunteer's answer, with nobody else going.
  bool get waiting =>
      open &&
      !takenByAnother &&
      (status == VolunteerCallStatus.asked || status == VolunteerCallStatus.stoodDown);

  static VolunteerCall? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final Object? id = json['eventId'];
    final DateTime? raised = _date(json['raisedAt']);
    if (id is! String || raised == null) return null;
    final Object? elder = json['elder'];
    return VolunteerCall(
      eventId: id,
      status: VolunteerCallStatus.parse(json['status']),
      distanceMetres: (json['distanceMetres'] as num?)?.toInt() ?? 0,
      byRoad: json['byRoad'] as bool? ?? false,
      severity: Severity.parse(json['severity'] as String? ?? 'STANDARD'),
      raisedAt: raised,
      open: json['open'] as bool? ?? false,
      takenByAnother: json['takenByAnother'] as bool? ?? false,
      elder: elder is Map<String, dynamic>
          ? VolunteerCallElder(
              name: elder['name'] as String? ?? '',
              phone: elder['phone'] as String? ?? '',
              latitude: (elder['latitude'] as num?)?.toDouble() ?? 0,
              longitude: (elder['longitude'] as num?)?.toDouble() ?? 0,
              addressLabel: elder['addressLabel'] as String?,
            )
          : null,
      circleOwner: json['circleOwner'] as String?,
      acceptedAt: _date(json['acceptedAt']),
      arrivedAt: _date(json['arrivedAt']),
    );
  }
}

/// "about 300 m", "about 1.2 km": how far, rounded, never where.
String roughDistance(int metres) {
  if (metres < 1000) {
    final int rounded = ((metres / 50).round() * 50).clamp(50, 950);
    return 'about $rounded m';
  }
  final String km = (metres / 1000).toStringAsFixed(1);
  return 'about ${km.endsWith('.0') ? km.substring(0, km.length - 2) : km} km';
}

/// "about 1.8 km away by road", or "about 1.2 km away" for the straight line.
String howFarAway(int metres, {required bool byRoad}) =>
    '${roughDistance(metres)} away${byRoad ? ' by road' : ''}';

/// Where the signed-in person sits in one elder's chain. Place 1 is asked first.
class CirclePlace {
  const CirclePlace({required this.elderId, required this.elderName, required this.place});

  final String elderId;
  final String elderName;
  final int place;
}

/// What the signed-in person has done when asked. Their own record, never a ranking.
class ResponseRecord {
  const ResponseRecord({required this.answered, this.medianResponseSeconds, this.lastAnsweredAt});

  final int answered;
  final int? medianResponseSeconds;
  final DateTime? lastAnsweredAt;
}

/// One of an elder's carers, in the order they are asked.
class Carer {
  const Carer({required this.name, required this.role, required this.place, required this.phone});

  final String name;
  final Role role;
  final int place;
  final String phone;

  /// First name only, as a person would say it: "Call Mary".
  String get firstName {
    final String trimmed = name.trim();
    return trimmed.isEmpty ? name : trimmed.split(RegExp(r'\s+')).first;
  }

  factory Carer.fromJson(Map<String, dynamic> json) => Carer(
    name: json['name'] as String? ?? '',
    role: Role.parse(json['role'] as String? ?? 'CAREGIVER'),
    place: (json['place'] as num?)?.toInt() ?? 1,
    phone: json['phone'] as String? ?? '',
  );

  Map<String, dynamic> toJson() => <String, dynamic>{
    'name': name,
    'role': role.wire,
    'place': place,
    'phone': phone,
  };
}

/// Where an elder texts to ask for help when the app cannot reach the server: a
/// shortcode, and the word to send. The server offers it only when it reads texts.
class HelpByText {
  const HelpByText({required this.number, required this.word});

  final String number;
  final String word;

  static HelpByText? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final String? number = json['number'] as String?;
    final String? word = json['word'] as String?;
    if (number == null || number.isEmpty || word == null || word.isEmpty) return null;
    return HelpByText(number: number, word: word);
  }

  Map<String, dynamic> toJson() => <String, dynamic>{'number': number, 'word': word};
}

/// The account page's view: where a person stands, what they have done, and for an
/// elder, who comes.
class Profile {
  const Profile({
    required this.memberSince,
    this.circles = const <CirclePlace>[],
    this.record,
    this.carers = const <Carer>[],
    this.helpByText,
  });

  final DateTime? memberSince;
  final List<CirclePlace> circles;
  final ResponseRecord? record;
  final List<Carer> carers;

  /// For an elder, where to text for help without data. Null for everybody else, and
  /// when the server cannot read texts.
  final HelpByText? helpByText;

  factory Profile.fromJson(Map<String, dynamic> json) {
    final Object? record = json['record'];
    return Profile(
      memberSince: _date(json['memberSince']),
      circles: <CirclePlace>[
        for (final Object? row in _list(json['circles']))
          if (row is Map<String, dynamic>)
            CirclePlace(
              elderId: row['elderId'] as String? ?? '',
              elderName: row['elderName'] as String? ?? '',
              place: (row['place'] as num?)?.toInt() ?? 1,
            ),
      ],
      record: record is Map<String, dynamic>
          ? ResponseRecord(
              answered: (record['answered'] as num?)?.toInt() ?? 0,
              medianResponseSeconds: (record['medianResponseSeconds'] as num?)?.toInt(),
              lastAnsweredAt: _date(record['lastAnsweredAt']),
            )
          : null,
      carers: <Carer>[
        for (final Object? row in _list(json['carers']))
          if (row is Map<String, dynamic>) Carer.fromJson(row),
      ],
      helpByText: HelpByText.fromJson(json['helpByText']),
    );
  }
}

/// A JSON list, or nothing: a field of the wrong shape reads as empty rather than throwing.
List<Object?> _list(Object? value) => value is List<Object?> ? value : const <Object?>[];

/// Who answers questions about personal data on this server. Any part may be unset.
class DataContact {
  const DataContact({this.name, this.email, this.address});

  final String? name;
  final String? email;
  final String? address;
}

/// The parts of the privacy notice and terms that depend on how the server is set up.
class LegalFacts {
  const LegalFacts({
    required this.privacyVersion,
    required this.termsVersion,
    required this.retentionEnabled,
    required this.closedEmergencyDays,
    required this.auditLogDays,
    this.contact,
  });

  final String privacyVersion;
  final String termsVersion;
  final bool retentionEnabled;
  final int closedEmergencyDays;
  final int auditLogDays;

  /// Null until the deployment names one.
  final DataContact? contact;

  factory LegalFacts.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> retention =
        json['retention'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final Object? contact = json['contact'];
    return LegalFacts(
      privacyVersion: json['privacyVersion'] as String? ?? '',
      termsVersion: json['termsVersion'] as String? ?? '',
      retentionEnabled: retention['enabled'] as bool? ?? true,
      closedEmergencyDays: (retention['closedEmergencyDays'] as num?)?.toInt() ?? 365,
      auditLogDays: (retention['auditLogDays'] as num?)?.toInt() ?? 365,
      contact: contact is Map<String, dynamic>
          ? DataContact(
              name: contact['name'] as String?,
              email: contact['email'] as String?,
              address: contact['address'] as String?,
            )
          : null,
    );
  }
}

/// A code a caregiver types into the elder's phone to sign it in.
class PairingCode {
  const PairingCode({required this.code, required this.expiresIn});

  final String code;
  final Duration expiresIn;

  factory PairingCode.fromJson(Map<String, dynamic> json) => PairingCode(
    code: json['code'] as String? ?? '',
    expiresIn: Duration(seconds: (json['expiresInSeconds'] as num?)?.toInt() ?? 600),
  );
}

/// One open emergency in the order to go to it, with why it sits there.
class RankedAlert {
  const RankedAlert({
    required this.alert,
    this.reasons = const <String>[],
    this.why,
    this.travelSeconds,
    this.byRoad = false,
  });

  final AlertSummary alert;

  /// The one reason a list row cannot show by itself: how far, or how much sooner.
  final String? why;

  /// Short sentences from the server, most important first.
  final List<String> reasons;

  /// From this person to the alert, when that is known.
  final int? travelSeconds;
  final bool byRoad;

  static RankedAlert? fromJson(Object? json) {
    if (json is! Map<String, dynamic>) return null;
    final Object? alert = json['alert'];
    if (alert is! Map<String, dynamic>) return null;
    return RankedAlert(
      alert: AlertSummary.fromJson(alert),
      reasons: (json['reasons'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<String>()
          .toList(),
      why: json['why'] as String?,
      travelSeconds: (json['travelSeconds'] as num?)?.toInt(),
      byRoad: json['byRoad'] as bool? ?? false,
    );
  }
}

/// Where the ranking measured times from.
enum MeasuredFrom {
  here,
  station,
  nowhere;

  static MeasuredFrom parse(Object? value) => switch (value) {
    'here' => MeasuredFrom.here,
    'station' => MeasuredFrom.station,
    _ => MeasuredFrom.nowhere,
  };
}

/// One station asked about an emergency, as the care circle sees it.
class StationOnAlert {
  const StationOnAlert({
    required this.name,
    required this.askedAt,
    required this.status,
    this.service,
    this.station,
    this.etaSeconds,
    this.byRoad = false,
  });

  final String name;
  final ResponderService? service;

  /// Where it is based: "Lenana Road, Kilimani, Nairobi".
  final String? station;
  final DateTime askedAt;

  /// From the station, not from wherever the unit is now: an estimate.
  final int? etaSeconds;
  final bool byRoad;

  /// asked, declined or coming.
  final String status;

  bool get declined => status == 'declined';
  bool get coming => status == 'coming';

  static List<StationOnAlert> listFromJson(Object? json) {
    if (json is! List<dynamic>) return const <StationOnAlert>[];
    final List<StationOnAlert> stations = <StationOnAlert>[];
    for (final Object? item in json) {
      if (item is! Map<String, dynamic>) continue;
      final Object? name = item['name'];
      final DateTime? asked = _date(item['askedAt']);
      if (name is! String || asked == null) continue;
      stations.add(
        StationOnAlert(
          name: name,
          service: ResponderService.parse(item['service']),
          station: item['station'] as String?,
          askedAt: asked,
          etaSeconds: (item['etaSeconds'] as num?)?.toInt(),
          byRoad: item['byRoad'] as bool? ?? false,
          status: item['status'] as String? ?? 'asked',
        ),
      );
    }
    return stations;
  }
}

/// The nearest station of one service to an elder's home.
class NearbyService {
  const NearbyService({
    required this.name,
    required this.service,
    this.station,
    this.etaSeconds,
    this.byRoad = false,
  });

  final String name;
  final ResponderService service;
  final String? station;
  final int? etaSeconds;
  final bool byRoad;

  /// Who can come to an elder besides their circle, the default responder first. Empty
  /// when the elder has no home recorded.
  static List<NearbyService> listFromJson(Object? json) {
    if (json is! Map<String, dynamic>) return const <NearbyService>[];
    final List<NearbyService> services = <NearbyService>[];
    for (final Object? item in _list(json['services'])) {
      if (item is! Map<String, dynamic>) continue;
      final ResponderService? service = ResponderService.parse(item['service']);
      final Object? name = item['name'];
      if (service == null || name is! String) continue;
      services.add(
        NearbyService(
          name: name,
          service: service,
          station: item['station'] as String?,
          etaSeconds: (item['etaSeconds'] as num?)?.toInt(),
          byRoad: item['byRoad'] as bool? ?? false,
        ),
      );
    }
    return services;
  }
}

/// Whether to offer the microphone after the press.
class SpeechStatus {
  const SpeechStatus({required this.available, required this.consented});

  /// The server has a speech-to-text server to send to.
  final bool available;

  /// The elder agreed to speaking to report.
  final bool consented;

  static const SpeechStatus off = SpeechStatus(available: false, consented: false);

  bool get offered => available && consented;

  factory SpeechStatus.fromJson(Map<String, dynamic> json) => SpeechStatus(
    available: json['available'] as bool? ?? false,
    consented: json['consented'] as bool? ?? false,
  );
}

/// What the elder said after pressing help, as written down, and what it was heard to
/// mean.
class SpeechHeard {
  const SpeechHeard({
    required this.at,
    required this.transcript,
    this.english,
    this.language,
    this.heardType,
    this.applied = false,
  });

  final DateTime at;

  /// In their own words.
  final String transcript;

  /// In English, when it was said in another language.
  final String? english;

  /// "sw", "en".
  final String? language;
  final EmergencyType? heardType;

  /// Reported on the emergency, so the service for it follows.
  final bool applied;

  factory SpeechHeard.fromJson(Map<String, dynamic> json) => SpeechHeard(
    at: DateTime.tryParse(json['at'] as String? ?? '')?.toLocal() ?? DateTime.now(),
    transcript: json['transcript'] as String? ?? '',
    english: json['english'] as String?,
    language: json['language'] as String?,
    heardType: EmergencyType.parse(json['heardType']),
    applied: json['applied'] as bool? ?? false,
  );

  static List<SpeechHeard> listFromJson(Object? json) => <SpeechHeard>[
    for (final Object? item in _list(json))
      if (item is Map<String, dynamic>) SpeechHeard.fromJson(item),
  ];
}
