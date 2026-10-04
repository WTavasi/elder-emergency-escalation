import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/api/api_client.dart';
import 'package:mzazicare/api/models.dart';
import 'package:mzazicare/responder/alerts_controller.dart';

import 'support.dart';

void main() {
  group('ordering', () {
    test('puts the unanswered ones first, then the highest score, then the oldest', () {
      final List<AlertSummary> ordered = AlertsController.order(<AlertSummary>[
        AlertSummary.fromJson(summaryBody(id: 'closed', state: 'RESOLVED', severityScore: 99)),
        AlertSummary.fromJson(
          summaryBody(
            id: 'answered',
            state: 'ACKNOWLEDGED',
            severityScore: 90,
            acknowledgedBy: <String, dynamic>{
              'id': 'caregiver-1',
              'name': 'Peter Mwangi',
              'role': 'CAREGIVER',
            },
          ),
        ),
        AlertSummary.fromJson(summaryBody(id: 'quiet', severityScore: 20)),
        AlertSummary.fromJson(summaryBody(id: 'loud', severityScore: 80)),
      ]);

      expect(ordered.map((AlertSummary a) => a.eventId), <String>[
        'loud',
        'quiet',
        'answered',
        'closed',
      ]);
    });

    test('breaks a tie on score by putting the one that has waited longest first', () {
      final List<AlertSummary> ordered = AlertsController.order(<AlertSummary>[
        AlertSummary.fromJson(
          summaryBody(id: 'newer', severityScore: 50, triggeredAt: '2026-09-16T10:05:00.000Z'),
        ),
        AlertSummary.fromJson(
          summaryBody(id: 'older', severityScore: 50, triggeredAt: '2026-09-16T10:00:00.000Z'),
        ),
      ]);

      expect(ordered.first.eventId, 'older');
    });
  });

  group('loading', () {
    test('counts only the open ones nobody has answered', () async {
      final ({ApiClient api, List<Exchange> calls}) harness = buildApi(
        (http.Request request, int _) => <http.Response>[
          json(<Map<String, dynamic>>[
            summaryBody(id: 'waiting'),
            summaryBody(
              id: 'answered',
              state: 'ACKNOWLEDGED',
              acknowledgedBy: <String, dynamic>{
                'id': 'caregiver-1',
                'name': 'Peter Mwangi',
                'role': 'CAREGIVER',
              },
            ),
            summaryBody(id: 'closed', state: 'RESOLVED'),
          ]),
        ],
      );

      final AlertsController controller = AlertsController(api: harness.api);
      await controller.refresh();

      expect(controller.alerts, hasLength(3));
      expect(controller.unansweredCount, 1);
      expect(controller.isLoading, isFalse);
      expect(controller.error, isNull);
      controller.dispose();
    });

    test('asks for open alerts only by default', () async {
      Uri? asked;
      final ({ApiClient api, List<Exchange> calls}) harness = buildApi((
        http.Request request,
        int _,
      ) {
        asked = request.url;
        return <http.Response>[json(<Map<String, dynamic>>[])];
      });

      final AlertsController controller = AlertsController(api: harness.api);
      await controller.refresh();

      expect(asked?.queryParameters['open'], 'true');
      controller.dispose();
    });

    test('keeps the list it already had when a refresh fails', () async {
      int call = 0;
      final ({ApiClient api, List<Exchange> calls}) harness = buildApi((
        http.Request request,
        int _,
      ) {
        call += 1;
        return <http.Response>[
          call == 1
              ? json(<Map<String, dynamic>>[summaryBody()])
              : json(<String, dynamic>{'message': 'Service unavailable'}, 503),
        ];
      });

      final AlertsController controller = AlertsController(api: harness.api);
      await controller.refresh();
      await controller.refresh();

      // Stale information about a live emergency beats an empty screen.
      expect(controller.alerts, hasLength(1));
      expect(controller.error, isNotNull);
      controller.dispose();
    });
  });
}
