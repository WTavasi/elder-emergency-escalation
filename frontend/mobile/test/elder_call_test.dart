import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/theme/theme.dart';
import 'package:mzazicare/features/elder/widgets/elder_call.dart';

import 'support.dart';

/// The elder's side of talking through the app.
void main() {
  Emergency emergency({String? startedBy = 'Mary', bool available = true}) =>
      Emergency.fromJson(<String, dynamic>{
        ...emergencyBody(
          state: 'ACKNOWLEDGED',
          acknowledgedBy: <String, dynamic>{'id': 'c1', 'name': 'Mary Otieno', 'role': 'CAREGIVER'},
        ),
        'voice': <String, dynamic>{
          'available': available,
          'startedBy': startedBy,
          'startedAt': startedBy == null ? null : '2026-10-21T10:00:00.000Z',
        },
      });

  Future<({FakeVoiceRoom room, List<Exchange> calls})> show(
    WidgetTester tester,
    Emergency value,
  ) async {
    final FakeVoiceRoom room = FakeVoiceRoom();
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(
      (http.Request request, int _) => <http.Response>[json(voiceAccessBody())],
    );
    await tester.binding.setSurfaceSize(const Size(420, 900));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await tester.pumpWidget(
      MaterialApp(
        theme: MzaziTheme.light(AppAudience.elder),
        home: Scaffold(
          body: ElderCall(emergency: value, api: t.api, room: () => room),
        ),
      ),
    );
    return (room: room, calls: t.calls);
  }

  testWidgets('says who is joining, then joins on the speaker by itself', (
    WidgetTester tester,
  ) async {
    final ({FakeVoiceRoom room, List<Exchange> calls}) t = await show(tester, emergency());

    expect(find.text('Mary is joining to talk to you'), findsOneWidget);
    expect(t.calls, isEmpty);

    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump();

    expect(t.calls.single.path, '/api/v1/alerts/event-1/voice');
    expect(t.room.microphone, isTrue);
    expect(t.room.speaker, isTrue);
    expect(find.text('Talking with Mary'), findsOneWidget);
    expect(find.text('End call'), findsOneWidget);

    // Leaving the screen, which happens when the emergency closes, hangs up.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    expect(t.room.left, isTrue);
  });

  testWidgets('"Not now" stops it, and joining is still one press away', (
    WidgetTester tester,
  ) async {
    final ({FakeVoiceRoom room, List<Exchange> calls}) t = await show(tester, emergency());

    await tester.tap(find.text('Not now'));
    await tester.pump(const Duration(seconds: 5));

    expect(t.calls, isEmpty);
    expect(find.text('Talk to Mary'), findsOneWidget);

    await tester.tap(find.text('Talk to Mary'));
    await tester.pump();
    await tester.pump();
    expect(t.calls, hasLength(1));
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('ending the call hangs up and offers to talk again', (WidgetTester tester) async {
    final ({FakeVoiceRoom room, List<Exchange> calls}) t = await show(tester, emergency());
    await tester.pump(const Duration(seconds: 3));
    await tester.pump();

    await tester.tap(find.text('End call'));
    await tester.pump();

    expect(t.room.left, isTrue);
    expect(find.text('Talk to Mary'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('nothing happens until somebody starts a call', (WidgetTester tester) async {
    final ({FakeVoiceRoom room, List<Exchange> calls}) t = await show(
      tester,
      emergency(startedBy: null),
    );
    await tester.pump(const Duration(seconds: 5));

    expect(t.calls, isEmpty);
    expect(find.textContaining('joining'), findsNothing);
    expect(find.text('Mary Otieno is coming'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
