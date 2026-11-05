import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/medical/medical_id_screen.dart';
import 'package:mzazicare/features/responder/alert_detail_controller.dart';
import 'package:mzazicare/features/responder/alert_detail_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

const List<Map<String, String>> _flags = <Map<String, String>>[
  <String, String>{'flag': 'HEART', 'label': 'Heart condition'},
  <String, String>{'flag': 'BLOOD_THINNERS', 'label': 'Takes blood thinners'},
  <String, String>{'flag': 'HARD_OF_HEARING', 'label': 'Hard of hearing'},
];

Map<String, dynamic> _page({
  bool consent = true,
  bool byElder = true,
  Map<String, dynamic>? details,
}) => <String, dynamic>{
  'elderId': 'elder-1',
  'elderName': 'Grace Wanjiru',
  'enabled': true,
  'consent': <String, dynamic>{'active': consent, 'byElder': byElder},
  'details': details,
  'age': details == null ? null : 80,
  'updatedAt': details == null ? null : '2026-11-05T08:00:00.000Z',
  'updatedBy': details == null
      ? null
      : <String, dynamic>{'id': 'caregiver-1', 'name': 'Mary Otieno', 'role': 'CAREGIVER'},
  'canEdit': consent,
  'options': <String, dynamic>{
    'flags': _flags,
    'bloodTypes': <String>['A+', 'O+'],
  },
  'changes': <dynamic>[],
  'views': <dynamic>[
    <String, dynamic>{
      'by': <String, dynamic>{'id': 'family-1', 'name': 'Aisha Wanjiru', 'role': 'FAMILY_MEMBER'},
      'eventId': 'event-1',
      'at': '2026-11-05T09:00:00.000Z',
    },
  ],
};

const Map<String, dynamic> _grace = <String, dynamic>{
  'dateOfBirth': '1946-05-02',
  'bloodType': 'O+',
  'flags': <String>['BLOOD_THINNERS', 'HARD_OF_HEARING'],
  'medications': 'Warfarin 5 mg each evening.',
  'allergies': 'Penicillin: rash.',
  'doctorName': 'Dr. A. Kamau',
  'doctorPhone': '+254700000090',
};

Widget _app(Widget home) => MaterialApp(theme: MzaziTheme.light(AppAudience.standard), home: home);

