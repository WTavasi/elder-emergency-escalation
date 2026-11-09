import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/confirm_sign_out.dart';
import '../../core/theme/appearance.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/settings_list.dart';
import '../../core/widgets/whole_page.dart';
import '../check_ins/check_in_settings.dart';
import '../consent/consent_screen.dart';
import '../medical/medical_id_screen.dart';
import '../profile/nearby_services.dart';
import '../profile/profile_screen.dart';
import '../responder/widgets/call_button.dart';

/// The elder's own page, laid out as an iPhone's Settings and as personal as the card a
/// phone keeps: who this phone belongs to and where home is at the top, then the people
/// they can ring, out in the open, one press each. Then who else can come, their daily
/// check-in, how the screen looks, their privacy, and signing out.
///
/// Signing out used to sit in the corner of the elder's home screen, next to the panic
/// control. For an elder it is almost never wanted and it is costly when pressed by
/// mistake: the phone can no longer ask for help, and getting back in needs a password
/// somebody else may have set up. So it is here, last, and behind a question. The
/// session itself does not expire for an elder, so nothing pushes them out either.
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

  Future<void> _signOut(BuildContext context) => confirmSignOut(
    context,
    message:
        "This phone cannot ask for help while you're signed out. To sign back in, you'll "
        'need a code by text or from your caregiver.',
  );

  @override
  Widget build(BuildContext context) {
    final AuthController auth = context.watch<AuthController>();
    final Account? account = auth.account;
    final AppearanceController? appearance = AppearanceController.maybeOf(context);
    final String? home = account?.home?.addressLabel;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        top: false,
        child: account == null
            ? const SizedBox.shrink()
            : ListView(
                scrollCacheExtent: wholePage,
                padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
                children: <Widget>[
                  const PageTitle('Me'),
                  ProfileHeader(
                    name: account.name,
                    subtitle: account.phone,
                    detail: home != null && home.isNotEmpty ? 'Home: $home' : null,
                  ),
                  const _WhoComes(),
                  SettingsSection(
                    children: <Widget>[
                      SettingsRow(
                        icon: Icons.medical_information_outlined,
                        title: 'Medical details',
                        subtitle: 'What helpers should know',
                        onTap: () => openScreen(
                          context,
                          MedicalIdScreen(api: api, elderId: account.id, forElder: true),
                        ),
                      ),
                    ],
                  ),
                  SettingsSection(
                    title: 'Help nearby',
                    children: <Widget>[
                      NearbyServices(api: api, elderId: account.id, forElder: true),
                    ],
                  ),
                  SettingsSection(
                    title: 'Daily check-in',
                    children: <Widget>[
                      SettingsExpandable(
                        icon: Icons.event_available_outlined,
                        title: 'Your daily check-in',
                        summary: 'When we ask if you are OK',
                        children: <Widget>[
                          CheckInSettings(
                            api: api,
                            elderId: account.id,
                            elderName: account.name,
                            forElder: true,
                            heading: false,
                          ),
                        ],
                      ),
                    ],
                  ),
                  if (appearance != null)
                    DisplaySection(controller: appearance, role: account.role),
                  PrivacySection(
                    leading: <Widget>[
                      SettingsRow(
                        icon: Icons.privacy_tip_outlined,
                        title: 'Privacy and consent',
                        onTap: () => unawaited(_openConsent(context, auth, account)),
                      ),
                    ],
                  ),
                  SettingsSection(
                    children: <Widget>[
                      // Last on the page, and behind a question: the one control here
                      // that takes the help button away.
                      SettingsRow(
                        icon: Icons.logout,
                        title: 'Sign out',
                        destructive: true,
                        onTap: () => unawaited(_signOut(context)),
                      ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

/// The elder's carers, in the order they are asked, each one press from a call: out in
/// the open at the top, because ringing somebody is what this page is most often for.
/// The same people the help button reaches, so the elder can ring one when it is not an
/// emergency, or check who will come.
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
    final List<Carer>? carers = _carers;
    final bool dark = Theme.of(context).brightness == Brightness.dark;
    // The amber of a call, so a row that rings somebody looks like the buttons that do.
    final Color amber = dark ? MzaziColorsDark.callFg : MzaziColorsLight.callFg;

    return SettingsSection(
      title: 'Call your people',
      footer: carers == null || carers.isEmpty ? null : 'The help button asks them in this order.',
      children: <Widget>[
        if (carers == null)
          SettingsRow(
            icon: Icons.people_outline,
            title: _failed ? "Couldn't load this" : 'Loading…',
            subtitle: _failed ? 'Try again later.' : null,
          )
        else if (carers.isEmpty)
          const SettingsRow(
            icon: Icons.people_outline,
            title: 'No one yet',
            subtitle: 'Ask your caregiver to add someone.',
          )
        else
          for (final Carer carer in carers)
            SettingsRow(
              icon: Icons.phone,
              iconColour: amber,
              // It rings somebody rather than opening a page, so no chevron.
              chevron: false,
              title: 'Call ${carer.name.trim().split(RegExp(r'\s+')).first}',
              subtitle: carer.place == 1
                  ? '${carer.name}, ${_role(carer.role).toLowerCase()}, asked first'
                  : '${carer.name}, ${_role(carer.role).toLowerCase()}',
              onTap: () =>
                  unawaited(CallButton.dial(context, name: carer.name, phone: carer.phone)),
            ),
      ],
    );
  }
}
