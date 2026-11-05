import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/confirm_sign_out.dart';
import '../../core/location/location_permission.dart';
import '../../core/location/position_source.dart';
import '../../core/location/way_there.dart';
import '../../core/theme/appearance.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/password_field.dart';
import '../../core/widgets/settings_list.dart';
import '../legal/legal_screens.dart';
import 'change_phone_screen.dart';

/// The signed-in person's own page, laid out as an iPhone's Settings: who they are at the
/// top, opening their details; their care circles and what they have done, each a row
/// that opens in place; then sharing their location, how the app looks, their account,
/// privacy, and signing out last.
///
/// What a person checks now and then (their circles, their history) folds away; what
/// changes how the app behaves sits out as a switch or a pull-down.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final Account? account = context.watch<AuthController>().account;
    final AppearanceController? appearance = AppearanceController.maybeOf(context);
    final WayThere? way = WayThere.maybeOf(context);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: account == null
            ? const SizedBox.shrink()
            : ListView(
                padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
                children: <Widget>[
                  const PageTitle('Me'),
                  ProfileHeader(
                    name: account.name,
                    subtitle: '${_roleLabel(account.role)} · ${account.phone}',
                    onTap: () => openScreen(context, const AccountDetailsScreen()),
                  ),
                  const _Standing(),
                  if (account.role.travels && way != null) _WayThereSetting(way: way),
                  if (appearance != null)
                    DisplaySection(controller: appearance, role: account.role),
                  SettingsSection(
                    title: 'Account',
                    children: <Widget>[
                      SettingsRow(
                        icon: Icons.badge_outlined,
                        title: 'Name and email',
                        onTap: () => openScreen(context, const AccountDetailsScreen()),
                      ),
                      SettingsRow(
                        icon: Icons.phone_iphone,
                        title: 'Phone number',
                        value: account.phone,
                        onTap: () => openScreen(context, const ChangePhoneScreen()),
                      ),
                      SettingsRow(
                        icon: Icons.lock_outline,
                        title: 'Password',
                        onTap: () => openScreen(context, const ChangePasswordScreen()),
                      ),
                    ],
                  ),
                  const PrivacySection(),
                  SettingsSection(
                    children: <Widget>[
                      // Last on the page, where nobody presses it on the way to something
                      // else, and behind a question.
                      SettingsRow(
                        icon: Icons.logout,
                        title: 'Sign out',
                        destructive: true,
                        onTap: () => unawaited(_signOut(context, account)),
                      ),
                    ],
                  ),
                ],
              ),
      ),
    );
  }

  /// The same sheet the elder sees, saying what signing out means for this person.
  /// Signing out removes this phone's push address, so anybody who is asked to help is
  /// sent a text instead, and the text is what the sheet promises.
  static Future<void> _signOut(BuildContext context, Account account) => confirmSignOut(
    context,
    message: account.role.responds || account.role == Role.communityResponder
        ? "Alerts stop on this phone. We'll text you instead. To sign back in, you'll need "
              'your number and password.'
        : "To sign back in, you'll need your number and password.",
  );

  static String _roleLabel(Role role) => switch (role) {
    Role.caregiver => 'Caregiver',
    Role.familyMember => 'Family member',
    Role.emergencyResponder => 'Emergency responder',
    Role.administrator => 'Administrator',
    Role.elder => 'Elder',
    Role.communityResponder => 'Community volunteer',
  };
}

/// How the app looks, for everybody's own page: light or dark from a pull-down, and the
/// larger size as a switch.
class DisplaySection extends StatelessWidget {
  const DisplaySection({required this.controller, required this.role, super.key});

