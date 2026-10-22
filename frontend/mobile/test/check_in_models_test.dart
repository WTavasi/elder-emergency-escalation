import 'package:flutter_test/flutter_test.dart';
import 'package:mzazicare/core/api/models.dart';
import 'package:mzazicare/features/check_ins/check_in_settings.dart';

import 'support.dart';

void main() {
  group('what raised an alert', () {
    test('a summary and an emergency say when a missed check-in raised it', () {
      final AlertSummary missed = AlertSummary.fromJson(<String, dynamic>{
        ...summaryBody(),
        'trigger': 'MISSED_CHECK_IN',
      });
      expect(missed.fromMissedCheckIn, isTrue);

      final Emergency emergency = Emergency.fromJson(<String, dynamic>{
        ...emergencyBody(),
        'trigger': 'MISSED_CHECK_IN',
      });
      expect(emergency.fromMissedCheckIn, isTrue);
    });

    test('anything else, or nothing at all, is a press of the button', () {
      expect(AlertSummary.fromJson(summaryBody()).trigger, AlertTrigger.panic);
      expect(Emergency.fromJson(emergencyBody()).trigger, AlertTrigger.panic);
      expect(AlertTrigger.parse('SOMETHING_ADDED_LATER'), AlertTrigger.panic);
    });

    test('the timeline carries the trigger and the reason for a withdrawal', () {
      final TimelineEntry raised = TimelineEntry.fromJson(<String, dynamic>{
        'id': 'audit-1',
        'action': 'EVENT_CREATED',
        'secondsFromTrigger': 0,
        'actor': null,
        'detail': <String, dynamic>{'trigger': 'MISSED_CHECK_IN'},
      });
      expect(raised.trigger, AlertTrigger.missedCheckIn);

      final TimelineEntry withdrawn = TimelineEntry.fromJson(<String, dynamic>{
        'id': 'audit-2',
        'action': 'CANCELLED',
        'secondsFromTrigger': 900,
        'actor': <String, dynamic>{'id': 'elder-1', 'name': 'Grace Wanjiru', 'role': 'ELDER'},
        'detail': <String, dynamic>{'reason': 'checked-in-late'},
      });
      expect(withdrawn.reason, 'checked-in-late');
      expect(withdrawn.trigger, isNull);
    });
  });

  group('check-ins', () {
    test('an overview reads the arrangement, who made it, and the last answers', () {
      final CheckInsOverview overview = CheckInsOverview.fromJson(<String, dynamic>{
        'schedule': <String, dynamic>{
          'enabled': true,
          'times': <String>['09:00', '18:00'],
          'graceMinutes': 45,
          'waitingForElder': true,
          'setBy': <String, dynamic>{'id': 'carer-1', 'name': 'Mary Otieno'},
        },
        'recent': <Map<String, dynamic>>[
          checkInBody(status: 'ANSWERED', answeredVia: 'sms'),
          <String, dynamic>{'id': 'broken'},
        ],
        'canEdit': true,
      });

      expect(overview.isOn, isTrue);
      expect(overview.schedule!.timesInWords, '09:00 and 18:00');
      expect(overview.schedule!.waitingForElder, isTrue);
      expect(overview.schedule!.setByName, 'Mary Otieno');
      // A row that cannot be read is left out rather than failing the whole page.
      expect(overview.recent, hasLength(1));
      expect(overview.recent.single.answeredVia, 'sms');
    });

    test('nothing set up reads as off, not as an error', () {
      final CheckInsOverview overview = CheckInsOverview.fromJson(<String, dynamic>{});
      expect(overview.isOn, isFalse);
      expect(overview.schedule, isNull);
      expect(overview.canEdit, isFalse);
    });

    test('three times are listed the way a person would say them', () {
      const CheckInSchedule schedule = CheckInSchedule(
        enabled: true,
        times: <String>['08:00', '13:00', '20:00'],
        graceMinutes: 30,
      );
      expect(schedule.timesInWords, '08:00, 13:00 and 20:00');
    });

    test('the elder is shown only a check-in still inside its time', () {
      final ElderCheckIns waiting = ElderCheckIns.fromJson(<String, dynamic>{
        'checkIn': checkInBody(),
        'waitingForAgreement': null,
      });
      expect(waiting.waiting, isNotNull);

      final ElderCheckIns missed = ElderCheckIns.fromJson(<String, dynamic>{
        'checkIn': checkInBody(status: 'MISSED', eventId: 'event-1'),
      });
      expect(missed.waiting, isNull);
      expect(missed.checkIn!.eventId, 'event-1');
    });

    test('reads every answer the server gives, and treats anything else as nothing', () {
      expect(CheckInAnswer.parse('answered'), CheckInAnswer.answered);
      expect(CheckInAnswer.parse('withdrawn'), CheckInAnswer.withdrawn);
      expect(CheckInAnswer.parse('noted'), CheckInAnswer.noted);
      expect(CheckInAnswer.parse(null), CheckInAnswer.nothing);
    });

    test('one line of history says when and how it was answered', () {
      final DateTime now = DateTime(2026, 10, 22, 12);
      CheckIn at(DateTime due, {String status = 'ANSWERED', String? via, String? answeredAt}) =>
          CheckIn.fromJson(
            checkInBody(
              status: status,
              answeredVia: via,
              dueAt: due.toUtc().toIso8601String(),
              answeredAt: answeredAt,
            ),
          )!;

      expect(
        describeCheckIn(at(DateTime(2026, 10, 22, 9), via: 'app'), now: now),
        'Today 09:00: answered in the app',
      );
      expect(
        describeCheckIn(at(DateTime(2026, 10, 21, 18), via: 'sms'), now: now),
        'Yesterday 18:00: answered by text',
      );
      expect(
        describeCheckIn(at(DateTime(2026, 10, 19, 9), status: 'MISSED'), now: now),
        'Mon 09:00: not answered, the chain was alerted',
      );
      expect(
        describeCheckIn(
          at(
            DateTime(2026, 10, 19, 9),
            status: 'MISSED',
            via: 'app',
            answeredAt: '2026-10-19T07:00:00.000Z',
          ),
          now: now,
        ),
        'Mon 09:00: not answered in time, then answered in the app',
      );
    });
  });
}
