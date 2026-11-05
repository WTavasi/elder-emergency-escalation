import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/map/emergency_map.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/responder/alert_detail_screen.dart';
import 'package:mzazicare/features/responder/alert_list_screen.dart';
import 'package:mzazicare/features/responder/alerts_controller.dart';
import 'package:provider/provider.dart';

import 'support.dart';

/// Two open alerts, ranked by the server, the first one far but nobody's.
Map<String, dynamic> ranked({String measuredFrom = 'here'}) => <String, dynamic>{
  'measuredFrom': measuredFrom,
  'alerts': <Map<String, dynamic>>[
    <String, dynamic>{
      'alert': summaryBody(id: 'grace', elderName: 'Grace Wanjiru'),
      'reasons': <String>['Nobody has taken this on yet.', 'About 12 minutes from you by road.'],
      'why': 'About 12 minutes from you by road.',
    },
    <String, dynamic>{
      'alert': <String, dynamic>{
        ...summaryBody(
          id: 'joseph',
          elderName: 'Joseph Kimani',
          state: 'ACKNOWLEDGED',
          acknowledgedBy: <String, dynamic>{
            'id': 'family-1',
            'name': 'Aisha Otieno',
            'role': 'FAMILY_MEMBER',
          },
        ),
        'latitude': -1.268,
        'longitude': 36.811,
      },
      'reasons': <String>['Aisha is on the way.'],
      'why': null,
    },
  ],
};

Future<AlertsController> pumpList(WidgetTester tester, Map<String, dynamic> body) async {
  final ({ApiClient api, List<Exchange> calls}) t = buildApi(
    (http.Request request, int _) => <http.Response>[json(body)],
  );
  final AlertsController controller = AlertsController(
    api: t.api,
    pollInterval: const Duration(hours: 1),
  );
  await tester.pumpWidget(
    ChangeNotifierProvider<AlertsController>.value(
      value: controller,
      child: MaterialApp(
        theme: MzaziTheme.light(AppAudience.standard),
        home: AlertListScreen(api: t.api),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return controller;
}

void main() {
  testWidgets('keeps the server\'s order and adds the one reason a row cannot show', (
    WidgetTester tester,
  ) async {
    final AlertsController controller = await pumpList(tester, ranked());

    final double grace = tester.getTopLeft(find.text('Grace Wanjiru')).dy;
    final double joseph = tester.getTopLeft(find.text('Joseph Kimani')).dy;
    expect(grace, lessThan(joseph));
    expect(find.text('About 12 minutes from you by road.'), findsOneWidget);
    // What the row already says is not said twice.
    expect(find.text('Aisha is on the way.'), findsNothing);
    expect(find.text('Nearest first, from where you are now.'), findsOneWidget);
    controller.dispose();
  });

  testWidgets('shows every open alert on a small map, red only for the one nobody has', (
    WidgetTester tester,
  ) async {
    final AlertsController controller = await pumpList(tester, ranked());

    final SmallMap map = tester.widget<SmallMap>(find.byType(SmallMap));
    expect(map.contents.pins.map((MapPin pin) => (pin.label, pin.kind)), <(String, PinKind)>[
      ('Grace', PinKind.needsSomebody),
      ('Joseph', PinKind.elder),
    ]);

    // Full screen, a pin opens its alert.
    await tester.tap(find.byType(SmallMap));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Show everyone'), findsOneWidget);
    controller.dispose();
  });

  testWidgets('says how to sort by distance when it has nothing to measure from', (
    WidgetTester tester,
  ) async {
    final AlertsController controller = await pumpList(tester, ranked(measuredFrom: 'nowhere'));

    expect(find.text('Turn on Share live location in Me to sort by distance too.'), findsOneWidget);
    controller.dispose();
  });

  test('a station says where it stands, with its time as an estimate from the station', () {
    final StationOnAlert asked = StationOnAlert(
      name: 'Kilimani Police Station',
      askedAt: DateTime(2026, 11, 6, 10),
      status: 'asked',
      etaSeconds: 360,
      byRoad: true,
    );
    final StationOnAlert declined = StationOnAlert(
      name: 'Kileleshwa Police Station',
      askedAt: DateTime(2026, 11, 6, 10),
      status: 'declined',
      etaSeconds: 540,
    );

    expect(
      stationLine(asked),
      'Asked, no answer yet. About 6 minutes away by road, from the station.',
    );
    expect(stationLine(declined), "Can't come.");
  });

  test('the trail names each station asked, how far and why', () {
    final TimelineEntry entry = TimelineEntry.fromJson(<String, dynamic>{
      'id': 'log-1',
      'action': 'STATION_ASKED',
      'secondsFromTrigger': 60,
      'detail': <String, dynamic>{
        'name': 'Kileleshwa Police Station',
        'seconds': 540,
        'byRoad': true,
        'reason': 'declined',
      },
    });
    expect(entry.stationName, 'Kileleshwa Police Station');
    expect(entry.seconds, 540);
    expect(entry.byRoad, isTrue);
  });
}
