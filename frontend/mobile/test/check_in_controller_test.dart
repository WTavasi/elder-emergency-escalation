import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mzazicare/core/api/api_client.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/core/live/live_updates.dart';
import 'package:mzazicare/features/elder/check_in_controller.dart';

import 'support.dart';

/// A server with one check-in waiting until it is answered.
class _Server {
  _Server({this.fails = false}) {
    final ({ApiClient api, List<Exchange> calls}) t = buildApi(_answer);
    api = t.api;
    calls = t.calls;
  }

  final bool fails;
  late final ApiClient api;
  late final List<Exchange> calls;
  final List<Map<String, dynamic>> bodies = <Map<String, dynamic>>[];
  bool answered = false;
  Map<String, dynamic>? agreement = checkInScheduleBody(waitingForElder: true);

  List<http.Response> _answer(http.Request request, int _) {
    if (fails) return <http.Response>[json(<String, dynamic>{'message': 'down'}, 503)];
    if (request.body.isNotEmpty) bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
    final String path = request.url.path;
    if (path.endsWith('/check-ins/answer')) {
      answered = true;
      return <http.Response>[json(<String, dynamic>{'outcome': 'answered'})];
    }
    if (path.endsWith('/check-ins/confirm')) {
      agreement = null;
      return <http.Response>[json(_mine())];
    }
    return <http.Response>[json(_mine())];
  }

  Map<String, dynamic> _mine() => <String, dynamic>{
    'checkIn': answered ? null : checkInBody(),
    'waitingForAgreement': agreement,
  };

  int asked(String ending) => calls.where((Exchange c) => c.path.endsWith(ending)).length;
}

void main() {
  test('finds the check-in waiting and the set-up to agree to', () async {
    final _Server server = _Server();
    final CheckInController controller = CheckInController(
      api: server.api,
      elderId: 'elder-1',
      pollInterval: null,
    );

    await controller.refresh();

    expect(controller.mine.waiting, isNotNull);
    expect(controller.mine.waitingForAgreement?.setByName, 'Mary Otieno');
    controller.dispose();
  });

  test('answering says thank you, and the next look clears it', () async {
    final _Server server = _Server();
    final CheckInController controller = CheckInController(
      api: server.api,
      elderId: 'elder-1',
      pollInterval: null,
    );
    await controller.refresh();

    await expectLater(controller.answerNow(), completion(CheckInAnswer.answered));

    expect(server.asked('/check-ins/answer'), 1);
    expect(controller.answer, CheckInAnswer.answered);
    expect(controller.mine.waiting, isNull);
    expect(controller.busy, isFalse);

    await controller.refresh(clearThanks: true);
    expect(controller.answer, isNull);
    controller.dispose();
  });

  test('says yes to a set-up for the elder, and the question goes', () async {
    final _Server server = _Server();
    final CheckInController controller = CheckInController(
      api: server.api,
      elderId: 'elder-1',
      pollInterval: null,
    );
    await controller.refresh();

    await controller.agree(yes: true);

    expect(server.asked('/elders/elder-1/check-ins/confirm'), 1);
    expect(server.bodies.last, <String, dynamic>{'agree': true});
    expect(controller.mine.waitingForAgreement, isNull);
    controller.dispose();
  });

  test('a server that cannot be reached changes nothing and throws nothing', () async {
    final _Server server = _Server(fails: true);
    final CheckInController controller = CheckInController(
      api: server.api,
      elderId: 'elder-1',
      pollInterval: null,
    );

    await controller.refresh();
    expect(controller.mine.checkIn, isNull);

    await expectLater(controller.answerNow(), completion(isNull));
    expect(controller.error, isNotNull);
    expect(controller.busy, isFalse);
    controller.dispose();
  });

  test('a check-in push makes it look straight away', () async {
    final _Server server = _Server();
    final LiveUpdates live = LiveUpdates();
    final CheckInController controller = CheckInController(
      api: server.api,
      elderId: 'elder-1',
      live: live,
      pollInterval: null,
    )..start();
    await Future<void>.delayed(Duration.zero);
    final int before = server.asked('/check-ins/mine');

    live.checkInAsked();
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);

    expect(server.asked('/check-ins/mine'), before + 1);
    controller.dispose();
    live.dispose();
  });
}
