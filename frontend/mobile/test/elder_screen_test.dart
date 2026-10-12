import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/elders/elder_screen.dart';

import 'support.dart';

Map<String, dynamic> elderBody({bool canEdit = true, bool atHome = true}) => <String, dynamic>{
  'id': 'elder-1',
  'name': 'Grace Wanjiru',
  'phone': '+254700000010',
  'careLevel': 'ASSISTED',
  'home': <String, dynamic>{'latitude': -1.2833, 'longitude': 36.7833, 'label': 'Kilimani, Nairobi'},
  'place': <String, dynamic>{
    'elderId': 'elder-1',
    'isAtHome': atHome,
    'latitude': atHome ? null : -1.3125,
    'longitude': atHome ? null : 36.8269,
    'label': atHome ? null : 'South B, Nairobi',
  },
  'canEdit': canEdit,
};

Map<String, dynamic> chainBody({bool canEdit = true, bool withFamily = true}) => <String, dynamic>{
  'elderId': 'elder-1',
  'elderName': 'Grace Wanjiru',
  'canEdit': canEdit,
  'entries': <Map<String, dynamic>>[
    <String, dynamic>{
      'id': 'assignment-1',
      'tier': 1,
      'name': 'Mary Otieno',
      'phone': '+254700000020',
      'role': 'CAREGIVER',
      'status': 'member',
      'removable': false,
    },
    if (withFamily)
      <String, dynamic>{
        'id': 'assignment-2',
        'tier': 2,
        'name': 'Aisha Otieno',
        'phone': '+254700000030',
        'role': 'FAMILY_MEMBER',
        'status': 'member',
        'removable': canEdit,
      },
  ],
};

void main() {
  Future<List<Exchange>> pump(
    WidgetTester tester, {
    bool canEdit = true,
    bool atHome = true,
  }) async {
    bool removed = false;
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      final String path = request.url.path;
      if (request.method == 'DELETE' && path.contains('/chain/')) {
        removed = true;
        return <http.Response>[json(chainBody(withFamily: false))];
      }
      if (path.endsWith('/chain')) {
        return <http.Response>[json(chainBody(canEdit: canEdit, withFamily: !removed))];
      }
      return <http.Response>[json(elderBody(canEdit: canEdit, atHome: atHome))];
    });

    await tester.binding.setSurfaceSize(const Size(800, 2400));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: MzaziTheme.light(AppAudience.standard),
        home: ElderScreen(api: t.api, elderId: 'elder-1', elderName: 'Grace Wanjiru'),
      ),
    );
    await tester.pumpAndSettle();
    return t.calls;
  }

  testWidgets('shows where she is, her home, her care level and her chain', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    expect(find.text('At home'), findsOneWidget);
    expect(find.text('Kilimani, Nairobi'), findsOneWidget);
    expect(find.text('Needs some help'), findsOneWidget);
    expect(find.text('Mary Otieno'), findsOneWidget);
    expect(find.text('Aisha Otieno'), findsOneWidget);
    expect(find.text('They are staying somewhere else'), findsOneWidget);
  });

  testWidgets('offers "back home" while a stay is recorded', (WidgetTester tester) async {
    await pump(tester, atHome: false);

    expect(find.text('Staying at South B, Nairobi'), findsOneWidget);
    expect(find.text('They are back home'), findsOneWidget);
  });

  testWidgets('a family member sees the details but cannot change them', (
    WidgetTester tester,
  ) async {
    await pump(tester, canEdit: false);

    expect(find.text('Change their home'), findsNothing);
    expect(find.text('Add a family member'), findsNothing);
    expect(find.byIcon(Icons.person_remove_outlined), findsNothing);
    // Anybody in the chain may still say where she is staying.
    expect(find.text('They are staying somewhere else'), findsOneWidget);
  });

  testWidgets('removing somebody asks first, then takes them out', (WidgetTester tester) async {
    final List<Exchange> calls = await pump(tester);

    // Only the family member can be removed; the caregiver's own place has no button.
    expect(find.byIcon(Icons.person_remove_outlined), findsOneWidget);
    await tester.tap(find.byIcon(Icons.person_remove_outlined));
    await tester.pumpAndSettle();
    expect(find.text('Remove Aisha Otieno?'), findsOneWidget);

    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();

    expect(
      calls.any((Exchange c) => c.method == 'DELETE' && c.path == '/api/v1/elders/elder-1/chain/assignment-2'),
      isTrue,
    );
    expect(find.text('Aisha Otieno'), findsNothing);
  });

  testWidgets('keeping them sends nothing', (WidgetTester tester) async {
    final List<Exchange> calls = await pump(tester);

    await tester.tap(find.byIcon(Icons.person_remove_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep them'));
    await tester.pumpAndSettle();

    expect(calls.any((Exchange c) => c.method == 'DELETE'), isFalse);
  });
}
