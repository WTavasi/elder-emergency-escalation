import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/live/live_updates.dart';
import '../../core/location/way_there.dart';
import '../../core/voice/voice_call.dart';
import '../../core/voice/voice_room.dart';

/// One emergency, and the four things a person can do about it.
///
/// Every action follows the same shape: mark busy, call, refetch, publish. The refetch
/// is deliberate rather than lazy. The server's answer to an acknowledgement is the
/// event row, but acting on an emergency changes more than that row: it cancels timers,
/// writes the trail, and can move the emergency to a tier this screen has not seen. So
/// the screen re-reads the projection instead of patching its copy from the response,
/// and never shows a state the server did not confirm.
class AlertDetailController extends ChangeNotifier {
  AlertDetailController({
    required ApiClient api,
    required this.eventId,
    this.pollInterval = const Duration(seconds: 8),
    this.myId,
    this.myRole,
    this.wayThere,
    this.voiceRoom,
    LiveUpdates? live,
  }) : _api = api {
    _live = LiveFollower(
      live: live,
      wants: (LiveChange change) => change.eventId == eventId,
      // A refresh landing mid-action would replace what the person is looking at with
      // the state from before their press. The action refetches when it finishes.
      refresh: () => _isWorking ? Future<void>.value() : refresh(),
    );
  }

  final ApiClient _api;
  final String eventId;
  final Duration pollInterval;

  /// The signed-in person, to tell whether this emergency is theirs. Null means the
  /// screen treats it as somebody else's, which only a test that does not care does.
  final String? myId;

  /// The signed-in person's role. An emergency responder is never offered "Ask for an
  /// emergency responder": they would be asking for themselves.
  final Role? myRole;

  /// Sharing the way there, when the app has it. Null in a test that does not need it.
  final WayThere? wayThere;

  /// How a voice room is made. Null means the real one; tests pass their own.
  final VoiceRoom Function()? voiceRoom;
  late final LiveFollower _live;

  /// Set once sharing has been started from this screen, so a person who pressed
  /// "Stop sharing" is not started again by the next refresh.
  bool _offeredSharing = false;

  AlertDetail? _detail;
  bool _isLoading = true;
  bool _isWorking = false;
  String? _loadError;
  String? _actionError;
  String? _confirmation;
  Timer? _poll;
  bool _disposed = false;

  AlertDetail? get detail => _detail;
  bool get isLoading => _isLoading;

  /// True while an action is in flight. Every control reads this, so one press cannot
  /// become two and two different actions cannot overlap.
  bool get isWorking => _isWorking;
  String? get loadError => _loadError;

  /// Why the last action failed. Separate from [loadError] because a failed action is
  /// the person's business and a failed refresh mostly is not.
  String? get actionError => _actionError;

  /// What just succeeded, announced once.
  String? get confirmation => _confirmation;

  void start() {
    _live.start();
    unawaited(refresh());
    _poll = Timer.periodic(pollInterval, (Timer _) {
      // A refresh landing mid-action would replace what the person is looking at with
      // the state from before their press.
      if (!_isWorking && _live.shouldPoll) unawaited(refresh());
    });
  }

  Future<void> refresh() async {
    _live.asked();
    try {
      final AlertDetail fetched = await _api.alertDetail(eventId);
      if (_disposed) return;
      _detail = fetched;
      _loadError = null;
      _followWayThere();
    } on ApiException catch (error) {
      if (_disposed) return;
      _loadError = error.message;
    } on NetworkException catch (error) {
      if (_disposed) return;
      _loadError = error.message;
    } finally {
      if (!_disposed) {
        _isLoading = false;
        notifyListeners();
      }
    }
  }

  Future<void> acknowledge() =>
      _act(() => _api.acknowledge(eventId), "Done. We've told the others you're going.");

  Future<void> decline({String? reason}) =>
      _act(() => _api.decline(eventId, reason: reason), "Done. We're asking the next person.");

  Future<void> resolve(Outcome outcome, {String? note, EmergencyType? confirmedType}) => _act(
    () => _api.resolve(eventId, outcome, note: note, confirmedType: confirmedType),
    'Emergency closed: ${outcome.label.toLowerCase()}.',
  );

  /// The service this emergency needs, by what was reported: an ambulance for a fall,
  /// the fire service for a fire, a general responder when nobody said.
  ResponderService get serviceNeeded {
    final AlertSummary? summary = _detail?.summary;
    return summary?.serviceRequested ?? summary?.reportedType?.service ?? ResponderService.general;
  }

  /// Asks for [service] now, or the one the emergency needs.
  Future<void> requestResponder([ResponderService? service]) => _act(
    () => _api.requestResponder(eventId, service: service),
    (service ?? serviceNeeded).asked,
  );

  /// The services already asked for this emergency, by the stations asked.
  Set<ResponderService> get servicesAsked => <ResponderService>{
    for (final StationOnAlert station in _detail?.stations ?? const <StationOnAlert>[])
      if (station.service case final ResponderService service) service,
  };

