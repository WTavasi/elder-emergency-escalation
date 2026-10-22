import 'dart:async';
import 'dart:convert' show jsonDecode;

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/live/live_updates.dart';
import 'package:mzazicare/core/push/firebase_config.dart';
import 'package:mzazicare/core/push/push_registration.dart';

import 'support.dart';

class FakeTransport implements PushTransport {
  FakeTransport({this.available = true, this.address = 'device-token-aaaaaaaaaaaa'});

  final bool available;
  String? address;
  int starts = 0;
  final StreamController<String> rotations = StreamController<String>.broadcast();
  final StreamController<Map<String, dynamic>> inbox =
      StreamController<Map<String, dynamic>>.broadcast();

  @override
  Future<bool> start() async {
    starts += 1;
    return available;
  }

  @override
  Future<String?> token() async => address;

  @override
  Stream<String> get tokenRefreshes => rotations.stream;

  @override
  Stream<Map<String, dynamic>> get messages => inbox.stream;

  Future<void> close() async {
    await rotations.close();
    await inbox.close();
  }
}

Session sessionFor(String id) {
  final Map<String, dynamic> body = sessionBody();
  (body['user'] as Map<String, dynamic>)['id'] = id;
  return Session.fromJson(body);
}

void main() {
  late List<String> registered;
  late ApiClient api;

  setUp(() {
    registered = <String>[];
    api = buildApi((http.Request request, int _) {
      if (request.method == 'PUT' && request.url.path.endsWith('/auth/me/push-token')) {
        registered.add((jsonDecode(request.body) as Map<String, dynamic>)['token'] as String);
      }
      return <http.Response>[http.Response('', 204)];
    }).api;
  });

  test('registers once per account, not once per token rotation', () async {
    final FakeTransport transport = FakeTransport();
    final PushRegistration push = PushRegistration(
      api: api,
      live: LiveUpdates(),
      transport: transport,
    );

    final Session first = sessionFor('elder-1');
    await push.follow(first);
    await push.follow(first.withTokens('access-2', 'refresh-2'));

    expect(registered, <String>['device-token-aaaaaaaaaaaa']);
    expect(transport.starts, 1);
    push.dispose();
    await transport.close();
  });

  test('registers again for the next person to sign in on the phone', () async {
    final FakeTransport transport = FakeTransport();
    final PushRegistration push = PushRegistration(
      api: api,
      live: LiveUpdates(),
      transport: transport,
    );

    await push.follow(sessionFor('elder-1'));
    await push.follow(null);
    await push.follow(sessionFor('caregiver-1'));

    expect(registered, hasLength(2));
    push.dispose();
    await transport.close();
  });

  test('sends a rotated address straight away', () async {
    final FakeTransport transport = FakeTransport();
    final PushRegistration push = PushRegistration(
      api: api,
      live: LiveUpdates(),
      transport: transport,
    );

    await push.follow(sessionFor('elder-1'));
    transport.rotations.add('device-token-bbbbbbbbbbbb');
    await Future<void>.delayed(const Duration(milliseconds: 50));

    expect(registered.last, 'device-token-bbbbbbbbbbbb');
    push.dispose();
    await transport.close();
  });

  test('asks for nothing when push is not available in this build', () async {
    final FakeTransport transport = FakeTransport(available: false);
    final PushRegistration push = PushRegistration(
      api: api,
      live: LiveUpdates(),
      transport: transport,
    );

    await push.follow(sessionFor('elder-1'));

    expect(registered, isEmpty);
    push.dispose();
    await transport.close();
  });

  test('a push that arrives while the app is open becomes a change notice', () async {
    final FakeTransport transport = FakeTransport();
    final LiveUpdates live = LiveUpdates();
    final PushRegistration push = PushRegistration(api: api, live: live, transport: transport);
    final List<LiveChange> seen = <LiveChange>[];
    final StreamSubscription<LiveChange> listening = live.changes.listen(seen.add);

    await push.follow(sessionFor('caregiver-1'));
    transport.inbox.add(<String, dynamic>{'eventId': 'event-1', 'state': 'ESCALATED'});
    await Future<void>.delayed(Duration.zero);

    expect(seen.single.eventId, 'event-1');
    await listening.cancel();
    push.dispose();
    live.dispose();
    await transport.close();
  });

  test('a check-in push tells the elder screen to look, and is not an emergency', () async {
    final FakeTransport transport = FakeTransport();
    final LiveUpdates live = LiveUpdates();
    final PushRegistration push = PushRegistration(api: api, live: live, transport: transport);
    final List<LiveChange> changes = <LiveChange>[];
    int asked = 0;
    final StreamSubscription<LiveChange> listening = live.changes.listen(changes.add);
    final StreamSubscription<void> checkIns = live.checkIns.listen((_) => asked += 1);

    await push.follow(sessionFor('elder-1'));
    transport.inbox.add(<String, dynamic>{'type': 'check-in', 'checkInId': 'check-in-1'});
    await Future<void>.delayed(Duration.zero);

    expect(asked, 1);
    expect(changes, isEmpty);
    await listening.cancel();
    await checkIns.cancel();
    push.dispose();
    live.dispose();
    await transport.close();
  });

  group('Firebase configuration', () {
    test('is absent unless the build was given a project', () {
      const FirebaseConfig none = FirebaseConfig.fromEnvironment();
      expect(none.optionsFor(TargetPlatform.android), isNull);
      expect(none.optionsFor(TargetPlatform.iOS), isNull);
    });

    test('builds options only for a platform it has keys for', () {
      const FirebaseConfig android = FirebaseConfig(
        projectId: 'mzazicare-dev',
        senderId: '1234567890',
        androidApiKey: 'android-key',
        androidAppId: '1:1234567890:android:abc',
        iosApiKey: '',
        iosAppId: '',
        iosBundleId: '',
      );

      expect(android.optionsFor(TargetPlatform.android)?.projectId, 'mzazicare-dev');
      expect(android.optionsFor(TargetPlatform.iOS), isNull);
    });
  });
}