  final AppearanceController controller;
  final Role? role;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) => SettingsSection(
        title: 'Display',
        children: <Widget>[
          SettingsMenuRow<ThemeMode>(
            icon: Icons.contrast,
            title: 'Appearance',
            value: controller.mode,
            choices: const <SettingsChoice<ThemeMode>>[
              SettingsChoice<ThemeMode>(
                ThemeMode.system,
                'Automatic',
                icon: Icons.smartphone_outlined,
              ),
              SettingsChoice<ThemeMode>(ThemeMode.light, 'Light', icon: Icons.light_mode_outlined),
              SettingsChoice<ThemeMode>(ThemeMode.dark, 'Dark', icon: Icons.dark_mode_outlined),
            ],
            onChanged: (ThemeMode mode) => unawaited(controller.choose(mode)),
          ),
          SettingsSwitchRow(
            icon: Icons.text_increase,
            title: 'Elder mode',
            subtitle: 'Larger text and bigger buttons',
            value: controller.elderModeFor(role),
            onChanged: (bool on) => unawaited(controller.setElderMode(on)),
          ),
        ],
      ),
    );
  }
}

/// The privacy notice and the terms, each a row to its own page.
class PrivacySection extends StatelessWidget {
  const PrivacySection({this.leading = const <Widget>[], super.key});

  /// Rows that belong before the notice, such as the elder's own consent.
  final List<Widget> leading;

  @override
  Widget build(BuildContext context) {
    return SettingsSection(
      title: 'Privacy',
      children: <Widget>[
        ...leading,
        SettingsRow(
          icon: Icons.policy_outlined,
          title: 'Privacy notice',
          onTap: () => openScreen(context, const PrivacyNoticeScreen()),
        ),
        SettingsRow(
          icon: Icons.description_outlined,
          title: 'Terms of use',
          onTap: () => openScreen(context, const TermsScreen()),
        ),
      ],
    );
  }
}

/// Name and email, and the phone number, on a page of their own.
class AccountDetailsScreen extends StatelessWidget {
  const AccountDetailsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final Account? account = context.watch<AuthController>().account;
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        top: false,
        child: account == null
            ? const SizedBox.shrink()
            : ListView(
                padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
                children: <Widget>[
                  const PageTitle('Your details'),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: MzaziLayout.margin(context)),
                    child: _DetailsForm(account: account),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Changing the password, on a page of its own.
class ChangePasswordScreen extends StatelessWidget {
  const ChangePasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
          children: <Widget>[
            const PageTitle('Password'),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: MzaziLayout.margin(context)),
              child: const _PasswordForm(),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailsForm extends StatefulWidget {
  const _DetailsForm({required this.account});

  final Account account;

  @override
  State<_DetailsForm> createState() => _DetailsFormState();
}

class _DetailsFormState extends State<_DetailsForm> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: widget.account.name);
  late final TextEditingController _email = TextEditingController(text: widget.account.email ?? '');
  bool _busy = false;
  String? _error;
  String? _saved;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  bool get _changed =>
      _name.text.trim() != widget.account.name ||
      _email.text.trim() != (widget.account.email ?? '');

  Future<void> _changePhone() async {
    final bool? changed = await Navigator.of(context)
        .push<bool>(MaterialPageRoute<bool>(builder: (_) => const ChangePhoneScreen()));
    if (changed == true && mounted) {
      setState(() {
        _error = null;
        _saved = 'Number changed. Other phones are signed out.';
      });
    }
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    final String email = _email.text.trim();
    setState(() {
      _busy = true;
      _error = null;
      _saved = null;
    });

    final String? problem = await context.read<AuthController>().updateProfile(
      name: _name.text.trim() == widget.account.name ? null : _name.text.trim(),
      email: email.isEmpty ? null : email,
      clearEmail: email.isEmpty && widget.account.email != null,
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = problem;
      _saved = problem == null ? 'Saved.' : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const SizedBox(height: MzaziSpace.s8),
          if (_error != null) ...<Widget>[
            Notice(message: _error!, isError: true),
            const SizedBox(height: MzaziSpace.s12),
          ],
          if (_saved != null) ...<Widget>[
            Notice(message: _saved!),
            const SizedBox(height: MzaziSpace.s12),
          ],
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Name'),
            onChanged: (_) => setState(() => _saved = null),
            validator: (String? v) =>
                (v == null || v.trim().length < 2) ? 'Enter your name.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email (optional)'),
            onChanged: (_) => setState(() => _saved = null),
            validator: (String? v) {
              final String email = v?.trim() ?? '';
              if (email.isEmpty) return null;
              return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)
                  ? null
                  : 'Enter a valid email address.';
            },
          ),
          const SizedBox(height: MzaziSpace.s16),
          // The whole field is the button, as a row in the iPhone's Settings is, with
          // "Change" in it as a word rather than a button of its own. A button inside the
          // field brought its own touch target and made this field taller than the two
          // above it.
          Semantics(
            button: true,
            enabled: !_busy,
            label: 'Phone number, ${widget.account.phone}. Change',
            excludeSemantics: true,
            child: InkWell(
              onTap: _busy ? null : () => unawaited(_changePhone()),
              borderRadius: BorderRadius.circular(MzaziRadius.field),
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Phone number',
                  helperText: "You sign in with this number. We'll text a code to change it.",
                  helperMaxLines: 2,
                ),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: Text(widget.account.phone, style: theme.textTheme.bodyLarge?.figures),
                    ),
                    // The body's size and spacing, at a button's weight, so the line is
                    // no taller than the number beside it.
                    Text(
                      'Change',
                      style: theme.textTheme.bodyLarge
                          ?.weighted(theme.textTheme.labelLarge?.fontWeight ?? MzaziWeight.strong)
                          .copyWith(color: _busy ? theme.disabledColor : theme.colorScheme.primary),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: MzaziSpace.s16),
          FilledButton.icon(
            onPressed: _busy || !_changed ? null : () => unawaited(_save()),
            icon: const Icon(Icons.save_outlined),
            label: Text(_busy ? 'Saving…' : 'Save changes'),
          ),
        ],
      ),
    );
  }
}

