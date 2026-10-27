import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../widgets/action_sheet.dart';
import 'auth_controller.dart';

/// Asks before signing out of this phone, and signs out if the person says so.
///
/// One sheet for every account, so signing out looks and works the same whoever is
/// holding the phone. [message] says what signing out costs this person, which differs:
/// an elder's phone can no longer ask for help, and anybody else's is no longer told
/// about emergencies.
Future<void> confirmSignOut(BuildContext context, {required String message}) async {
  final NavigatorState navigator = Navigator.of(context);
  final AuthController auth = context.read<AuthController>();
  final bool? sure = await showActionSheet<bool>(
    context,
    title: 'Sign out of this phone?',
    message: message,
    actions: const <SheetAction<bool>>[
      SheetAction<bool>('Sign out', true, icon: Icons.logout, destructive: true),
      SheetAction<bool>('Stay signed in', false, icon: Icons.close),
    ],
  );
  if (sure != true) return;

  // Every page on top is closed first, then the account signed out, so nothing is left
  // above the sign-in screen.
  navigator.popUntil((Route<dynamic> route) => route.isFirst);
  await auth.signOut();
}
