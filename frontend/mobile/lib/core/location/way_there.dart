import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import 'position_source.dart';

export 'journey_words.dart';

/// Where sharing the way there has got to.
enum SharingState {
  /// Not sharing anything.
  idle,

  /// Sending positions for [WayThere.eventId].
  sharing,

  /// The server said they arrived, so sharing stopped by itself.
  arrived,

  /// Stopped by a problem the person can see in [WayThere.problem].
  stopped,
}

/// "Share my way there": the preference, and the sharing itself.
///
/// Off until the person turns it on. When it is on and they take an emergency on, the
/// phone sends where it is every [every] until they arrive, the emergency closes, or
/// they stop it. The server turns each position into a time for the elder and a place
/// for the care circle, and forgets it three minutes later. Nothing is shared for an
/// emergency they did not take on, and nothing at all from an elder's phone, which
/// never builds one of these.
///
/// One per app rather than one per screen, because sharing has to carry on after the
/// detail screen is closed: the person is most likely following directions in a maps
/// app by then.
class WayThere extends ChangeNotifier {
  WayThere({
    required ApiClient api,
    required PositionSource source,
    this.every = const Duration(seconds: 12),
  }) : _api = api,
       _source = source;

  final ApiClient _api;
  final PositionSource _source;

  /// How often a position goes to the server. The server allows one every five seconds;
  /// twelve is comfortably inside that and still moves "about 9 minutes" smoothly.
  final Duration every;

  String? _userId;
  bool? _enabled;
  bool _saving = false;
  String? _eventId;
  SharingState _state = SharingState.idle;
  Journey? _journey;
  String? _problem;
  LocationAccess? _access;

  StreamSubscription<Fix>? _readings;
  Timer? _ticker;
  Fix? _latest;
  DateTime? _lastSent;
  bool _sending = false;

  /// Whether "Share my way there" is on. False until it has been read from the server.
  bool get enabled => _enabled ?? false;

  /// Whether the preference has been read yet, so a switch is not shown off and then
  /// jump to on a moment later.
  bool get isLoaded => _enabled != null;

  /// True while a change to the preference is being saved.
  bool get isSaving => _saving;

  SharingState get state => _state;

  /// The emergency being shared for, while sharing.
  String? get eventId => _eventId;

  /// What the server worked out from the last position sent.
  Journey? get journey => _journey;

  /// Why sharing could not start or had to stop, in words for the person.
  String? get problem => _problem;

  /// The access answer behind [problem], when it was about access, so a screen can
  /// offer the right settings page.
  LocationAccess? get access => _access;

  bool isSharingFor(String eventId) => _state == SharingState.sharing && _eventId == eventId;

  /// The app's copy, or none where a screen is built on its own, as in a widget test.
  static WayThere? maybeOf(BuildContext context) {
    try {
      return Provider.of<WayThere>(context, listen: false);
    } on ProviderNotFoundException {
      return null;
    }
  }

  /// Follows the signed-in person. A new person starts from nothing and their own
  /// preference is read; signing out stops any sharing at once.
  Future<void> follow(String? userId) async {
    if (userId == _userId) return;
    stop();
    _userId = userId;
    _enabled = null;
    _state = SharingState.idle;
    _eventId = null;
    _journey = null;
    _problem = null;
    _access = null;
    notifyListeners();
    if (userId != null) await load();
  }

  /// Reads the preference. A failure leaves it off, which is the safe way to be wrong.
  Future<void> load() async {
    try {
      final Preferences preferences = await _api.preferences();
      _enabled = preferences.shareWayThere;
    } on ApiException {
      _enabled ??= false;
    } on NetworkException {
      _enabled ??= false;
    }
    notifyListeners();
  }

  /// Turns the preference on or off. Turning it on asks for location access first and
  /// is only saved once access is granted, so the switch never says "on" for a phone
  /// that cannot share. Returns why it could not be turned on, or null.
  Future<String?> setEnabled(bool on) async {
    if (_saving) return null;
    _saving = true;
    _problem = null;
    _access = null;
    notifyListeners();

    try {
      if (on) {
        final LocationAccess access = await _source.access(ask: true);
        if (access != LocationAccess.granted) {
          _access = access;
          return _problem = accessProblem(access);
        }
      } else {
        stop();
      }
      final Preferences saved = await _api.updatePreferences(shareWayThere: on);
      _enabled = saved.shareWayThere;
      return null;
    } on ApiException catch (failure) {
      return _problem = failure.message;
    } on NetworkException catch (failure) {
      return _problem = failure.message;
    } finally {
      _saving = false;
      notifyListeners();
    }
  }