void main() {
  group('the medical details page', () {
    testWidgets('shows a caregiver what is kept, who sees it and who has looked', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(_page(details: _grace))],
      );
      await tester.binding.setSurfaceSize(const Size(800, 2600));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        _app(MedicalIdScreen(api: t.api, elderId: 'elder-1', forElder: false)),
      );
      await tester.pumpAndSettle();

      expect(find.text('80 years old · Blood type O+'), findsOneWidget);
      expect(find.text('Takes blood thinners'), findsOneWidget);
      expect(find.text('Warfarin 5 mg each evening.'), findsOneWidget);
      expect(find.text('Call Dr. A. Kamau'), findsOneWidget);
      expect(find.text('Only when we ask them to help Grace'), findsOneWidget);

      await tester.tap(find.text('Who has looked'));
      await tester.pumpAndSettle();
      expect(find.text('Aisha Wanjiru'), findsOneWidget);
      expect(find.textContaining('during an emergency'), findsOneWidget);
    });

    testWidgets('keeps nothing until somebody agrees, then opens the form', (
      WidgetTester tester,
    ) async {
      final List<String> asked = <String>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        asked.add('${request.method} ${request.url.path}');
        if (request.url.path.endsWith('/consent/grant')) {
          expect(jsonDecode(request.body), <String, dynamic>{'type': 'MEDICAL_PROFILE'});
          return <http.Response>[
            json(<String, dynamic>{'elderId': 'elder-1', 'items': <dynamic>[]}),
          ];
        }
        final bool agreed = asked.any((String a) => a.endsWith('/consent/grant'));
        return <http.Response>[json(_page(consent: agreed, byElder: false))];
      });
      await tester.binding.setSurfaceSize(const Size(800, 2600));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        _app(MedicalIdScreen(api: t.api, elderId: 'elder-1', forElder: false)),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Add medical details'));
      await tester.pumpAndSettle();
      expect(find.text('Keep medical details for Grace?'), findsOneWidget);
      await tester.tap(find.text('Agree'));
      await tester.pumpAndSettle();

      expect(asked, contains('POST /api/v1/elders/elder-1/consent/grant'));
      expect(find.text('Edit medical details'), findsOneWidget);
    });

    testWidgets('saves the ticks and words as a whole', (WidgetTester tester) async {
      Map<String, dynamic>? sent;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int _) {
        if (request.method == 'PUT') {
          sent = jsonDecode(request.body) as Map<String, dynamic>;
          return <http.Response>[json(_page(details: sent))];
        }
        return <http.Response>[
          json(_page(details: <String, dynamic>{'bloodType': 'O+'})),
        ];
      });
      await tester.binding.setSurfaceSize(const Size(800, 3200));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        _app(MedicalIdScreen(api: t.api, elderId: 'elder-1', forElder: true)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit medical details'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Heart condition'));
      await tester.enterText(
        find.widgetWithText(TextField, 'Medicines, with how much and when'),
        '  Aspirin daily ',
      );
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(sent?['flags'], <String>['HEART']);
      expect(sent?['medications'], 'Aspirin daily');
      expect(sent?['bloodType'], 'O+');
      expect(sent?['allergies'], isNull);
      // Back on the page, showing what was saved.
      expect(find.text('Aspirin daily'), findsOneWidget);
    });
  });

  group('on an alert', () {
    late AlertDetailController controller;

    Future<List<String>> open(WidgetTester tester, Map<String, dynamic> medical) async {
      final List<String> asked = <String>[];
      final MockClient transport = MockClient((http.Request request) async {
        asked.add('${request.method} ${request.url.path} ${request.body}');
        if (request.url.path.endsWith('/medical')) return json(medical);
        if (request.method == 'POST') return json(emergencyBody());
        return json(<String, dynamic>{...detailBody(), 'reportedType': 'FALL'});
      });
      final ApiClient api = ApiClient(baseUrl: 'http://api.test/api/v1', httpClient: transport);
      controller = AlertDetailController(api: api, eventId: 'event-1', myRole: Role.familyMember);
      await tester.binding.setSurfaceSize(const Size(800, 2600));
      addTearDown(() => tester.binding.setSurfaceSize(null));

      await tester.pumpWidget(
        ChangeNotifierProvider<AlertDetailController>.value(
          value: controller,
          child: _app(AlertDetailScreen(fallback: AlertSummary.fromJson(summaryBody()))),
        ),
      );
      await tester.pumpAndSettle();
      return asked;
    }

    testWidgets('says when the history makes it more serious, and offers the ambulance', (
      WidgetTester tester,
    ) async {
      final List<String> asked = await open(tester, <String, dynamic>{
        'status': 'shown',
        'details': _grace,
        'age': 80,
        'highlights': <dynamic>[
          <String, dynamic>{
            'flag': 'BLOOD_THINNERS',
            'label': 'Takes blood thinners',
            'why': 'A fall can bleed inside. A doctor should see them.',
            'serious': true,
          },
          <String, dynamic>{
            'flag': 'HARD_OF_HEARING',
            'label': 'Hard of hearing',
            'why': null,
            'serious': false,
          },
        ],
        'serious': true,
        'askFor': 'AMBULANCE',
      });

      expect(find.text("Grace's health makes this more serious."), findsOneWidget);
      expect(find.text('A fall can bleed inside. A doctor should see them.'), findsOneWidget);
      expect(find.text('Also: Hard of hearing.'), findsOneWidget);
      expect(find.text('Penicillin: rash.'), findsOneWidget);
      expect(find.text('Grace can see that you looked.'), findsOneWidget);
      // Asked once when the screen opened, not on every refresh.
      expect(asked.where((String a) => a.contains('/medical')), hasLength(1));

      await tester.tap(find.text('Ask for an ambulance').first);
      await tester.pumpAndSettle();
      expect(
        asked,
        contains('POST /api/v1/alerts/event-1/request-responder {"service":"AMBULANCE"}'),
      );
      controller.dispose();
    });

    testWidgets('says plainly when it is not theirs to see yet', (WidgetTester tester) async {
      await open(tester, <String, dynamic>{
        'status': 'not-asked',
        'details': null,
        'highlights': <dynamic>[],
        'serious': false,
        'askFor': null,
      });

      expect(find.text("You'll see medical details once we ask you to help."), findsOneWidget);
      expect(find.text("Grace's health makes this more serious."), findsNothing);
      controller.dispose();
    });
  });
}
