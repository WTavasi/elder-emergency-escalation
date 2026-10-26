import 'package:flutter/material.dart';

import '../widgets/action_sheet.dart';
import 'position_source.dart';
import 'way_there.dart';

/// Says why MzaziCare wants this phone's location, just before the phone itself asks.
///
/// Apple's guidance for a screen shown before a permission request: say what it is for,
/// offer one way on, labelled "Continue" rather than "Allow" so nobody thinks they have
/// already said yes, and let it be dismissed quickly. Swiping the sheet away is the no.
///
/// Returns whether to go on to the phone's own question.
Future<bool> explainLocation(BuildContext context) async {
  final bool? go = await showActionSheet<bool>(
    context,
    title: 'Share your way there',
    message:
        'MzaziCare uses this phone\'s location only while you are on your way to an '
        'emergency you took on, so the person waiting can see roughly how long you will '
        'be. It stops when you arrive, and where you were is not kept.\n\n'
        'Your phone will ask next. Choose "Allow While Using App".',
    actions: const <SheetAction<bool>>[
      SheetAction<bool>('Continue', true, icon: Icons.my_location, primary: true),
    ],
  );
  return go == true;
}

/// Shares the way there for [eventId], asking for location first if this phone has
/// never been asked. Access refused for good goes to the phone's settings instead,
/// because no question from the app can change it.
Future<void> shareWithPermission(BuildContext context, WayThere way, String eventId) async {
  final LocationAccess now = await way.checkAccess();
  if (now == LocationAccess.denied) {
    if (!context.mounted || !await explainLocation(context)) return;
  }
  await way.shareFor(eventId, ask: true);
}
