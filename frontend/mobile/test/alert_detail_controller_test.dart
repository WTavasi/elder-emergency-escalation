import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/location/way_there.dart';
import 'package:mzazicare/features/responder/alert_detail_controller.dart';

import 'support.dart';

void main() {
  group('loading', () {
    test('parses the chain, the timeline and the severity reasoning', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(detailBody())],
      );

      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );
      await controller.refresh();

      final AlertDetail detail = controller.detail!;
      expect(detail.summary.elderName, 'Grace Wanjiru');

      // In dispatch order, which is what lets a screen name the person a tier was sent
      // to instead of printing the tier number.
      expect(detail.chain.map((ChainMember m) => m.name), <String>['Peter Mwangi', 'Aisha Otieno']);
      expect(detail.chain.first.priorityOrder, 1);

      expect(detail.timeline, hasLength(4));
      // The detail payloads are parsed out, because the plain-language trail is built
      // from them rather than from the action name alone.
      expect(detail.timeline[2].action, 'TIER_DISPATCHED');
      expect(detail.timeline[2].tier, 1);
      expect(detail.timeline.last.toTier, 2);

      expect(detail.factors, hasLength(2));
      expect(detail.factors.first.label, 'Care level');
      // The label comes from the policy, so a factor an administrator adds arrives
      // already worded rather than as a camelCase key.
      expect(detail.factors.last.isIdle, isTrue);
      controller.dispose();
    });

    test('an unacknowledged open alert is the only one offering the two answers', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(detailBody())],
      );

      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );
      await controller.refresh();

      expect(controller.isUnanswered, isTrue);
      controller.dispose();
    });
  });

  group('acting', () {
    test('re-reads the emergency after acting rather than trusting the response', () async {
      final List<String> paths = <String>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        paths.add('${request.method} ${request.url.path}');
        return <http.Response>[
          json(
            request.method == 'POST'
                ? emergencyBody(state: 'ACKNOWLEDGED')
                : detailBody(
                    state: 'ACKNOWLEDGED',
                    acknowledgedBy: <String, dynamic>{
                      'id': 'caregiver-1',
                      'name': 'Peter Mwangi',
                      'role': 'CAREGIVER',
                    },
                  ),
          ),
        ];
      });

      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );
      await controller.acknowledge();

      expect(paths, <String>[
        'POST /api/v1/alerts/event-1/acknowledge',
        'GET /api/v1/alerts/event-1',
      ]);
      expect(controller.detail!.summary.ownerName, 'Peter Mwangi');
      expect(controller.confirmation, isNotNull);
      expect(controller.actionError, isNull);
      controller.dispose();
    });

    test('shows the reason somebody else won the race, without treating it as a fault', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[
          json(<String, dynamic>{
            'message': 'Someone is already responding to this emergency',
          }, 409),
        ],
      );

      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );
      await controller.acknowledge();

      expect(controller.actionError, 'Someone is already responding to this emergency');
      expect(controller.confirmation, isNull);
      expect(controller.isWorking, isFalse);
      controller.dispose();
    });

    test('sends a reason with a decline only when one was given', () async {
      final List<String> bodies = <String>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.method == 'POST') bodies.add(request.body);
        return <http.Response>[json(request.method == 'POST' ? emergencyBody() : detailBody())];
      });

      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );
      await controller.decline();
      await controller.decline(reason: 'At work, two hours away');

      expect(bodies.first, '{}');
      expect(bodies.last, contains('At work, two hours away'));
      controller.dispose();
    });

    test('sends the outcome the person chose when closing', () async {
      final List<String> bodies = <String>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.method == 'POST') bodies.add(request.body);
        return <http.Response>[
          json(
            request.method == 'POST'
                ? emergencyBody(state: 'RESOLVED')
                : detailBody(state: 'RESOLVED'),
          ),
        ];
      });

      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );
      await controller.resolve(Outcome.handledAtHome);

      expect(bodies.single, contains('HANDLED_AT_HOME'));
      controller.dispose();
    });

    test('refuses a second action while the first is in flight', () async {
      int posts = 0;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.method == 'POST') posts += 1;
        return <http.Response>[json(request.method == 'POST' ? emergencyBody() : detailBody())];
      });

      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
      );
      // Both started before either is awaited: one press must not become two.
      await Future.wait<void>(<Future<void>>[controller.acknowledge(), controller.acknowledge()]);

      expect(posts, 1);
      controller.dispose();
    });
  });

  group('on the way', () {
    late FakePositionSource source;

    setUp(() => source = FakePositionSource());
    tearDown(() => source.close());

    Map<String, dynamic> ownedBy(String id, {String? arrivedAt}) => <String, dynamic>{
      ...detailBody(
        state: arrivedAt == null ? 'ACKNOWLEDGED' : 'ON_SCENE',
        acknowledgedBy: <String, dynamic>{'id': id, 'name': 'Peter Mwangi', 'role': 'CAREGIVER'},
      ),
      'arrivedAt': arrivedAt,
    };

    /// A server holding one emergency owned by [owner], with sharing turned on.
    ({AlertDetailController controller, WayThere way, List<Exchange> calls}) build({
      required String owner,
      String me = 'caregiver-1',
    }) {
      bool arrived = false;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        final String path = request.url.path;
        if (path.endsWith('/preferences')) {
          return <http.Response>[
            json(<String, dynamic>{'shareWayThere': true}),
          ];
        }
        if (path.endsWith('/arrived')) {
          arrived = true;
          return <http.Response>[json(<String, dynamic>{})];
        }
        return <http.Response>[
          json(ownedBy(owner, arrivedAt: arrived ? '2026-10-20T10:05:00.000Z' : null)),
        ];
      });
      final WayThere way = WayThere(api: t.api, source: source, every: const Duration(hours: 1));
      final AlertDetailController controller = AlertDetailController(
        api: t.api,
        eventId: 'event-1',
        myId: me,
        wayThere: way,
      );
      return (controller: controller, way: way, calls: t.calls);
    }

    test('starts sharing once the emergency is theirs', () async {
      final ({AlertDetailController controller, WayThere way, List<Exchange> calls}) t = build(
        owner: 'caregiver-1',
      );
      await t.way.follow('caregiver-1');

      await t.controller.refresh();
      await Future<void>.delayed(Duration.zero);

      expect(t.controller.isMine, isTrue);
      expect(t.controller.isOnTheWay, isTrue);
      expect(t.way.isSharingFor('event-1'), isTrue);
      t.controller.dispose();
      t.way.dispose();
    });

    test('shares nothing for somebody else\'s emergency', () async {
      final ({AlertDetailController controller, WayThere way, List<Exchange> calls}) t = build(
        owner: 'family-1',
      );
      await t.way.follow('caregiver-1');

      await t.controller.refresh();
      await Future<void>.delayed(Duration.zero);

      expect(t.controller.isMine, isFalse);
      expect(t.way.state, SharingState.idle);
      expect(source.readings.hasListener, isFalse);
      t.controller.dispose();
      t.way.dispose();
    });

    test('"I am here" is recorded and sharing stops', () async {
      final ({AlertDetailController controller, WayThere way, List<Exchange> calls}) t = build(
        owner: 'caregiver-1',
      );
      await t.way.follow('caregiver-1');
      await t.controller.refresh();
      await Future<void>.delayed(Duration.zero);

      await t.controller.arrived();

      expect(
        t.calls.where((Exchange e) => e.method == 'POST').map((Exchange e) => e.path),
        contains('/api/v1/alerts/event-1/arrived'),
      );
      expect(t.way.isSharingFor('event-1'), isFalse);
      expect(t.controller.isOnTheWay, isFalse);
      expect(t.controller.detail?.summary.state, EventState.onScene);
      expect(t.controller.confirmation, 'Recorded that you are with Grace.');
      t.controller.dispose();
      t.way.dispose();
    });
  });
}
