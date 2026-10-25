import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/section_label.dart';
import 'volunteer_call_screen.dart';
import 'volunteer_controller.dart';

/// Who near the volunteer needs help, and the switch that says whether to ask them.
class NearbyScreen extends StatelessWidget {
  const NearbyScreen({required this.onOpenApplication, super.key});

  /// Takes the volunteer to their application, when there is none yet.
  final VoidCallback onOpenApplication;

  @override
  Widget build(BuildContext context) {
    final VolunteerController volunteer = context.watch<VolunteerController>();
    final VolunteerProfile profile = volunteer.profile;
    final VolunteerCall? going = volunteer.going;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: volunteer.load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: MzaziSpace.s24),
            children: <Widget>[
              const PageTitle('Nearby'),
              if (volunteer.loading)
                const Padding(
                  padding: EdgeInsets.all(MzaziSpace.s32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else ...<Widget>[
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s16),
                  child: _Standing(
                    profile: profile,
                    busy: volunteer.busy,
                    onAvailable: (bool on) => unawaited(volunteer.setAvailable(on)),
                    onOpenApplication: onOpenApplication,
                  ),
                ),
                if (volunteer.error case final String failure)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      MzaziSpace.s16,
                      MzaziSpace.s16,
                      MzaziSpace.s16,
                      0,
                    ),
                    child: Notice(message: failure, isError: true),
                  ),
                if (going != null) ...<Widget>[
                  const _Heading('You are going'),
                  _CallRow(call: going),
                ],
                if (volunteer.waiting.isNotEmpty) ...<Widget>[
                  const _Heading('Asking for help'),
                  for (final VolunteerCall call in volunteer.waiting) _CallRow(call: call),
                ],
                if (volunteer.earlier.isNotEmpty) ...<Widget>[
                  const _Heading('Earlier'),
                  for (final VolunteerCall call in volunteer.earlier) _CallRow(call: call),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Where the application stands, and once approved, whether they can be asked now.
class _Standing extends StatelessWidget {
  const _Standing({
    required this.profile,
    required this.busy,
    required this.onAvailable,
    required this.onOpenApplication,
  });

  final VolunteerProfile profile;
  final bool busy;
  final ValueChanged<bool> onAvailable;
  final VoidCallback onOpenApplication;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    if (profile.approved) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: Text('Available to help', style: theme.textTheme.titleMedium),
            subtitle: Text(
              profile.available
                  ? 'You can be asked when someone near ${profile.area?.label ?? 'you'} needs help.'
                  : 'Nobody will ask you until you turn this on.',
            ),
            value: profile.available,
            onChanged: busy ? null : onAvailable,
          ),
        ],
      );
    }

    final String text = switch (profile.status) {
      VolunteerStatus.notApplied =>
        'Tell us what you can do and where, and an administrator will look at it. Nobody '
            'asks you anything until you are approved.',
      VolunteerStatus.pending =>
        'Thank you for applying. An administrator will look at it and you will get a text '
            'when it is decided.',
      VolunteerStatus.rejected =>
        'Your application was not approved${_because(profile.reviewNote)}. You can change '
            'it and send it again.',
      VolunteerStatus.suspended =>
        'You will not be asked to help for now${_because(profile.reviewNote)}.',
      VolunteerStatus.approved => '',
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(text, style: theme.textTheme.bodyLarge),
        if (profile.status == VolunteerStatus.notApplied ||
            profile.status == VolunteerStatus.rejected) ...<Widget>[
          const SizedBox(height: MzaziSpace.s12),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(
              onPressed: onOpenApplication,
              child: Text(
                profile.status == VolunteerStatus.notApplied
                    ? 'Apply to volunteer'
                    : 'Change my application',
              ),
            ),
          ),
        ],
      ],
    );
  }

  static String _because(String? note) =>
      note == null || note.trim().isEmpty ? '' : ': ${note.trim()}';
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(MzaziSpace.s16, MzaziSpace.s24, MzaziSpace.s16, 0),
    child: SectionLabel(text),
  );
}

/// One call: how far, how urgent, how long ago, and where it stands.
class _CallRow extends StatelessWidget {
  const _CallRow({required this.call});

  final VolunteerCall call;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String headline = call.going
        ? '${call.elder?.name ?? 'Someone'} is waiting for you'
        : 'Someone ${roughDistance(call.distanceMetres)} away';

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s16),
      minTileHeight: MzaziA11y.standardMinTouchTarget,
      title: Text(headline, style: theme.textTheme.titleMedium),
      subtitle: Text(callStanding(call)),
      trailing: call.severity == Severity.critical && call.open
          ? Text('Urgent', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.error))
          : null,
      onTap: () => unawaited(
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => ChangeNotifierProvider<VolunteerController>.value(
              value: context.read<VolunteerController>(),
              child: VolunteerCallScreen(eventId: call.eventId),
            ),
          ),
        ),
      ),
    );
  }
}

/// Where one call stands, in a few words.
String callStanding(VolunteerCall call) {
  if (!call.open) return 'Over';
  if (call.going) return call.arrivedAt != null ? 'You are there' : 'You said you would go';
  if (call.takenByAnother) return 'Another volunteer is going';
  return switch (call.status) {
    VolunteerCallStatus.declined => 'You said you cannot go',
    VolunteerCallStatus.withdrawn => 'You could not go after all',
    _ => 'Asking now',
  };
}
