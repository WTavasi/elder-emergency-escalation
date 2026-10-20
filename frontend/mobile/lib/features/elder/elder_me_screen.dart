import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../consent/consent_screen.dart';

/// The elder's own page: who this phone belongs to, their privacy, and signing out.
///
/// Signing out used to sit in the corner of the elder's home screen, next to the panic
/// control. For an elder it is almost never wanted and it is costly when pressed by
/// mistake: the phone can no longer ask for help, and getting back in needs a password
/// somebody else may have set up. So it moved here, one step away, at the bottom where
/// the thumb reaches it, and behind a question. The session itself no longer expires
/// for an elder, so nothing pushes them out either.
class ElderMeScreen extends StatelessWidget {
  const ElderMeScreen({required this.api, super.key});

  final ApiClient api;

  Future<void> _openConsent(BuildContext context, AuthController auth, Account account) async {
    final NavigatorState navigator = Navigator.of(context);
    await navigator.push(
      MaterialPageRoute<bool>(
        builder: (_) => ConsentScreen(
          api: api,
          elderId: account.id,
          audience: ConsentAudience.elder,
          // The consent page closes itself first; this page goes too, so nothing is
          // left on top of the sign-in screen.
          onServiceEnded: () {
            navigator.popUntil((Route<dynamic> route) => route.isFirst);
            unawaited(auth.signOut());
          },
        ),
      ),
    );
  }

  Future<void> _signOut(BuildContext context, AuthController auth) async {
    final NavigatorState navigator = Navigator.of(context);
    final bool? sure = await showDialog<bool>(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog(
        title: const Text('Sign out of this phone?'),
        content: const Text(
          'While you are signed out, this phone cannot ask for help. To sign back in you '
          'will need your phone number and password.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Stay signed in'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (sure != true) return;

    // Closed first, then signed out, for the same reason as above.
    navigator.popUntil((Route<dynamic> route) => route.isFirst);
    await auth.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AuthController auth = context.watch<AuthController>();
    final Account? account = auth.account;

    return Scaffold(
      appBar: AppBar(title: const Text('You')),
      body: SafeArea(
        child: account == null
            ? const SizedBox.shrink()
            : Padding(
                padding: const EdgeInsets.all(MzaziSpace.s24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Text(account.name, style: theme.textTheme.headlineSmall),
                    const SizedBox(height: MzaziSpace.s4),
                    Text(
                      account.phone,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(height: MzaziSpace.s32),
                    SizedBox(
                      height: MzaziA11y.elderMinTouchTarget,
                      child: OutlinedButton.icon(
                        onPressed: () => unawaited(_openConsent(context, auth, account)),
                        icon: const Icon(Icons.privacy_tip_outlined),
                        label: const Text('Privacy and consent'),
                      ),
                    ),
                    const Spacer(),
                    // Last, and plain. The one control on this page that takes the
                    // panic button away, so it is the least prominent one.
                    SizedBox(
                      height: MzaziA11y.elderMinTouchTarget,
                      child: TextButton.icon(
                        onPressed: () => unawaited(_signOut(context, auth)),
                        icon: const Icon(Icons.logout),
                        label: const Text('Sign out of this phone'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
