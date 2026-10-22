import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/consent/consent_screen.dart';
import 'package:mzazicare/features/elder/widgets/help_progress.dart';
import 'package:mzazicare/features/responder/alert_detail_controller.dart';
import 'package:mzazicare/features/responder/alert_detail_screen.dart';
import 'package:mzazicare/features/volunteer/nearby_screen.dart';
import 'package:mzazicare/features/volunteer/volunteer_call_screen.dart';
import 'package:mzazicare/features/volunteer/volunteer_controller.dart';
import 'package:mzazicare/features/volunteer/volunteering_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

Map<String, dynamic> profileBody({
  String status = 'APPROVED',
  bool available = false,
  bool withArea = true,
}) => <String, dynamic>{
  'status': status,
  'training': <String>['FIRST_AID'],
  'note': null,
  'area': withArea
      ? <String, dynamic>{'label': 'Kileleshwa, Nairobi', 'latitude': -1.28, 'longitude': 36.78}
      : null,
  'radiusKm': withArea ? 1 : null,
  'available': available,
  'appliedAt': '2026-10-20T09:00:00.000Z',
  'reviewNote': null,
};

Map<String, dynamic> callBody({String status = 'ASKED', bool accepted = false, bool open = true}) =>
    <String, dynamic>{
      'eventId': 'event-1',
      'status': status,
      'askedAt': '2026-10-23T09:00:01.000Z',
      'distanceMetres': 300,
      'severity': 'CRITICAL',
      'raisedAt': '2026-10-23T09:00:00.000Z',
      'open': open,
      'takenByAnother': false,
      'elder': accepted && open
          ? <String, dynamic>{
              'name': 'Grace Wanjiru',
              'phone': '+254700000010',
              'addressLabel': 'Kileleshwa, Nairobi',
              'latitude': -1.2833,
              'longitude': 36.7833,
            }
          : null,
      'circleOwner': null,
      'acceptedAt': accepted ? '2026-10-23T09:02:00.000Z' : null,
      'arrivedAt': null,
    };

/// The volunteer routes, answering from what has happened so far.
class _Server {
  _Server({Map<String, dynamic>? profile, this.calls = const <Map<String, dynamic>>[], this.taken = false})
    : profile = profile ?? profileBody() {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(_answer);
    api = t.api;
    exchanges = t.calls;
  }

  Map<String, dynamic> profile;
  List<Map<String, dynamic>> calls;

  /// Somebody else accepted first.
  final bool taken;
  late final ApiClient api;
  late final List<Exchange> exchanges;
  final List<Map<String, dynamic>> sent = <Map<String, dynamic>>[];

  List<http.Response> _answer(http.Request request, int _) {
    final String path = request.url.path;
    if (request.body.isNotEmpty) sent.add(jsonDecode(request.body) as Map<String, dynamic>);
    if (path.endsWith('/volunteer/me/availability')) {
      profile = <String, dynamic>{...profile, 'available': sent.last['available']};
      return <http.Response>[json(profile)];
    }
    if (path.endsWith('/volunteer/me')) {
      if (request.method == 'PUT') profile = profileBody(status: 'PENDING');
      return <http.Response>[json(profile)];
    }
    if (path.endsWith('/accept')) {
      if (taken) {
        return <http.Response>[
          json(<String, dynamic>{'message': 'Another volunteer is already going. Thank you.'}, 409),
        ];
      }
      calls = <Map<String, dynamic>>[callBody(status: 'ACCEPTED', accepted: true)];
      return <http.Response>[json(calls.first)];
    }
    if (path.endsWith('/decline')) {
      calls = <Map<String, dynamic>>[callBody(status: 'DECLINED')];
      return <http.Response>[json(calls.first)];
    }
    if (path.endsWith('/volunteer/calls/event-1')) {
      return <http.Response>[json(calls.isEmpty ? callBody() : calls.first)];
    }
    if (path.endsWith('/volunteer/calls')) return <http.Response>[json(calls)];
    if (path.endsWith('/consent/grant')) {
      return <http.Response>[
        json(<String, dynamic>{
          'elderId': 'elder-1',
          'elderName': 'Grace Wanjiru',
          'needsConfirmation': true,
          'canWithdraw': true,
          'items': <Map<String, dynamic>>[
            <String, dynamic>{'type': 'COMMUNITY_HELP', 'active': true, 'givenAt': '2026-10-23T09:00:00.000Z'},
          ],
        }),
      ];
    }
    return <http.Response>[json(<String, dynamic>{})];
  }

