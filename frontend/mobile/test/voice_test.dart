import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/auth/auth_controller.dart';
import 'package:mzazicare/core/auth/session_store.dart';
import 'package:mzazicare/core/quick_help/quick_help.dart';
import 'package:mzazicare/core/speech/speech_recorder.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/elder/alert_controller.dart';
import 'package:mzazicare/features/elder/elder_home_screen.dart';
import 'package:mzazicare/features/elder/widgets/help_progress.dart';
import 'package:mzazicare/features/responder/alert_detail_controller.dart';
import 'package:mzazicare/features/responder/alert_detail_screen.dart';
import 'package:provider/provider.dart';

import 'support.dart';

const Account grace = Account(
  id: 'elder-1',
  name: 'Grace Wanjiru',
  phone: '+254700000010',
  role: Role.elder,
  home: GeoPoint(latitude: -1.286389, longitude: 36.817223, addressLabel: 'Kilimani, Nairobi'),
);

/// A microphone that "records" to a real temporary file.
class FakeRecorder implements SpeechRecorder {
  String? path;
  bool started = false;

  @override
  Future<bool> start() async {
    started = true;
    final File file = File(
      '${Directory.systemTemp.path}/voice-test-${DateTime.now().microsecondsSinceEpoch}.m4a',
    );
    await file.writeAsBytes(<int>[1, 2, 3]);
    path = file.path;
    return true;
  }

  @override
  Future<String?> stop() async => path;

  @override
  Future<void> cancel() async {}

  @override
  void dispose() {}
}

