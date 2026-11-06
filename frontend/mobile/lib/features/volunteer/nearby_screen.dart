import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/settings_list.dart';
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
                GroupCard(
                  top: 0,
                  children: <Widget>[
                    _Standing(
                      profile: profile,
                      busy: volunteer.busy,
                      onAvailable: (bool on) => unawaited(volunteer.setAvailable(on)),
                      onOpenApplication: onOpenApplication,
                    ),
                  ],
                ),
                if (volunteer.error case final String failure)
                  Padding(
                    padding: EdgeInsets.fromLTRB(
                      MzaziLayout.margin(context),
                      MzaziSpace.s16,
                      MzaziLayout.margin(context),
                      0,
                    ),
                    child: Notice(message: failure, isError: true),
                  ),
                if (going != null)
                  SettingsSection(
                    title: "You're going",
                    children: <Widget>[_CallRow(call: going)],
                  ),
                if (volunteer.waiting.isNotEmpty)
                  SettingsSection(
                    title: 'Needs help now',
                    children: <Widget>[
                      for (final VolunteerCall call in volunteer.waiting) _CallRow(call: call),
                    ],
                  ),
                if (volunteer.earlier.isNotEmpty)
                  SettingsSection(
                    title: 'Earlier',
                    children: <Widget>[
                      for (final VolunteerCall call in volunteer.earlier) _CallRow(call: call),
                    ],
                  ),
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
                  ? 'We may ask you when someone near ${profile.area?.label ?? 'you'} needs help.'
                  : 'Turn this on to get requests.',
            ),
            value: profile.available,
            onChanged: busy ? null : onAvailable,
          ),
        ],
      );
    }

    final String text = switch (profile.status) {
      VolunteerStatus.notApplied =>
        'Tell us what you can do and where. An administrator checks it. '
            "We only ask you once you're approved.",
      VolunteerStatus.pending => "Thanks for applying. We'll text you when it's decided.",
      VolunteerStatus.rejected =>
        'Not approved${_because(profile.reviewNote)}. Edit it and send it again.',
      VolunteerStatus.suspended => 'Paused for now${_because(profile.reviewNote)}.',
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
                    : 'Edit application',
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

/// One call: how far, how urgent, how long ago, and where it stands.
class _CallRow extends StatelessWidget {
  const _CallRow({required this.call});

  final VolunteerCall call;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String headline = call.going
        ? '${call.elder?.name ?? 'Someone'} is waiting for you'
        : 'Someone ${howFarAway(call.distanceMetres, byRoad: call.byRoad)}';

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: groupInset),
      minTileHeight: MzaziSizes.of(context).target,
      title: Text(headline, style: theme.textTheme.titleMedium),
      subtitle: Text(callStanding(call)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (call.severity == Severity.critical && call.open)
            Text(
              'Urgent',
              style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.error),
            ),
          Icon(Icons.chevron_right, color: theme.colorScheme.onSurfaceVariant),
        ],
      ),
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
  if (!call.open) return 'Ended';
  if (call.going) return call.arrivedAt != null ? "You're there" : "You're going";
  if (call.takenByAnother) return 'Another volunteer is going';
  return switch (call.status) {
    VolunteerCallStatus.declined => 'You said no',
    VolunteerCallStatus.withdrawn => 'You cancelled',
    _ => 'Asking now',
  };
}