class _PasswordForm extends StatefulWidget {
  const _PasswordForm();

  @override
  State<_PasswordForm> createState() => _PasswordFormState();
}

class _PasswordFormState extends State<_PasswordForm> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _change() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
      _done = false;
    });

    final String? problem = await context.read<AuthController>().changePassword(
      current: _current.text,
      next: _next.text,
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = problem;
      _done = problem == null;
      if (_done) {
        _current.clear();
        _next.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          const SizedBox(height: MzaziSpace.s8),
          if (_error != null) ...<Widget>[
            Notice(message: _error!, isError: true),
            const SizedBox(height: MzaziSpace.s12),
          ],
          if (_done) ...<Widget>[
            const Notice(message: 'Password changed. Other phones are signed out.'),
            const SizedBox(height: MzaziSpace.s12),
          ],
          PasswordField(
            controller: _current,
            label: 'Current password',
            textInputAction: TextInputAction.next,
            validator: (String? v) =>
                (v == null || v.isEmpty) ? 'Enter your current password.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          // Shown on request rather than typed twice, as everywhere else in the app.
          PasswordField(
            controller: _next,
            label: 'New password',
            helperText: 'At least 8 characters',
            newPassword: true,
            onSubmitted: (_) => unawaited(_change()),
            validator: (String? v) =>
                (v == null || v.length < 8) ? 'Use at least 8 characters.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => unawaited(_change()),
            icon: const Icon(Icons.lock_reset),
            label: Text(_busy ? 'Changing…' : 'Change password'),
          ),
        ],
      ),
    );
  }
}

/// "Share live location", as a switch row with what it means said under it.
///
/// Turning it on asks for location access there and then, while the person is calm
/// and reading, rather than at the moment they take an emergency on.
class _WayThereSetting extends StatelessWidget {
  const _WayThereSetting({required this.way});

  final WayThere way;