  /// The services that could still be asked, the one the emergency needs first.
  List<ResponderService> get servicesToOffer {
    final Set<ResponderService> asked = servicesAsked;
    final ResponderService needed = serviceNeeded;
    return <ResponderService>[
      needed,
      ...ResponderService.values.where((ResponderService s) => s != needed),
    ].where((ResponderService s) => !asked.contains(s)).toList(growable: false);
  }

  /// "I'm here." Stops the sharing first: nobody needs the way there once it is over.
  Future<void> arrived() {
    wayThere?.stopFor(eventId);
    final String elder = _detail?.summary.elderName.split(' ').first ?? 'them';
    return _act(() => _api.arrived(eventId), "Saved: you're with $elder.");
  }

  /// A call with the elder in this emergency's voice room, not yet joined. The screen
  /// that shows it owns it. On the earpiece to start, like any call held to the ear.
  VoiceCall newCall() =>
      VoiceCall(api: _api, eventId: eventId, speakerFirst: false, room: voiceRoom);

  /// Whether talking through the app is offered: set up on the server, and still open.
  bool get canTalk {
    final AlertDetail? current = _detail;
    return current != null && current.voice.available && current.summary.state.isOpen;
  }

  /// An open emergency on a server with no LiveKit settings, where "Talk to" is hidden.
  /// Said in a development build only, so the missing settings are not a mystery.
  bool get talkIsOff {
    final AlertDetail? current = _detail;
    return current != null && !current.voice.available && current.summary.state.isOpen;
  }

  /// Whether asking for a service is worth offering: not to an emergency responder, not
  /// on a closed emergency, and not once every service has been asked.
  bool get canAskForResponder =>
      myRole != Role.emergencyResponder &&
      (_detail?.summary.state.isOpen ?? false) &&
      servicesToOffer.isNotEmpty;

  /// A service has been asked, by a person, for an urgent type, or by the chain, so the
  /// screen says which.
  bool get responderAsked =>
      myRole != Role.emergencyResponder && (servicesAsked.isNotEmpty || _serviceAsked);

  bool get _serviceAsked {
    final AlertSummary? summary = _detail?.summary;
    return summary?.responderRequestedAt != null || summary?.serviceRequestedAt != null;
  }

  /// "We've asked for the police and an ambulance." From the stations asked; from the
  /// emergency itself on a server that does not list them.
  String get askedLine {
    final List<ResponderService> asked = <ResponderService>[
      for (final ResponderService service in ResponderService.values)
        if (servicesAsked.contains(service)) service,
    ];
    if (asked.isEmpty) return serviceNeeded.asked;
    final List<String> names = asked.map(_named).toList();
    final String list = names.length == 1
        ? names.single
        : '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
    return "We've asked for $list.";
  }

  static String _named(ResponderService service) => switch (service) {
    ResponderService.general => 'an emergency responder',
    ResponderService.ambulance => 'an ambulance',
    ResponderService.fire => 'the fire service',
    ResponderService.police => 'the police',
  };

  /// Whether the person holding this phone is the one who took it on.
  bool get isMine {
    final String? me = myId;
    return me != null && _detail?.summary.ownerId == me;
  }

  /// Theirs, still open, and they have not arrived: the only time "I'm here" means
  /// anything, and the only time their way there is worth sharing.
  bool get isOnTheWay {
    final AlertSummary? summary = _detail?.summary;
    return isMine && summary != null && summary.state.isOpen && summary.arrivedAt == null;
  }

  /// Starts sharing once this emergency becomes theirs, and stops it once it is over
  /// or they have arrived, by whatever route: this screen, the geofence, or somebody
  /// else closing it.
  void _followWayThere() {
    final WayThere? way = wayThere;
    if (way == null) return;
    if (isOnTheWay) {
      if (!_offeredSharing && way.enabled) {
        _offeredSharing = true;
        unawaited(way.shareFor(eventId));
      }
    } else {
      way.stopFor(eventId);
    }
  }

  /// True when this emergency is still live and nobody has taken it, which is the only
  /// moment acknowledging or declining makes sense.
  bool get isUnanswered {
    final AlertDetail? current = _detail;
    return current != null && current.summary.state.isOpen && !current.summary.isAnswered;
  }

  Future<void> _act(Future<void> Function() call, String success) async {
    if (_isWorking) return;
    _isWorking = true;
    _actionError = null;
    _confirmation = null;
    notifyListeners();

    try {
      await call();
      if (_disposed) return;
      _confirmation = success;
      await refresh();
    } on ApiException catch (error) {
      if (_disposed) return;
      // A 409 here is not a fault. It is somebody else having answered first, which is
      // the system working, so the message the server wrote is shown as it stands.
      _actionError = error.message;
    } on NetworkException catch (error) {
      if (_disposed) return;
      _actionError = error.message;
    } finally {
      if (!_disposed) {
        _isWorking = false;
        notifyListeners();
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _poll?.cancel();
    _live.dispose();
    super.dispose();
  }
}
