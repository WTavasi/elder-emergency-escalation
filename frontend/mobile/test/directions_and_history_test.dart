import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/features/responder/alert_list_screen.dart';
import 'package:mzazicare/features/responder/widgets/directions_button.dart';
import 'package:mzazicare/features/responder/widgets/severity_mark.dart';

void main() {
  group('directions', () {
    testWidgets('opens a Google Maps directions link to the alert\'s place', (
      WidgetTester tester,
    ) async {
      Uri? opened;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DirectionsButton(
              latitude: -1.286389,
              longitude: 36.817223,
              open: (Uri uri) async {
                opened = uri;
                return true;
              },
            ),
          ),
        ),
      );

      await tester.tap(find.text('Get directions'));
      await tester.pumpAndSettle();

      expect(opened?.host, 'www.google.com');
      expect(opened?.path, '/maps/dir/');
      expect(opened?.queryParameters['api'], '1');
      expect(opened?.queryParameters['destination'], '-1.286389,36.817223');
      // Nothing to fall back to when the maps app opened.
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('says what to search for when nothing can open the link', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DirectionsButton(
              latitude: -1.286389,
              longitude: 36.817223,
              addressLabel: 'Kilimani, Nairobi',
              open: (Uri _) async => false,
            ),
          ),
        ),
      );

      await tester.tap(find.text('Get directions'));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Kilimani, Nairobi'), findsOneWidget);
    });

    test('the summary only has a place when both coordinates arrived', () {
      final Map<String, dynamic> body = <String, dynamic>{
        'eventId': 'e1',
        'state': 'NOTIFIED',
        'severity': 'STANDARD',
        'currentTier': 1,
        'triggeredAt': '2026-10-06T10:00:00.000Z',
        'latitude': -1.2,
      };
      expect(AlertSummary.fromJson(body).hasPlace, isFalse);
      expect(AlertSummary.fromJson(<String, dynamic>{...body, 'longitude': 36.8}).hasPlace, isTrue);
    });
  });

  group('history headings', () {
    final DateTime now = DateTime(2026, 10, 6, 15);

    test('today and yesterday are named', () {
      expect(dayHeading(DateTime(2026, 10, 6, 0, 5), now: now), 'Today');
      expect(dayHeading(DateTime(2026, 10, 5, 23, 59), now: now), 'Yesterday');
    });

    test('anything older is a short date', () {
      expect(dayHeading(DateTime(2026, 10, 2, 9), now: now), 'Fri 2 Oct');
    });
  });

  test('every severity has its own shape', () {
    final Set<IconData> shapes = Severity.values.map(SeverityMark.glyph).toSet();
    expect(shapes, hasLength(Severity.values.length));
  });
}
