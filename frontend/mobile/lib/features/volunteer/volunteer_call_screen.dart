import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/widgets/fade_swap.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/platform_alert.dart';
import '../../core/widgets/swipe_to_confirm.dart';
import '../responder/widgets/call_button.dart';
import '../responder/widgets/directions_button.dart';
import 'nearby_screen.dart';
import 'volunteer_controller.dart';

/// One emergency a volunteer was asked about.
///
/// Before they answer: how far, how urgent, how long ago, and nothing about who or
/// where. Once they say they will go: the name, the address, directions and a call
/// button, and "I'm here" when they arrive. When it is over, all of that goes again.
class VolunteerCallScreen extends StatefulWidget {
  const VolunteerCallScreen({required this.eventId, super.key});

  final String eventId;

  @override
  State<VolunteerCallScreen> createState() => _VolunteerCallScreenState();
}

class _VolunteerCallScreenState extends State<VolunteerCallScreen> {
  @override
  void initState() {
    super.initState();
    unawaited(context.read<VolunteerController>().refreshCall(widget.eventId));
  }

  Future<void> _withdraw(VolunteerController volunteer) async {
    final bool? sure = await showPlatformAlert<bool>(
      context,
      title: 'You can no longer go?',
      content: const Text(
        'The other volunteers nearby will be asked again. If you can, call to say so.',
      ),
      actions: const <AlertAction<bool>>[
        AlertAction<bool>('I am still going', false),
        AlertAction<bool>('I cannot go', true, destructive: true),
      ],
    );
    if (sure == true && mounted) {
      await volunteer.answer(widget.eventId, VolunteerAnswer.withdraw);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final VolunteerController volunteer = context.watch<VolunteerController>();
    final VolunteerCall? call = volunteer.call(widget.eventId);

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: call == null
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.fromLTRB(
                  MzaziSpace.s16,
                  0,
                  MzaziSpace.s16,
                  MzaziSpace.s32,
                ),
                children: <Widget>[
                  Semantics(
                    header: true,
                    child: Text(_headline(call), style: theme.textTheme.headlineLarge),
                  ),
                  const SizedBox(height: MzaziSpace.s8),
                  Text(callStanding(call), style: theme.textTheme.bodyLarge),
                  if (volunteer.error case final String failure) ...<Widget>[
                    const SizedBox(height: MzaziSpace.s16),
                    Notice(message: failure, isError: true),
                  ],
                  const SizedBox(height: MzaziSpace.s24),
                  ..._body(context, volunteer, call),
                ],
              ),
      ),
    );
  }

  String _headline(VolunteerCall call) {
    final VolunteerCallElder? elder = call.elder;
    if (elder != null) {
      return call.arrivedAt != null ? 'You are with ${_first(elder.name)}' : elder.name;
    }
    if (!call.open) return 'This emergency is over';
    return '${call.severity == Severity.critical ? 'Urgent: someone' : 'Someone'} '
        '${roughDistance(call.distanceMetres)} away needs help';
  }

  List<Widget> _body(BuildContext context, VolunteerController volunteer, VolunteerCall call) {
    final ThemeData theme = Theme.of(context);
    final VolunteerCallElder? elder = call.elder;

    if (!call.open) {
      return <Widget>[
        Text('Thank you for being ready to help.', style: theme.textTheme.bodyLarge),
      ];
    }

    if (call.going && elder != null) {
      final String first = _first(elder.name);
      return <Widget>[
        if (elder.addressLabel case final String address) ...<Widget>[
          Text(address, style: theme.textTheme.titleMedium),
          const SizedBox(height: MzaziSpace.s16),
        ],
        DirectionsButton(
          latitude: elder.latitude,
          longitude: elder.longitude,
          addressLabel: elder.addressLabel,
        ),
        const SizedBox(height: MzaziSpace.s12),
        CallButton(name: first, phone: elder.phone),
        const SizedBox(height: MzaziSpace.s16),
        Text(
          call.circleOwner == null
              ? '$first\'s family has been told you are going. They are still being asked too.'
              : '${call.circleOwner} from $first\'s family is also on the way.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: MzaziSpace.s24),
        // The swipe fades and folds away once it lands, rather than vanishing.
        FadeSwap(
          child: call.arrivedAt == null
              ? Column(
                  key: const ValueKey<String>('going'),
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    SwipeToConfirm(
                      label: 'Swipe when you are with $first',
                      enabled: !volunteer.busy,
                      onConfirmed: () =>
                          unawaited(volunteer.answer(widget.eventId, VolunteerAnswer.arrived)),
                    ),
                    const SizedBox(height: MzaziSpace.s16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: volunteer.busy ? null : () => unawaited(_withdraw(volunteer)),
                        child: const Text('I can no longer go'),
                      ),
                    ),
                  ],
                )
              : Text(
                  'Their family can see you are there. Stay until someone from the family or the '
                  'emergency services takes over, if you can.',
                  key: const ValueKey<String>('arrived'),
                  style: theme.textTheme.bodyLarge,
                ),
        ),
      ];
    }

    if (call.takenByAnother) {
      return <Widget>[
        Text(
          'Another volunteer is on the way. Thank you for being ready.',
          style: theme.textTheme.bodyLarge,
        ),
      ];
    }

    return <Widget>[
      Text(
        'An older person needs help. If you say you will go, you are told who they are, '
        'where, and their number, and their family is told you are coming.',
        style: theme.textTheme.bodyLarge,
      ),
      const SizedBox(height: MzaziSpace.s24),
      SizedBox(
        height: MzaziA11y.standardMinTouchTarget,
        child: FilledButton(
          onPressed: volunteer.busy
              ? null
              : () => unawaited(volunteer.answer(widget.eventId, VolunteerAnswer.accept)),
          child: const Text('I can go'),
        ),
      ),
      if (call.status != VolunteerCallStatus.declined) ...<Widget>[
        const SizedBox(height: MzaziSpace.s12),
        SizedBox(
          height: MzaziA11y.standardMinTouchTarget,
          child: OutlinedButton(
            onPressed: volunteer.busy
                ? null
                : () => unawaited(volunteer.answer(widget.eventId, VolunteerAnswer.decline)),
            child: const Text('I cannot go'),
          ),
        ),
      ],
    ];
  }

  static String _first(String name) => name.trim().split(RegExp(r'\s+')).first;
}
