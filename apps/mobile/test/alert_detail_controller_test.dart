import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/api/api_client.dart';
import 'package:mzazicare/api/models.dart';
import 'package:mzazicare/responder/alert_detail_controller.dart';

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
      expect(detail.chain.single.name, 'Peter Mwangi');
      expect(detail.timeline, hasLength(2));
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
}
