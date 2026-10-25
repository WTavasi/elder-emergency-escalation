import 'dart:async';
import 'dart:convert';

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
import 'package:mzazicare/core/offline/help_card.dart';
import 'package:mzazicare/core/offline/sms_link.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/elder/alert_controller.dart';
import 'package:mzazicare/features/elder/elder_home_screen.dart';
import 'package:mzazicare/features/elder/offline_help.dart';
import 'package:mzazicare/features/elder/widgets/countdown_ring.dart';
import 'package:mzazicare/features/elder/widgets/panic_button.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import 'support.dart';

/// Asking for help when the phone cannot reach MzaziCare, and the screens around the
/// press: where the button sits, the countdown, and the way out when nothing goes through.
void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues(<String, String>{}));

  // The real faces, so a test of what fits on a phone's screen measures the type the
  // elder will see. The test font draws every letter as a full square, which makes a
  // line of text nearly twice as wide as it really is.
  setUpAll(() async {
    final FontLoader elder = FontLoader(MzaziFont.elder)
      ..addFont(rootBundle.load('assets/fonts/InclusiveSans-Variable.ttf'));
    final FontLoader mono = FontLoader(MzaziFont.mono)
      ..addFont(rootBundle.load('assets/fonts/AtkinsonHyperlegibleMono-Variable.ttf'));
    await Future.wait(<Future<void>>[elder.load(), mono.load()]);
  });

  const Account grace = Account(
    id: 'elder-1',
    name: 'Grace Wanjiru',
    phone: '+254700000010',
    role: Role.elder,
    home: GeoPoint(latitude: -1.286389, longitude: 36.817223, addressLabel: 'Kilimani, Nairobi'),
  );

  Map<String, dynamic> profileBody({bool byText = true}) => <String, dynamic>{
    'memberSince': '2026-09-01T08:00:00.000Z',
    'circles': <dynamic>[],
    'record': null,
    'carers': <Map<String, dynamic>>[
      <String, dynamic>{
        'name': 'Mary Otieno',
        'role': 'CAREGIVER',
        'place': 1,
        'phone': '+254700000020',
      },
      <String, dynamic>{
        'name': 'Peter Wanjiru',
        'role': 'FAMILY_MEMBER',
        'place': 2,
        'phone': '+254700000030',
      },
    ],
    'helpByText': byText ? <String, dynamic>{'number': '12345', 'word': 'HELP'} : null,
  };

  bool isAlertsList(http.Request r) => r.method == 'GET' && r.url.path.endsWith('/alerts');
  bool isRaise(http.Request r) => r.method == 'POST' && r.url.path.endsWith('/alerts');

  group('a press that cannot reach MzaziCare', () {
    test('offers other ways to ask rather than the button again', () async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        throw http.ClientException('No route to host');
      });
      final AlertController alerts = AlertController(api: t.api);

      await alerts.raise();

      expect(alerts.phase, AlertPhase.unreachable);
      // Said by the screen in its own words, not as an error over the button.
      expect(alerts.error, isNull);
      expect(alerts.canRaise, isFalse);
      alerts.dispose();
    });

    test('is sent by itself once the connection comes back, with the chance to stop it', () async {
      bool online = false;
      int raises = 0;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        if (!online) throw http.ClientException('No route to host');
        if (isAlertsList(request)) return <http.Response>[json(<dynamic>[])];
        if (isRaise(request)) raises += 1;
        return <http.Response>[json(emergencyBody())];
      });
      final AlertController alerts = AlertController(
        api: t.api,
        retryInterval: const Duration(milliseconds: 50),
      );

      await alerts.raise();
      expect(alerts.phase, AlertPhase.unreachable);

      online = true;
      await Future<void>.delayed(const Duration(milliseconds: 200));

      expect(alerts.phase, AlertPhase.cancellable);
      expect(raises, 1);
      alerts.dispose();
    });

    test('picks up the alert a HELP text raised, rather than raising a second', () async {
      bool online = false;
      int raises = 0;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        if (!online) throw http.ClientException('No route to host');
        if (isAlertsList(request)) {
          return <http.Response>[
            json(<dynamic>[summaryBody()]),
          ];
        }
        if (isRaise(request)) raises += 1;
        return <http.Response>[json(emergencyBody())];
      });
      final AlertController alerts = AlertController(
        api: t.api,
        retryInterval: const Duration(milliseconds: 50),
      );

      await alerts.raise();
      online = true;
      await Future<void>.delayed(const Duration(milliseconds: 200));

      expect(alerts.phase, AlertPhase.live);
      expect(raises, 0);
      alerts.dispose();
    });

    test('"stop trying" goes back to the button and stops trying', () async {
      int attempts = 0;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        attempts += 1;
        throw http.ClientException('No route to host');
      });
      final AlertController alerts = AlertController(
        api: t.api,
        retryInterval: const Duration(milliseconds: 50),
      );

      await alerts.raise();
      alerts.stopTrying();
      final int after = attempts;
      await Future<void>.delayed(const Duration(milliseconds: 200));

      expect(alerts.phase, AlertPhase.idle);
      expect(alerts.canRaise, isTrue);
      expect(attempts, after);
      alerts.dispose();
    });

    test('a server that answers and refuses ends the trying, with its reason', () async {
      bool online = false;
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        if (!online) throw http.ClientException('No route to host');
        if (isAlertsList(request)) return <http.Response>[json(<dynamic>[])];
        return <http.Response>[
          json(<String, String>{'message': 'Too many requests.'}, 429),
        ];
      });
      final AlertController alerts = AlertController(
        api: t.api,
        retryInterval: const Duration(milliseconds: 50),
      );

      await alerts.raise();
      online = true;
      await Future<void>.delayed(const Duration(milliseconds: 200));

      expect(alerts.phase, AlertPhase.idle);
      expect(alerts.error, 'Too many requests.');
      alerts.dispose();
    });
  });

  group('the text links', () {
    test('Android: numbers in the path, the words as ?body=, spaces as %20', () {
      expect(
        smsLink(
          <String>['+254700000020', '+254700000030'],
          'HELP now',
          platform: TargetPlatform.android,
        ).toString(),
        'sms:+254700000020,+254700000030?body=HELP%20now',
      );
    });

    test('iOS: one number with &body=, several through /open?addresses=', () {
      expect(
        smsLink(<String>['12345'], 'HELP', platform: TargetPlatform.iOS).toString(),
        'sms:12345&body=HELP',
      );
      expect(
        smsLink(
          <String>['+254700000020', '+254700000030'],
          'HELP now',
          platform: TargetPlatform.iOS,
        ).toString(),
        'sms:/open?addresses=+254700000020,+254700000030&body=HELP%20now',
      );
    });
  });

  group('the help card kept on the phone', () {
    const HelpCard card = HelpCard(
      accountId: 'elder-1',
      carers: <Carer>[
        Carer(name: 'Mary Otieno', role: Role.caregiver, place: 1, phone: '+254700000020'),
      ],
      helpByText: HelpByText(number: '12345', word: 'HELP'),
    );

    test('comes back as it was saved', () async {
      final HelpCardStore store = HelpCardStore();
      await store.write(card);

      final HelpCard? read = await store.read('elder-1');

      expect(read?.carers.single.name, 'Mary Otieno');
      expect(read?.carers.single.phone, '+254700000020');
      expect(read?.helpByText?.number, '12345');
    });

    test("is never another person's", () async {
      final HelpCardStore store = HelpCardStore();
      await store.write(card);

      expect(await store.read('elder-2'), isNull);
    });

    test('leaves the phone when the elder signs out', () async {
      final HelpCardStore store = HelpCardStore();
      await store.write(card);
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int i) => <http.Response>[json(<String, dynamic>{})],
      );
      final AuthController auth = AuthController(api: t.api, store: SessionStore());

      await t.api.signOut();
      await Future<void>.delayed(Duration.zero);

      expect(await store.read('elder-1'), isNull);
      auth.dispose();
    });

    test('is there from the phone first, then refreshed from MzaziCare and saved', () async {
      final HelpCardStore store = HelpCardStore();
      await store.write(card);
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int i) => <http.Response>[json(profileBody())],
      );
      final OfflineHelp help = OfflineHelp(api: t.api, account: grace, store: store);
      final List<int> carersSeen = <int>[];
      help.addListener(() => carersSeen.add(help.card?.carers.length ?? 0));

      await help.load();

      // One carer from the phone, then both from the server.
      expect(carersSeen, <int>[1, 2]);
      expect((await store.read('elder-1'))?.carers.length, 2);
      help.dispose();
    });

    test('keeps what the phone had when MzaziCare cannot be reached', () async {
      final HelpCardStore store = HelpCardStore();
      await store.write(card);
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        throw http.ClientException('No route to host');
      });
      final OfflineHelp help = OfflineHelp(api: t.api, account: grace, store: store);

      await help.load();

      expect(help.card?.carers.single.name, 'Mary Otieno');
      help.dispose();
    });

    test('the message to the family says who, why it came this way, and where', () {
      final String message = OfflineHelp.messageFor(grace);
      expect(message, startsWith('HELP. Grace needs help now.'));
      expect(message, contains('could not connect'));
      expect(message, contains('Home: Kilimani, Nairobi.'));
      expect(message, endsWith('Please call Grace.'));
    });
  });

  group('the elder home screen', () {
    Future<AlertController> show(
      WidgetTester tester, {
      required ApiClient api,
      bool withApi = true,
      Duration cancelWindow = const Duration(seconds: 10),
      Duration retryInterval = const Duration(hours: 1),
      List<Uri>? opened,
      Size size = const Size(400, 860),
    }) async {
      FlutterSecureStorage.setMockInitialValues(<String, String>{
        'mzazicare.session': jsonEncode(
          const Session(
            account: grace,
            accessToken: 'access-1',
            refreshToken: 'refresh-1',
          ).toJson(),
        ),
      });
      final AuthController auth = AuthController(api: api, store: SessionStore());
      await auth.restore();
      final AlertController alerts = AlertController(
        api: api,
        cancelWindow: cancelWindow,
        retryInterval: retryInterval,
      );

      await tester.binding.setSurfaceSize(size);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        ChangeNotifierProvider<AuthController>.value(
          value: auth,
          child: ChangeNotifierProvider<AlertController>.value(
            value: alerts,
            child: MaterialApp(
              theme: MzaziTheme.light(AppAudience.elder),
              home: ElderHomeScreen(
                api: withApi ? api : null,
                checkInPoll: null,
                canOpenLink: (Uri uri) async => true,
                openLink: (Uri uri) async {
                  opened?.add(uri);
                  return true;
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return alerts;
    }

    /// Takes the screen down and stops the alert's timers, before the test ends and the
    /// framework looks for any still running.
    Future<void> done(WidgetTester tester, AlertController alerts) async {
      await tester.pumpWidget(const SizedBox());
      alerts.dispose();
    }

    Finder filled(String label) => find.ancestor(
      of: find.text(label),
      matching: find.byWidgetPredicate((Widget w) => w is FilledButton),
    );

    testWidgets('puts the help button in the lower half, under the words that explain it', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi(
        (http.Request request, int i) => <http.Response>[json(<String, dynamic>{})],
      );
      final AlertController alerts = await show(tester, api: t.api, withApi: false);

      final Rect button = tester.getRect(
        find.descendant(of: find.byType(PanicButton), matching: find.byType(InkWell)),
      );
      final Rect words = tester.getRect(find.textContaining('Press the red circle'));

      expect(button.center.dy, greaterThan(860 / 2));
      expect(words.bottom, lessThanOrEqualTo(button.top));
      await done(tester, alerts);
    });

    testWidgets('says it is sending while the press travels, in words', (
      WidgetTester tester,
    ) async {
      final Completer<http.Response> answer = Completer<http.Response>();
      final ApiClient api = ApiClient(
        baseUrl: 'http://api.test/api/v1',
        httpClient: MockClient((http.Request request) => answer.future),
      );
      final AlertController alerts = await show(tester, api: api, withApi: false);

      await tester.tap(find.text('Get\nhelp'));
      await tester.pump();

      expect(find.text('Sending…'), findsOneWidget);
      expect(find.text('Sending your alert…'), findsOneWidget);

      answer.complete(json(emergencyBody()));
      await tester.pump();
      await done(tester, alerts);
    });

    testWidgets(
      'turns yellow for the ten seconds to stop, with a ring and the way out at the bottom',
      (WidgetTester tester) async {
        final ({ApiClient api, List<Exchange> calls}) t = buildApi(
          (http.Request request, int i) => <http.Response>[json(emergencyBody())],
        );
        final AlertController alerts = await show(tester, api: t.api, withApi: false);

        await tester.tap(find.text('Get\nhelp'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));

        final ThemeData theme = Theme.of(tester.element(find.byType(CountdownRing)));
        expect(theme.scaffoldBackgroundColor, MzaziColorsLight.caution);
        expect(find.bySemanticsLabel('10 seconds left to stop this'), findsOneWidget);

        final Rect stop = tester.getRect(filled('I am all right, stop this'));
        expect(stop.center.dy, greaterThan(860 * 0.75));
        await done(tester, alerts);
      },
    );

    testWidgets('with no connection, offers HELP to MzaziCare first, then the family, then calls', (
      WidgetTester tester,
    ) async {
      final List<Uri> opened = <Uri>[];
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        if (isRaise(request)) throw http.ClientException('No route to host');
        if (request.url.path.endsWith('/auth/me/profile')) {
          return <http.Response>[json(profileBody())];
        }
        return <http.Response>[json(<String, dynamic>{})];
      });
      final AlertController alerts = await show(
        tester,
        api: t.api,
        opened: opened,
        size: const Size(393, 760),
      );

      await tester.tap(find.text('Get\nhelp'));
      await tester.pumpAndSettle();

      expect(alerts.phase, AlertPhase.unreachable);
      expect(find.text('No connection'), findsOneWidget);
      expect(find.text('Not sent yet'), findsOneWidget);
      // The address, for telling whoever answers a call.
      expect(find.text('Your address: Kilimani, Nairobi'), findsOneWidget);
      // Everything to press fits on a phone's screen without scrolling: the space a
      // 6.1 inch phone leaves between its status bar and its home bar.
      expect(tester.getRect(find.text('Call 999')).bottom, lessThanOrEqualTo(760));
      expect(filled('Text HELP to MzaziCare'), findsOneWidget);
      expect(find.text('Text my family'), findsOneWidget);
      expect(find.text('Call Mary'), findsOneWidget);
      expect(find.text('Call 999'), findsOneWidget);

      await tester.tap(find.text('Text HELP to MzaziCare'));
      await tester.pump();
      expect(opened.last.toString(), 'sms:12345?body=HELP');

      await tester.tap(find.text('Text my family'));
      await tester.pump();
      expect(opened.last.toString(), startsWith('sms:+254700000020,+254700000030?body=HELP.'));

      await tester.tap(find.text('Call 999'));
      await tester.pump();
      expect(opened.last.toString(), 'tel:999');
      await done(tester, alerts);
    });

    testWidgets('without a shortcode, texting the family is the first thing offered', (
      WidgetTester tester,
    ) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        if (isRaise(request)) throw http.ClientException('No route to host');
        if (request.url.path.endsWith('/auth/me/profile')) {
          return <http.Response>[json(profileBody(byText: false))];
        }
        return <http.Response>[json(<String, dynamic>{})];
      });
      final AlertController alerts = await show(tester, api: t.api);

      await tester.tap(find.text('Get\nhelp'));
      await tester.pumpAndSettle();

      expect(find.textContaining('to MzaziCare'), findsNothing);
      expect(filled('Text my family'), findsOneWidget);
      await done(tester, alerts);
    });

    testWidgets('"stop trying" brings the help button back', (WidgetTester tester) async {
      final ({ApiClient api, List<Exchange> calls}) t = buildApi((http.Request request, int i) {
        if (isRaise(request)) throw http.ClientException('No route to host');
        return <http.Response>[json(<String, dynamic>{})];
      });
      final AlertController alerts = await show(tester, api: t.api);

      await tester.tap(find.text('Get\nhelp'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I am all right, stop trying'));
      await tester.pumpAndSettle();

      expect(find.text('No connection'), findsNothing);
      expect(find.text('Get\nhelp'), findsOneWidget);
      await done(tester, alerts);
    });
  });

  group('the caution theme', () {
    test('puts every text, icon and control in the one ink that reads on yellow', () {
      for (final ThemeData base in <ThemeData>[
        MzaziTheme.light(AppAudience.elder),
        MzaziTheme.dark(AppAudience.elder),
      ]) {
        final ThemeData caution = MzaziTheme.caution(base);
        const Set<WidgetState> none = <WidgetState>{};
        expect(caution.scaffoldBackgroundColor, MzaziColorsLight.caution);
        expect(caution.textTheme.bodyLarge?.color, MzaziColorsLight.onCaution);
        expect(caution.textTheme.headlineLarge?.color, MzaziColorsLight.onCaution);
        expect(
          caution.iconButtonTheme.style?.foregroundColor?.resolve(none),
          MzaziColorsLight.onCaution,
          reason: '${base.brightness}: the icon at the top must not stay light on yellow',
        );
        expect(
          caution.textButtonTheme.style?.foregroundColor?.resolve(none),
          MzaziColorsLight.onCaution,
        );
      }
    });
  });

  group('the panic control in dark mode', () {
    testWidgets('has a brighter red edge, so its outline stands off the page', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: MzaziTheme.dark(AppAudience.elder),
          home: Scaffold(
            body: PanicButton(onPressed: () {}, label: 'Get help'),
          ),
        ),
      );

      final Material circle = tester.widget<Material>(
        find.descendant(of: find.byType(PanicButton), matching: find.byType(Material)),
      );
      final CircleBorder shape = circle.shape! as CircleBorder;
      expect(shape.side.color, MzaziColorsDark.emergencyEdge);
    });
  });
}