  /// Whether this phone may read its location now, without asking.
  Future<LocationAccess> checkAccess() => _source.access(ask: false);

  /// Starts sharing for an emergency this person took on. Does nothing when the
  /// preference is off or this emergency is already being shared.
  ///
  /// Asks the phone for access only when [ask] is true, which is when the person pressed
  /// something to share: never on their behalf the moment they take an emergency on and
  /// are rushing out of the door. The preference lives on the account, so a new phone,
  /// or an iPhone that was told "Allow Once", reaches this having never been asked; the
  /// screen then offers to ask, rather than a retry that could never work.
  Future<void> shareFor(String eventId, {bool ask = false}) async {
    if (!enabled || isSharingFor(eventId)) return;
    stop();

    final LocationAccess access = await _source.access(ask: ask);
    if (access != LocationAccess.granted) {
      _eventId = eventId;
      _state = SharingState.stopped;
      _access = access;
      _problem = accessProblem(access);
      notifyListeners();
      return;
    }

    _eventId = eventId;
    _state = SharingState.sharing;
    _journey = null;
    _problem = null;
    _access = null;
    _latest = null;
    _lastSent = null;
    notifyListeners();

    _readings = _source.watch().listen(
      (Fix fix) {
        _latest = fix;
        // The first reading goes at once, so the elder sees a time within seconds of
        // somebody setting off rather than after the first full interval.
        if (_lastSent == null) unawaited(_send());
      },
      onError: (Object _) => _halt(
        SharingState.stopped,
        'Your location stopped coming through, so sharing has stopped.',
      ),
    );
    _ticker = Timer.periodic(every, (Timer _) => unawaited(_send()));
  }

  /// Stops sharing, whatever the reason. Safe to call when nothing is being shared.
  void stop() {
    unawaited(_readings?.cancel());
    _readings = null;
    _ticker?.cancel();
    _ticker = null;
    _latest = null;
    if (_state == SharingState.sharing) {
      _state = SharingState.idle;
      _journey = null;
      notifyListeners();
    }
  }

  /// The phone's settings page that can lift the problem in [access].
  Future<void> openSettings() => _source.openSettings(_access ?? LocationAccess.denied);

  /// Stops sharing for [eventId] only, as a screen does when that emergency closes.
  void stopFor(String eventId) {
    if (_eventId == eventId) stop();
  }

  Future<void> _send() async {
    final Fix? fix = _latest;
    final String? id = _eventId;
    if (fix == null || id == null || _sending || _state != SharingState.sharing) return;

    _sending = true;
    _lastSent = DateTime.now();
    try {
      final PositionResult result = await _api.reportPosition(
        id,
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyMetres: fix.accuracyMetres,
      );
      // Sharing may have been stopped, or moved to another emergency, while this was
      // in flight. The answer then belongs to nothing on screen.
      if (_eventId != id || _state != SharingState.sharing) return;
      if (result.arrived) {
        _halt(SharingState.arrived, null);
      } else {
        _journey = result.journey;
        notifyListeners();
      }
    } on ApiException catch (failure) {
      // Too many, just this once: the next tick sends the newer position anyway.
      if (failure.statusCode == 429) return;
      // Anything else is the server saying this cannot go on: not theirs any more,
      // closed, or sharing turned off on another phone.
      _halt(SharingState.stopped, failure.message);
    } on NetworkException {
      // A tunnel, a lift, a dead zone. The next tick tries again with a fresher fix.
    } finally {
      _sending = false;
    }
  }

  void _halt(SharingState state, String? problem) {
    stop();
    _state = state;
    _journey = null;
    _problem = problem;
    notifyListeners();
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}

/// Why location access stands in the way, said so the person knows what to do.
String accessProblem(LocationAccess access) => switch (access) {
  LocationAccess.granted => '',
  LocationAccess.denied =>
    'Your way there is not being shared yet. Allow MzaziCare to use your location to '
        'share it.',
  LocationAccess.deniedForever =>
    'Location is turned off for MzaziCare. Allow it in your phone settings to share '
        'your way there.',
  LocationAccess.serviceOff =>
    'Location is switched off on this phone. Turn it on to share your way there.',
};