void main() {
  const MethodChannel channel = MethodChannel('ke.ac.strathmore.mzazicare/quick_help');

  group('help from Siri, the widget or the tile', () {
    test('reads only the sources and types it knows', () {
      expect(
        QuickHelpRequest.fromMap(<Object?, Object?>{'from': 'siri', 'type': 'FIRE'})?.type,
        EmergencyType.fire,
      );
      expect(QuickHelpRequest.fromMap(<Object?, Object?>{'from': 'tile'})?.type, isNull);
      expect(QuickHelpRequest.fromMap(<Object?, Object?>{'from': 'alexa'}), isNull);
      expect(QuickHelpRequest.fromMap(null), isNull);
    });

    testWidgets('"MzaziCare help fire" raises the alert with Fire said', (
      WidgetTester tester,
    ) async {
      Map<String, dynamic>? raisedWith;
      bool taken = false;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
        MethodCall call,
      ) async {
        if (call.method != 'takePending' || taken) return null;
        taken = true;
        return <String, String>{'from': 'siri', 'type': 'FIRE'};
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null),
      );

      final ApiClient api = ApiClient(
        baseUrl: 'http://api.test/api/v1',
        httpClient: MockClient((http.Request request) async {
          final String path = request.url.path;
          if (request.method == 'POST' && path.endsWith('/alerts')) {
            raisedWith = jsonDecode(request.body) as Map<String, dynamic>;
            return json(<String, dynamic>{...emergencyBody(), 'reportedType': 'FIRE'});
          }
          if (path.endsWith('/alerts')) return json(<dynamic>[]);
          if (path.endsWith('/speech')) {
            return json(<String, dynamic>{'available': false, 'consented': false});
          }
          return json(<String, dynamic>{'message': 'Not here'}, 404);
        }),
      );
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'mzazicare.session': jsonEncode(
          const Session(account: grace, accessToken: 'a', refreshToken: 'r').toJson(),
        ),
      });
      final AuthController auth = AuthController(api: api, store: SessionStore());
      await auth.restore();
      final AlertController alerts = AlertController(api: api);

      await tester.binding.setSurfaceSize(const Size(400, 860));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ChangeNotifierProvider<AuthController>.value(
          value: auth,
          child: ChangeNotifierProvider<AlertController>.value(
            value: alerts,
            child: MaterialApp(
              theme: MzaziTheme.light(AppAudience.elder),
              home: ElderHomeScreen(api: api, checkInPoll: null, quickHelp: QuickHelp()),
            ),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(raisedWith, <String, dynamic>{'type': 'FIRE', 'from': 'siri'});
      // The same countdown as the button, so a mistake can still be stopped.
      expect(alerts.phase, AlertPhase.cancellable);

      await tester.pumpWidget(const SizedBox());
      alerts.dispose();
    });
  });

  group('saying it out loud', () {
    test('sends the recording, keeps what was heard, and deletes the file', () async {
      String? sentTo;
      String? contentType;
      final ApiClient api = ApiClient(
        baseUrl: 'http://api.test/api/v1',
        httpClient: MockClient((http.Request request) async {
          if (request.url.path.endsWith('/speech')) {
            sentTo = request.url.path;
            contentType = request.headers['content-type'];
            return json(<String, dynamic>{
              'at': '2026-11-05T10:00:00.000Z',
              'transcript': 'Msaada! Kuna moto jikoni',
              'english': 'Help! There is a fire in the kitchen',
              'language': 'sw',
              'heardType': 'FIRE',
              'applied': true,
            });
          }
          if (request.method == 'POST') return json(emergencyBody());
          return json(<String, dynamic>{...emergencyBody(), 'reportedType': 'FIRE'});
        }),
      );
      final AlertController alerts = AlertController(
        api: api,
        cancelWindow: Duration.zero,
        pollInterval: const Duration(hours: 1),
      );
      await alerts.raise();
      final FakeRecorder recorder = FakeRecorder();
      await recorder.start();

      await alerts.speak(recorder.path!);

      expect(sentTo, '/api/v1/alerts/event-1/speech');
      expect(contentType, startsWith('multipart/form-data'));
      expect(alerts.heard?.transcript, 'Msaada! Kuna moto jikoni');
      expect(alerts.emergency?.reportedType, EmergencyType.fire);
      expect(File(recorder.path!).existsSync(), isFalse);
      alerts.dispose();
    });

    testWidgets('is offered beside the choices, and shows what was heard', (
      WidgetTester tester,
    ) async {
      int spoke = 0;
      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.light(AppAudience.elder),
          home: Scaffold(
            body: WhatsHappening(
              reported: null,
              busy: false,
              onReport: (EmergencyType _) async {},
              onSpeak: () async => spoke += 1,
              heard: SpeechHeard(at: DateTime(2026), transcript: 'Nimeanguka jikoni'),
            ),
          ),
        ),
      );

      expect(find.text('You said: “Nimeanguka jikoni”'), findsOneWidget);
      await tester.tap(find.text('Say it out loud'));
      expect(spoke, 1);
    });

    testWidgets('is not offered without consent or a speech server', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: WhatsHappening(reported: null, busy: false, onReport: (EmergencyType _) async {}),
          ),
        ),
      );
      expect(find.text('Say it out loud'), findsNothing);
    });
  });

  testWidgets('the family reads what was said, in English too, and how it was raised', (
    WidgetTester tester,
  ) async {
    final Map<String, dynamic> body = <String, dynamic>{
      ...detailBody(),
      'reportedType': 'FIRE',
      'speech': <dynamic>[
        <String, dynamic>{
          'at': '2026-09-16T10:00:20.000Z',
          'transcript': 'Msaada! Kuna moto jikoni',
          'english': 'Help! There is a fire in the kitchen',
          'language': 'sw',
          'heardType': 'FIRE',
          'applied': false,
        },
      ],
    };
    (body['timeline'] as List<dynamic>).add(<String, dynamic>{
      'id': 'audit-siri',
      'action': 'TYPE_REPORTED',
      'previousState': null,
      'newState': null,
      'actor': <String, dynamic>{'id': 'elder-1', 'name': 'Grace Wanjiru', 'role': 'ELDER'},
      'detail': <String, dynamic>{'type': 'FIRE', 'via': 'siri'},
      'occurredAt': '2026-09-16T10:00:01.000Z',
      'secondsFromTrigger': 1,
    });
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[
        request.url.path.endsWith('/medical')
            ? json(<String, dynamic>{'status': 'none', 'highlights': <dynamic>[]})
            : json(body),
      ],
    );
    final AlertDetailController controller = AlertDetailController(
      api: t.api,
      eventId: 'event-1',
      pollInterval: const Duration(hours: 1),
    );
    await tester.binding.setSurfaceSize(const Size(800, 2600));
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
    await tester.pumpAndSettle();

    expect(find.text('WHAT GRACE SAID'), findsOneWidget);
    expect(find.text('“Msaada! Kuna moto jikoni”'), findsOneWidget);
    expect(find.text('In English: Help! There is a fire in the kitchen'), findsOneWidget);
    expect(find.text('Grace Wanjiru said: fire, to Siri'), findsOneWidget);
    controller.dispose();
  });
}
