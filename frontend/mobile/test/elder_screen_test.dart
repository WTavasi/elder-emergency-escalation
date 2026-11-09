import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/elders/elder_screen.dart';

import 'support.dart';

Map<String, dynamic> elderBody({bool canEdit = true, bool atHome = true, bool withheld = false}) =>
    <String, dynamic>{
      'id': 'elder-1',
      'name': 'Grace Wanjiru',
      'phone': withheld ? null : '+254700000010',
      'withheld': withheld ? <String>['phone', 'location'] : <String>[],
      'careLevel': 'ASSISTED',
      'home': <String, dynamic>{
        'latitude': -1.2833,
        'longitude': 36.7833,
        'label': 'Kilimani, Nairobi',
      },
      'place': <String, dynamic>{
        'elderId': 'elder-1',
        'withheld': withheld,
        'isAtHome': atHome,
        'latitude': atHome ? null : -1.3125,
        'longitude': atHome ? null : 36.8269,
        'label': atHome ? null : 'South B, Nairobi',
      },
      'canEdit': canEdit,
    };

Map<String, dynamic> chainBody({
  bool canEdit = true,
  bool withFamily = true,
  bool twoFamily = false,
  bool aishaFirst = false,
}) => <String, dynamic>{
  'elderId': 'elder-1',
  'elderName': 'Grace Wanjiru',
  'canEdit': canEdit,
  'canReorder': canEdit,
  'personTiers': <int>[1, 2],
  'entries': <Map<String, dynamic>>[
    <String, dynamic>{
      'id': 'assignment-1',
      'tier': 1,
      'name': 'Mary Otieno',
      'phone': '+254700000020',
      'role': 'CAREGIVER',
      'status': 'member',
      'removable': false,
      'movable': canEdit,
    },
    if (withFamily)
      <String, dynamic>{
        'id': 'assignment-2',
        'tier': aishaFirst ? 1 : 2,
        'name': 'Aisha Otieno',
        'phone': '+254700000030',
        'role': 'FAMILY_MEMBER',
        'status': 'member',
        'removable': canEdit,
        'movable': canEdit,
      },
    if (twoFamily)
      <String, dynamic>{
        'id': 'assignment-3',
        'tier': 2,
        'name': 'Brian Otieno',
        'phone': '+254700000032',
        'role': 'FAMILY_MEMBER',
        'status': 'member',
        'removable': canEdit,
        'movable': canEdit,
      },
  ],
};

String? sentOrder;