  int asked(String method, String ending) =>
      exchanges.where((Exchange c) => c.method == method && c.path.endsWith(ending)).length;
}

Widget _withVolunteer(VolunteerController controller, Widget child) =>
    ChangeNotifierProvider<VolunteerController>.value(
      value: controller,
      child: MaterialApp(theme: MzaziTheme.light(AppAudience.standard), home: child),
    );

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  group('models', () {
    test('the volunteer role is read, and never takes an emergency on', () {
      expect(Role.parse('COMMUNITY_RESPONDER'), Role.communityResponder);
      expect(Role.communityResponder.responds, isFalse);
      expect(Role.communityResponder.wire, 'COMMUNITY_RESPONDER');
    });

    test('help from volunteers is a consent the app knows', () {
      expect(ConsentKind.parse('COMMUNITY_HELP'), ConsentKind.communityHelp);
    });

    test('a call says how far, and who only once accepted', () {
      final VolunteerCall asked = VolunteerCall.fromJson(callBody())!;
      expect(asked.waiting, isTrue);
      expect(asked.elder, isNull);
      expect(roughDistance(asked.distanceMetres), 'about 300 m');

      final VolunteerCall going = VolunteerCall.fromJson(callBody(status: 'ACCEPTED', accepted: true))!;
      expect(going.going, isTrue);
      expect(going.elder?.name, 'Grace Wanjiru');
    });

    test('distances are rounded, never exact', () {
      expect(roughDistance(287), 'about 300 m');
      expect(roughDistance(1240), 'about 1.2 km');
      expect(roughDistance(2000), 'about 2 km');
    });

    test('an application is read, and none reads as not applied', () {
      final VolunteerProfile profile = VolunteerProfile.fromJson(profileBody(status: 'PENDING'));
      expect(profile.status, VolunteerStatus.pending);
      expect(profile.training, <VolunteerTraining>[VolunteerTraining.firstAid]);
      expect(profile.area?.label, 'Kileleshwa, Nairobi');
      expect(VolunteerProfile.fromJson(<String, dynamic>{}).status, VolunteerStatus.notApplied);
    });

    test('an emergency carries the volunteer going', () {
      final Emergency emergency = Emergency.fromJson(<String, dynamic>{
        ...emergencyBody(),
        'volunteer': <String, dynamic>{'asked': 3, 'name': 'Joseph', 'acceptedAt': '2026-10-23T09:02:00.000Z'},
      });
      expect(emergency.volunteer?.going, isTrue);
      expect(emergency.volunteer?.phone, isNull);
    });
  });

  group('the controller', () {
    test('loads the application and the calls, and answers', () async {
      final _Server server = _Server(calls: <Map<String, dynamic>>[callBody()]);
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null);

      await controller.load();
      expect(controller.profile.approved, isTrue);
      expect(controller.waiting, hasLength(1));

      await expectLater(controller.answer('event-1', VolunteerAnswer.accept), completion(isTrue));
      expect(controller.going?.elder?.name, 'Grace Wanjiru');
      expect(controller.waiting, isEmpty);
      controller.dispose();
    });

    test('somebody else going first is shown, not lost', () async {
      final _Server server = _Server(calls: <Map<String, dynamic>>[callBody()], taken: true);
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null);
      await controller.load();

      await expectLater(controller.answer('event-1', VolunteerAnswer.accept), completion(isFalse));
      expect(controller.error, contains('Another volunteer'));
      controller.dispose();
    });
  });

  group('the nearby screen', () {
    testWidgets('before applying, says what happens and leads to the application', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server(profile: profileBody(status: 'NOT_APPLIED', withArea: false));
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null)
        ..start();
      bool opened = false;

      await tester.pumpWidget(
        _withVolunteer(controller, NearbyScreen(onOpenApplication: () => opened = true)),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Nobody asks you anything until you are approved'), findsOneWidget);
      await tester.tap(find.text('Apply to volunteer'));
      expect(opened, isTrue);
      // Nothing to list, so nothing was asked for.
      expect(server.asked('GET', '/volunteer/calls'), 0);
    });

    testWidgets('once approved, the switch says whether they can be asked', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server(calls: <Map<String, dynamic>>[callBody()]);
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null)
        ..start();

      await tester.pumpWidget(_withVolunteer(controller, NearbyScreen(onOpenApplication: () {})));
      await tester.pumpAndSettle();

      expect(find.text('Someone about 300 m away'), findsOneWidget);
      expect(find.text('Urgent'), findsOneWidget);
      expect(find.text('Nobody will ask you until you turn this on.'), findsOneWidget);

      await tester.tap(find.byType(Switch));
      await tester.pumpAndSettle();

      expect(server.sent.last, <String, dynamic>{'available': true});
      expect(find.textContaining('You can be asked when someone near Kileleshwa'), findsOneWidget);
    });
  });

  group('a call', () {
    testWidgets('says nothing of who or where until they say they will go', (
      WidgetTester tester,
    ) async {
      final _Server server = _Server(calls: <Map<String, dynamic>>[callBody()]);
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null);
      await controller.load();

      await tester.binding.setSurfaceSize(const Size(800, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        _withVolunteer(controller, const VolunteerCallScreen(eventId: 'event-1')),
      );
      await tester.pumpAndSettle();

      expect(find.text('Urgent: someone about 300 m away needs help'), findsOneWidget);
      expect(find.textContaining('Grace'), findsNothing);
      expect(find.textContaining('Kileleshwa'), findsNothing);

      await tester.tap(find.text('I can go'));
      await tester.pumpAndSettle();

      expect(server.asked('POST', '/volunteer/calls/event-1/accept'), 1);
      expect(find.text('Grace Wanjiru'), findsOneWidget);
      expect(find.text('Kileleshwa, Nairobi'), findsOneWidget);
      expect(find.text('Get directions'), findsOneWidget);
      expect(find.text('Swipe when you are with Grace'), findsOneWidget);
      expect(find.text('I can no longer go'), findsOneWidget);
    });

    testWidgets('a volunteer who cannot go says so in one press', (WidgetTester tester) async {
      final _Server server = _Server(calls: <Map<String, dynamic>>[callBody()]);
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null);
      await controller.load();

      await tester.pumpWidget(
        _withVolunteer(controller, const VolunteerCallScreen(eventId: 'event-1')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('I cannot go'));
      await tester.pumpAndSettle();

      expect(server.asked('POST', '/volunteer/calls/event-1/decline'), 1);
      expect(find.text('You said you cannot go'), findsOneWidget);
      // Changing their mind is still possible while nobody else has gone.
      expect(find.text('I can go'), findsOneWidget);
    });

    testWidgets('when it is over, nothing about the elder is left', (WidgetTester tester) async {
      final _Server server = _Server(
        calls: <Map<String, dynamic>>[callBody(status: 'ACCEPTED', accepted: true, open: false)],
      );
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null);
      await controller.load();

      await tester.pumpWidget(
        _withVolunteer(controller, const VolunteerCallScreen(eventId: 'event-1')),
      );
      await tester.pumpAndSettle();

      expect(find.text('This emergency is over'), findsOneWidget);
      expect(find.textContaining('Grace'), findsNothing);
    });
  });

  group('the application', () {
    testWidgets('says what is missing rather than sending half of it', (WidgetTester tester) async {
      final _Server server = _Server(profile: profileBody(status: 'NOT_APPLIED', withArea: false));
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null);
      await controller.load();

      await tester.binding.setSurfaceSize(const Size(800, 2000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(_withVolunteer(controller, VolunteeringScreen(api: server.api)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Send my application'));
      await tester.pumpAndSettle();

      expect(find.text('Choose at least one.'), findsOneWidget);
      expect(server.asked('PUT', '/volunteer/me'), 0);
    });

    testWidgets('sends what they can do, where and how far', (WidgetTester tester) async {
      final _Server server = _Server(profile: profileBody(status: 'REJECTED'));
      final VolunteerController controller = VolunteerController(api: server.api, pollInterval: null);
      await controller.load();

      await tester.binding.setSurfaceSize(const Size(800, 2000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(_withVolunteer(controller, VolunteeringScreen(api: server.api)));
      await tester.pumpAndSettle();

      await tester.tap(find.text('CPR'));
      await tester.pump();
      await tester.tap(find.text('Send it again'));
      await tester.pumpAndSettle();

      final Map<String, dynamic> body = server.sent.last;
      expect(body['training'], <String>['FIRST_AID', 'CPR']);
      expect(body['area'], <String, dynamic>{
        'label': 'Kileleshwa, Nairobi',
        'latitude': -1.28,
        'longitude': 36.78,
      });
      expect(body['radiusKm'], 1.0);
      expect(find.text('Saved.'), findsOneWidget);
    });
  });

  group('for the elder and their circle', () {
    testWidgets('a caregiver can agree to volunteers for the elder', (WidgetTester tester) async {
      final _Server server = _Server();
      const ConsentView view = ConsentView(
        elderId: 'elder-1',
        elderName: 'Grace Wanjiru',
        needsConfirmation: false,
        canWithdraw: true,
        items: <ConsentItem>[ConsentItem(kind: ConsentKind.communityHelp, active: false)],
      );

      await tester.binding.setSurfaceSize(const Size(800, 1600));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.light(AppAudience.standard),
          home: ConsentScreen(
            api: server.api,
            elderId: 'elder-1',
            audience: ConsentAudience.careCircle,
            initial: view,
          ),
        ),
      );

      expect(find.text('Not agreed'), findsOneWidget);
      await tester.tap(find.text('Agree for Grace'));
      await tester.pumpAndSettle();
      expect(find.text('Let nearby volunteers help Grace?'), findsOneWidget);
      await tester.tap(find.text('Agree'));
      await tester.pumpAndSettle();

      expect(server.asked('POST', '/elders/elder-1/consent/grant'), 1);
      expect(server.sent.last, <String, dynamic>{'type': 'COMMUNITY_HELP'});
    });

    testWidgets('the elder is told the volunteer coming, by first name', (WidgetTester tester) async {
      final Emergency emergency = Emergency.fromJson(<String, dynamic>{
        ...emergencyBody(),
        'volunteer': <String, dynamic>{'asked': 2, 'name': 'Joseph', 'acceptedAt': '2026-10-23T09:02:00.000Z'},
      });

      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.light(AppAudience.elder),
          home: Scaffold(body: HelpProgress(emergency: emergency)),
        ),
      );

      expect(find.text('Joseph is coming'), findsOneWidget);
      expect(find.textContaining('a volunteer who lives near you'), findsOneWidget);
    });

    testWidgets('the circle sees the volunteer and can ring them', (WidgetTester tester) async {
      final Map<String, dynamic> body = <String, dynamic>{
        ...detailBody(),
        'volunteer': <String, dynamic>{
          'asked': 3,
          'name': 'Joseph Kamau',
          'phone': '+254711000001',
          'distanceMetres': 300,
          'acceptedAt': '2026-10-23T09:02:00.000Z',
          'arrivedAt': null,
        },
      };
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int _) => <http.Response>[json(body)],
      );
      final AlertDetailController controller = AlertDetailController(api: t.api, eventId: 'event-1');

      await tester.binding.setSurfaceSize(const Size(800, 2400));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ChangeNotifierProvider<AlertDetailController>.value(
          value: controller,
          child: MaterialApp(
            theme: MzaziTheme.light(AppAudience.standard),
            home: AlertDetailScreen(fallback: AlertSummary.fromJson(summaryBody())),
          ),
        ),
      );
      await controller.refresh();
      await tester.pumpAndSettle();

      expect(
        find.text('Joseph Kamau, a vetted community volunteer about 300 m away, is on the way.'),
        findsOneWidget,
      );
      expect(find.text('Call Joseph'), findsOneWidget);
      controller.dispose();
    });
  });
}