  /// Turning it on says why location is wanted before the phone asks for it, when the
  /// phone has not been asked yet.
  Future<void> _turn(BuildContext context, bool on) async {
    if (on && await way.checkAccess() == LocationAccess.denied) {
      if (!context.mounted || !await explainLocation(context)) return;
    }
    await way.setEnabled(on);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: way,
      builder: (BuildContext context, Widget? _) {
        final bool settings =
            way.access == LocationAccess.deniedForever || way.access == LocationAccess.serviceOff;
        return SettingsSection(
          title: 'On the way',
          footer:
              "When you're on your way to an emergency, they see how far away you are, and "
              'your alerts are sorted by distance. It stops when you arrive. We do not keep it.',
          children: <Widget>[
            SettingsSwitchRow(
              icon: Icons.near_me_outlined,
              title: 'Share live location',
              value: way.enabled,
              onChanged: !way.isLoaded || way.isSaving
                  ? null
                  : (bool on) => unawaited(_turn(context, on)),
            ),
            if (way.problem != null && way.eventId == null)
              Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: MzaziLayout.margin(context),
                  vertical: MzaziSpace.s12,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Notice(message: way.problem!, isError: true),
                    if (settings)
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: TextButton(
                          onPressed: () => unawaited(way.openSettings()),
                          child: const Text('Open settings'),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Where this person stands and what they have done: their place in each care circle
/// and their own record of answering. Read from the emergencies themselves, so it
/// cannot drift from what happened. Never a ranking against anybody else.
class _Standing extends StatefulWidget {
  const _Standing();

  @override
  State<_Standing> createState() => _StandingState();
}

class _StandingState extends State<_Standing> {
  Profile? _profile;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final Profile profile = await context.read<AuthController>().profile();
      if (mounted) setState(() => _profile = profile);
    } on Exception {
      if (mounted) setState(() => _failed = true);
    }
  }

  static String _place(int place) => switch (place) {
    1 => 'Asked first',
    2 => 'Asked second',
    3 => 'Asked third',
    _ => 'Asked number $place',
  };

  /// "about 2 minutes", "under a minute": how long, at the precision a person uses.
  static String _duration(int seconds) {
    if (seconds < 60) return 'under a minute';
    final int minutes = (seconds / 60).round();
    if (minutes < 60) return minutes == 1 ? 'about a minute' : 'about $minutes minutes';
    final int hours = (minutes / 60).round();
    return hours == 1 ? 'about an hour' : 'about $hours hours';
  }

  static String _day(DateTime when) {
    const List<String> months = <String>[
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return '${when.day} ${months[when.month - 1]} ${when.year}';
  }

  @override
  Widget build(BuildContext context) {
    final Profile? profile = _profile;

    if (profile == null) {
      return _failed
          ? const SettingsSection(
              title: 'Your care',
              children: <Widget>[
                SettingsRow(
                  icon: Icons.error_outline,
                  title: "Couldn't load your care circles",
                  subtitle: 'Try again later.',
                ),
              ],
            )
          : const SizedBox.shrink();
    }

    final ResponseRecord? record = profile.record;
    if (profile.circles.isEmpty && record == null) return const SizedBox.shrink();
    final int people = profile.circles.length;

    return SettingsSection(
      title: 'Your care',
      children: <Widget>[
        if (profile.circles.isNotEmpty)
          SettingsExpandable(
            icon: Icons.diversity_1_outlined,
            title: 'Your care circles',
            summary: people == 1 ? '1 person' : '$people people',
            children: <Widget>[
              for (final CirclePlace circle in profile.circles)
                SettingsDetail(title: circle.elderName, note: _place(circle.place)),
            ],
          ),
        if (record != null)
          SettingsExpandable(
            icon: Icons.history,
            title: 'Your history',
            summary: _helped(record.answered),
            children: <Widget>[
              SettingsDetail(
                title: _helped(record.answered),
                note: <String>[
                  if (record.medianResponseSeconds case final int seconds)
                    'You usually answer in ${_duration(seconds)}.',
                  if (record.lastAnsweredAt case final DateTime last)
                    'Last answered on ${_day(last)}.',
                ].join(' '),
              ),
            ],
          ),
      ],
    );
  }

  static String _helped(int answered) => answered == 0
      ? 'No emergencies yet'
      : answered == 1
      ? "You've helped with 1 emergency."
      : "You've helped with $answered emergencies.";
}
