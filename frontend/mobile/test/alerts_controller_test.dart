import 'dart:async';

import 'package:flutter/material.dart' show DateTimeRange;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/features/responder/alerts_controller.dart';

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

  group('searching history', () {
    /// A server that records every list it was asked for.
    ({AlertsController controller, List<Uri> asked}) build() {
      final List<Uri> asked = <Uri>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        asked.add(request.url);
        return <http.Response>[json(<Map<String, dynamic>>[])];
      });
      final AlertsController controller = AlertsController(
        api: t.api,
        typingPause: const Duration(milliseconds: 20),
      );
      return (controller: controller, asked: asked);
    }

    test('sends a name once typing pauses, and only one request for it', () async {
      final ({AlertsController controller, List<Uri> asked}) t = build();
      await t.controller.setOpenOnly(false);
      t.asked.clear();

      t.controller.setSearch('m');
      t.controller.setSearch('ma');
      t.controller.setSearch('mary ');
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(t.asked, hasLength(1));
      expect(t.asked.single.queryParameters['q'], 'mary');
      expect(t.asked.single.queryParameters.containsKey('open'), isFalse);
      expect(t.controller.isSearching, isTrue);
      t.controller.dispose();
    });

    test('narrows to whole days, from the first moment to the last', () async {
      final ({AlertsController controller, List<Uri> asked}) t = build();
      await t.controller.setOpenOnly(false);

      await t.controller.setDays(
        DateTimeRange(start: DateTime(2026, 10, 12, 15), end: DateTime(2026, 10, 14, 9)),
      );

      final Map<String, String> query = t.asked.last.queryParameters;
      expect(DateTime.parse(query['from']!).toLocal(), DateTime(2026, 10, 12));
      expect(DateTime.parse(query['to']!).toLocal(), DateTime(2026, 10, 14, 23, 59, 59, 999));
      t.controller.dispose();
    });

    test('never searches the open list', () async {
      final ({AlertsController controller, List<Uri> asked}) t = build();
      await t.controller.setOpenOnly(false);
      t.controller.setSearch('mary');
      await Future<void>.delayed(const Duration(milliseconds: 60));

      await t.controller.setOpenOnly(true);

      expect(t.asked.last.queryParameters['open'], 'true');
      expect(t.asked.last.queryParameters.containsKey('q'), isFalse);
      expect(t.controller.isSearching, isFalse);
      t.controller.dispose();
    });

    test('an answer that arrives after a newer request is dropped', () async {
      final Completer<http.Response> slow = Completer<http.Response>();
      int index = 0;
      final MockClient transport = MockClient((http.Request request) {
        index += 1;
        if (index == 1) return slow.future;
        return Future<http.Response>.value(json(<Map<String, dynamic>>[summaryBody(id: 'new')]));
      });
      final AlertsController controller = AlertsController(
        api: ApiClient(baseUrl: 'http://api.test/api/v1', httpClient: transport),
      );

      final Future<void> first = controller.refresh();
      await controller.refresh();
      slow.complete(json(<Map<String, dynamic>>[summaryBody(id: 'old')]));
      await first;

      expect(controller.alerts.map((AlertSummary a) => a.eventId), <String>['new']);
      controller.dispose();
    });
  });
}
