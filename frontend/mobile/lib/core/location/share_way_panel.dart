import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../api/models.dart';
import '../widgets/action_sheet.dart';
import '../widgets/notice.dart';
import 'location_permission.dart';
import 'position_source.dart';
import 'way_there.dart';

/// Sharing your own way there, for whoever is on their way: the person who took the
/// emergency on, or the volunteer going. Whether it is being shared, how long is left,
/// and stopping it; or why it is not, and what to do about that.
class ShareWayPanel extends StatelessWidget {
  const ShareWayPanel({
    required this.way,
    required this.eventId,
    required this.elderFirst,
    this.journey,
    super.key,
  });

  final WayThere way;
  final String eventId;

  /// "Grace", for "About 9 minutes to Grace".
  final String elderFirst;

  /// The last journey the server knew, shown until this phone's first answer arrives.
  final Journey? journey;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: way,
    builder: (BuildContext context, Widget? _) => _build(context),
  );

  Widget _build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String elder = elderFirst;
    final List<Widget> children;

    if (way.isSharingFor(eventId)) {
      final Journey? latest = way.journey ?? journey;
      // The "on the way" blue, not the brand red: sharing is reassurance, not an emergency.
      final Color live = theme.brightness == Brightness.dark
          ? MzaziColorsDark.pillAcknowledgedFg
          : MzaziColorsLight.pillAcknowledgedFg;
      children = <Widget>[
        // A plain status line first, in the on-the-way ink with the location mark, so it is
        // clear at a glance that the phone is sharing right now.
        Row(
          children: <Widget>[
            Icon(Icons.my_location, size: 20, color: live),
            const SizedBox(width: MzaziSpace.s8),
            Text('Sharing your location', style: theme.textTheme.labelLarge?.copyWith(color: live)),
          ],
        ),
        const SizedBox(height: MzaziSpace.s8),
        Text(
          latest == null
              ? 'Finding your location…'
              : '${_capitalised(timeAway(latest.etaSeconds))} to $elder',
          style: theme.textTheme.titleLarge,
        ),
        const SizedBox(height: MzaziSpace.s4),
        Text('Sharing stops when you arrive.', style: theme.textTheme.bodyMedium),
        const SizedBox(height: MzaziSpace.s12),
        // A full button rather than a text link, in the error ink, because stopping
        // takes the time away from somebody waiting for help. It asks first.
        OutlinedButton.icon(
          onPressed: () => unawaited(_confirmStop(context, way, elder)),
          icon: const Icon(Icons.location_off_outlined),
          label: const Text('Stop sharing'),
          style: OutlinedButton.styleFrom(
            foregroundColor: theme.colorScheme.error,
            side: BorderSide(color: theme.colorScheme.error),
          ),
        ),
      ];
    } else if (way.eventId == eventId && way.problem != null) {
      final bool settings =
          way.access == LocationAccess.deniedForever || way.access == LocationAccess.serviceOff;
      children = <Widget>[
        Notice(message: way.problem!, isError: true),
        const SizedBox(height: MzaziSpace.s12),
        // Asks the phone for location when it has not been asked, after saying why. A
        // retry that only checked could never succeed on a phone that was never asked.
        settings
            ? OutlinedButton.icon(
                onPressed: () => unawaited(way.openSettings()),
                icon: const Icon(Icons.settings_outlined),
                label: const Text('Open Settings'),
              )
            : OutlinedButton.icon(
                onPressed: () => unawaited(shareWithPermission(context, way, eventId)),
                icon: const Icon(Icons.my_location),
                label: Text(
                  way.access == LocationAccess.denied ? 'Allow location' : 'Try sharing again',
                ),
              ),
      ];
    } else if (way.enabled) {
      children = <Widget>[
        Text('Your location is not shared.', style: theme.textTheme.bodyMedium),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            onPressed: () => unawaited(shareWithPermission(context, way, eventId)),
            child: const Text('Share live location'),
          ),
        ),
      ];
    } else {
      children = <Widget>[
        Text(
          'Turn on Share live location in Me. $elder will see how far away you are.',
          style: theme.textTheme.bodyMedium,
        ),
      ];
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
  }

  /// Stopping is a choice with a cost to somebody else, so it is said plainly before it
  /// happens. The safe answer is the quiet one and keeps sharing.
  static Future<void> _confirmStop(BuildContext context, WayThere way, String elder) async {
    final bool? stop = await showActionSheet<bool>(
      context,
      title: 'Stop sharing location?',
      message:
          '$elder and the care circle will no longer see where you are. You can share again here.',
      actions: const <SheetAction<bool>>[
        SheetAction<bool>(
          'Stop sharing',
          true,
          icon: Icons.location_off_outlined,
          primary: true,
          destructive: true,
        ),
        SheetAction<bool>('Keep sharing', false, icon: Icons.my_location),
      ],
    );
    if (stop == true) way.stop();
  }

  static String _capitalised(String text) =>
      text.isEmpty ? text : '${text[0].toUpperCase()}${text.substring(1)}';
}