void main() {
  Future<List<Exchange>> pump(
    WidgetTester tester, {
    bool canEdit = true,
    bool atHome = true,
    bool withheld = false,
    bool twoFamily = false,
  }) async {
    bool removed = false;
    bool reordered = false;
    final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
      final String path = request.url.path;
      if (request.method == 'PUT' && path.endsWith('/chain/order')) {
        sentOrder = request.body;
        reordered = true;
        return <http.Response>[json(chainBody(aishaFirst: true))];
      }
      if (request.method == 'DELETE' && path.contains('/chain/')) {
        removed = true;
        return <http.Response>[json(chainBody(withFamily: false))];
      }
      if (path.endsWith('/sign-in-code')) {
        return <http.Response>[
          json(<String, dynamic>{'code': '482913', 'expiresInSeconds': 600}),
        ];
      }
      if (path.endsWith('/chain')) {
        return <http.Response>[
          json(
            chainBody(
              canEdit: canEdit,
              withFamily: !removed,
              twoFamily: twoFamily,
              aishaFirst: reordered,
            ),
          ),
        ];
      }
      return <http.Response>[json(elderBody(canEdit: canEdit, atHome: atHome, withheld: withheld))];
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

  testWidgets("her caregiver can sign her phone in with a code to type into it", (
    WidgetTester tester,
  ) async {
    final List<Exchange> calls = await pump(tester);

    await tester.tap(find.text("Sign in Grace's phone"));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(calls.last.method, 'POST');
    expect(calls.last.path, '/api/v1/elders/elder-1/sign-in-code');
    expect(find.text('482 913'), findsOneWidget);
    expect(find.textContaining('Expires in 10:00'), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    expect(find.textContaining('Expires in 9:58'), findsOneWidget);
  });

  testWidgets('nobody else in the circle is offered it', (WidgetTester tester) async {
    await pump(tester, canEdit: false);
    expect(find.text("Sign in Grace's phone"), findsNothing);
  });

  testWidgets('shows where she is, her home, her care level and her chain', (
    WidgetTester tester,
  ) async {
    await pump(tester);

    expect(find.text('At home'), findsOneWidget);
    expect(find.text('Kilimani, Nairobi'), findsOneWidget);
    expect(find.text('Needs some help'), findsOneWidget);
    expect(find.text('Mary Otieno'), findsOneWidget);
    expect(find.text('Aisha Otieno'), findsOneWidget);
    expect(find.text("They're away from home"), findsOneWidget);
  });

  testWidgets('says the family are asked together when there is more than one', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pump(tester, twoFamily: true);

    expect(find.text('Aisha Otieno'), findsOneWidget);
    expect(find.text('Brian Otieno'), findsOneWidget);
    expect(find.text('Family · asked together'), findsNWidgets(2));
    // Both at the same place in the order, so both carry the same number.
    expect(find.bySemanticsLabel(RegExp('Group 2')), findsNWidgets(2));
    // The caregiver, alone in theirs, is not.
    expect(find.text('Caregiver'), findsOneWidget);
    semantics.dispose();
  });

  testWidgets('one family member is simply family', (WidgetTester tester) async {
    await pump(tester);

    expect(find.text('Family'), findsOneWidget);
    expect(find.text('Family · asked together'), findsNothing);
  });

  testWidgets('offers "back home" while a stay is recorded', (WidgetTester tester) async {
    await pump(tester, atHome: false);

    expect(find.text('Staying at South B, Nairobi'), findsOneWidget);
    expect(find.text('Mark as back home'), findsOneWidget);
  });

  testWidgets('a family member sees the details but cannot change them', (
    WidgetTester tester,
  ) async {
    await pump(tester, canEdit: false);

    expect(find.text('Change home'), findsNothing);
    expect(find.text('Add a family member'), findsNothing);
    expect(find.byIcon(Icons.person_remove_outlined), findsNothing);
    // Anybody in the chain may still say where she is staying.
    expect(find.text("They're away from home"), findsOneWidget);
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
      calls.any(
        (Exchange c) =>
            c.method == 'DELETE' && c.path == '/api/v1/elders/elder-1/chain/assignment-2',
      ),
      isTrue,
    );
    expect(find.text('Aisha Otieno'), findsNothing);
  });

  testWidgets('a caregiver can move family up to be asked first, saved at once', (
    WidgetTester tester,
  ) async {
    sentOrder = null;
    await pump(tester);

    await tester.tap(find.text('Change who is asked first'));
    await tester.pumpAndSettle();
    expect(find.text('Who is asked first'), findsOneWidget);
    expect(find.text('ASKED FIRST'), findsOneWidget);
    expect(find.text('ASKED NEXT'), findsOneWidget);

    // Nothing to save until something moves.
    expect(
      tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Save order')).onPressed,
      isNull,
    );
    await tester.tap(find.bySemanticsLabel('Ask first: Aisha Otieno'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save order'));
    await tester.pumpAndSettle();

    expect(sentOrder, contains('"id":"assignment-2","tier":1'));
    expect(sentOrder, contains('"id":"assignment-1","tier":1'));
    // Back on her page, Aisha is now in group 1 beside Mary.
    expect(find.text('Who is asked first'), findsNothing);
    expect(find.text('1'), findsNWidgets(2));
    expect(find.text('2'), findsNothing);
  });

  testWidgets('a family member is not offered it', (WidgetTester tester) async {
    await pump(tester, canEdit: false);
    expect(find.text('Change who is asked first'), findsNothing);
  });

  testWidgets('keeping them sends nothing', (WidgetTester tester) async {
    final List<Exchange> calls = await pump(tester);

    await tester.tap(find.byIcon(Icons.person_remove_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep'));
    await tester.pumpAndSettle();

    expect(calls.any((Exchange c) => c.method == 'DELETE'), isFalse);
  });

  testWidgets('says plainly what she has chosen not to share, rather than leaving gaps', (
    WidgetTester tester,
  ) async {
    await pump(tester, withheld: true);

    expect(find.text('Number hidden at their request'), findsOneWidget);
    expect(find.byIcon(Icons.phone), findsNothing);
    expect(find.text('Hidden at their request'), findsNWidgets(2));
    expect(find.text('Change home'), findsNothing);
    expect(find.text("They're away from home"), findsNothing);
    expect(find.text('Privacy and consent'), findsOneWidget);
  });
}
