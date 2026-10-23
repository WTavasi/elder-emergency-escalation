import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/widgets/section_label.dart';
import '../check_ins/check_in_settings.dart';
import '../consent/consent_screen.dart';
import '../legal/legal_screens.dart';
import '../responder/widgets/call_button.dart';

/// The elder's own page, laid out like the emergency card a phone keeps: who this phone
/// belongs to, where home is, who comes and how to ring them, their daily check-in,
/// their privacy, and signing out.
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
          'will need a code sent by text, or one from your caregiver.',
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
    final AuthController auth = context.watch<AuthController>();
    final Account? account = auth.account;

    return Scaffold(
      appBar: AppBar(title: const Text('You')),
      body: SafeArea(
        child: account == null
            ? const SizedBox.shrink()
            // Scrolls when it has to, with large text on a small phone, and otherwise
            // fills the screen so signing out stays at the bottom.
            : LayoutBuilder(
                builder: (BuildContext context, BoxConstraints constraints) =>
                    SingleChildScrollView(
                      padding: const EdgeInsets.all(MzaziSpace.s24),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: (constraints.maxHeight - MzaziSpace.s24 * 2)
                              .clamp(0, double.infinity)
                              .toDouble(),
                        ),
                        child: IntrinsicHeight(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: <Widget>[
                              _IdCard(account: account),
                              const SizedBox(height: MzaziSpace.s32),
                              const _WhoComes(),
                              const SizedBox(height: MzaziSpace.s32),
                              CheckInSettings(
                                api: api,
                                elderId: account.id,
                                elderName: account.name,
                                forElder: true,
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
                              const SizedBox(height: MzaziSpace.s8),
                              const LegalLinks(),
                              const SizedBox(height: MzaziSpace.s24),
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
                    ),
              ),
      ),
    );
  }
}

/// Name, number and home, set apart like the card a phone shows on its lock screen, so
/// somebody helping can read it at a glance. Plain colours: red is kept for an emergency.
class _IdCard extends StatelessWidget {
  const _IdCard({required this.account});

  final Account account;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? home = account.home?.addressLabel;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(MzaziSpace.s16),
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
            if (home != null && home.isNotEmpty) ...<Widget>[
              const SizedBox(height: MzaziSpace.s16),
              Text('Home', style: theme.textTheme.labelLarge),
              const SizedBox(height: MzaziSpace.s4),
              Text(home, style: theme.textTheme.bodyLarge),
            ],
          ],
        ),
      ),
    );
  }
}

/// The elder's carers, in the order they are asked, each one press from a call. The
/// same people the help button reaches, so the elder can ring one directly when it is
/// not an emergency, or check who will come.
class _WhoComes extends StatefulWidget {
  const _WhoComes();

  @override
  State<_WhoComes> createState() => _WhoComesState();
}

class _WhoComesState extends State<_WhoComes> {
  List<Carer>? _carers;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final Profile profile = await context.read<AuthController>().profile();
      if (mounted) setState(() => _carers = profile.carers);
    } on Exception {
      if (mounted) setState(() => _failed = true);
    }
  }

  static String _role(Role role) => switch (role) {
    Role.caregiver => 'Caregiver',
    Role.familyMember => 'Family',
    Role.emergencyResponder => 'Emergency responder',
    _ => '',
  };

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final List<Carer>? carers = _carers;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const SectionLabel('Who comes when you press for help'),
        const SizedBox(height: MzaziSpace.s8),
        if (carers == null)
          _failed
              ? Text('This could not be loaded just now.', style: theme.textTheme.bodyLarge)
              : const SizedBox(height: MzaziSpace.s24)
        else if (carers.isEmpty)
          Text('Nobody yet. Ask your caregiver to add someone.', style: theme.textTheme.bodyLarge)
        else
          for (final Carer carer in carers) ...<Widget>[
            Text(carer.name, style: theme.textTheme.titleMedium),
            Text(
              carer.place == 1 ? '${_role(carer.role)}, asked first' : _role(carer.role),
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: MzaziSpace.s8),
            SizedBox(
              height: MzaziA11y.elderMinTouchTarget,
              child: CallButton(name: carer.name, phone: carer.phone),
            ),
            const SizedBox(height: MzaziSpace.s16),
          ],
      ],
    );
  }
}
