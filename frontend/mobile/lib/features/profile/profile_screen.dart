import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/location/position_source.dart';
import '../../core/location/way_there.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/section_label.dart';
import '../legal/legal_screens.dart';
import 'change_phone_screen.dart';

/// The signed-in person's care profile: where they stand in each circle, what they have
/// done when asked, how they help, and their account.
///
/// The phone number changes on its own screen, because it is how they sign in and the
/// number every chain calls, so it needs a code sent to the new number.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final Account? account = context.watch<AuthController>().account;
    final ThemeData theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: account == null
            ? const SizedBox.shrink()
            : ListView(
                padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
                children: <Widget>[
                  const PageTitle('My account'),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        // Name and role as type, with no avatar circle: the app stores no
                        // photo, and initials in a circle are a placeholder for one.
                        Text(account.name, style: theme.textTheme.titleLarge),
                        Text(_roleLabel(account.role), style: theme.textTheme.bodySmall),
                        const SizedBox(height: MzaziSpace.s24),
                        const _Standing(),
                        const SizedBox(height: MzaziSpace.s32),
                        _DetailsForm(account: account),
                        if (account.role.responds && WayThere.maybeOf(context) != null) ...<Widget>[
                          const SizedBox(height: MzaziSpace.s32),
                          _WayThereSetting(way: WayThere.maybeOf(context)!),
                        ],
                        const SizedBox(height: MzaziSpace.s32),
                        const _PasswordForm(),
                        const SizedBox(height: MzaziSpace.s32),
                        const SectionLabel('Privacy and terms'),
                        const LegalLinks(),
                        const SizedBox(height: MzaziSpace.s24),
                        const SectionLabel('This phone'),
                        const SizedBox(height: MzaziSpace.s16),
                        // Here rather than in a top bar, at the bottom of the account page,
                        // where nobody presses it by accident on the way to something else.
                        OutlinedButton.icon(
                          onPressed: () => unawaited(context.read<AuthController>().signOut()),
                          icon: const Icon(Icons.logout),
                          label: const Text('Sign out'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  static String _roleLabel(Role role) => switch (role) {
    Role.caregiver => 'Caregiver',
    Role.familyMember => 'Family member',
    Role.emergencyResponder => 'Emergency responder',
    Role.administrator => 'Administrator',
    Role.elder => 'Elder',
    Role.communityResponder => 'Community volunteer',
  };
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
    final bool? changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const ChangePhoneScreen()),
    );
    if (changed == true && mounted) {
      setState(() {
        _error = null;
        _saved = 'Number changed. Any other phone signed in to this account will be signed out.';
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
          const SectionLabel('Your details'),
          const SizedBox(height: MzaziSpace.s16),
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
                  : 'That does not look like an email address.';
            },
          ),
          const SizedBox(height: MzaziSpace.s16),
          InputDecorator(
            decoration: const InputDecoration(
              labelText: 'Phone number',
              helperText: 'You sign in with this number. Changing it needs a code.',
              helperMaxLines: 2,
            ),
            child: Row(
              children: <Widget>[
                Expanded(
                  child: Text(
                    widget.account.phone,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : () => unawaited(_changePhone()),
                  child: const Text('Change'),
                ),
              ],
            ),
          ),
          const SizedBox(height: MzaziSpace.s16),
          FilledButton.icon(
            onPressed: _busy || !_changed ? null : () => unawaited(_save()),
            icon: const Icon(Icons.save_outlined),
            label: Text(_busy ? 'Saving' : 'Save changes'),
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
  final TextEditingController _again = TextEditingController();
  bool _busy = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
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
        _again.clear();
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
          const SectionLabel('Change password'),
          const SizedBox(height: MzaziSpace.s16),
          if (_error != null) ...<Widget>[
            Notice(message: _error!, isError: true),
            const SizedBox(height: MzaziSpace.s12),
          ],
          if (_done) ...<Widget>[
            const Notice(
              message:
                  'Password changed. Any other phone signed in to this account will be signed out.',
            ),
            const SizedBox(height: MzaziSpace.s12),
          ],
          TextFormField(
            controller: _current,
            obscureText: true,
            autofillHints: const <String>[AutofillHints.password],
            decoration: const InputDecoration(labelText: 'Current password'),
            validator: (String? v) =>
                (v == null || v.isEmpty) ? 'Enter your current password.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _next,
            obscureText: true,
            autofillHints: const <String>[AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'New password',
              helperText: 'At least 8 characters',
            ),
            validator: (String? v) =>
                (v == null || v.length < 8) ? 'Use at least 8 characters.' : null,
          ),
          const SizedBox(height: MzaziSpace.s16),
          TextFormField(
            controller: _again,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'New password again'),
            validator: (String? v) => v == _next.text ? null : 'The two passwords are different.',
          ),
          const SizedBox(height: MzaziSpace.s16),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => unawaited(_change()),
            icon: const Icon(Icons.lock_reset),
            label: Text(_busy ? 'Changing' : 'Change password'),
          ),
        ],
      ),
    );
  }
}

/// "Share my way there", with what it means said beside the switch.
///
/// Turning it on asks for location access there and then, while the person is calm
/// and reading, rather than at the moment they take an emergency on.
class _WayThereSetting extends StatelessWidget {
  const _WayThereSetting({required this.way});

  final WayThere way;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: way,
      builder: (BuildContext context, Widget? _) {
        final bool settings =
            way.access == LocationAccess.deniedForever || way.access == LocationAccess.serviceOff;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const SectionLabel('On the way'),
            const SizedBox(height: MzaziSpace.s8),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Share my way there'),
              subtitle: const Text(
                'When you take an emergency on, the elder sees how long you will be and '
                'the rest of the circle sees where you are, until you arrive. Where you '
                'were is not kept.',
              ),
              value: way.enabled,
              onChanged: !way.isLoaded || way.isSaving
                  ? null
                  : (bool on) => unawaited(way.setEnabled(on)),
            ),
            if (way.problem != null && way.eventId == null) ...<Widget>[
              const SizedBox(height: MzaziSpace.s8),
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
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return '${when.day} ${months[when.month - 1]} ${when.year}';
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Profile? profile = _profile;

    if (profile == null) {
      return _failed
          ? Text('Your circles and record could not be loaded.', style: theme.textTheme.bodySmall)
          : const SizedBox(height: MzaziSpace.s24);
    }

    final ResponseRecord? record = profile.record;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (profile.circles.isNotEmpty) ...<Widget>[
          const SectionLabel('Your circles'),
          const SizedBox(height: MzaziSpace.s8),
          for (final CirclePlace circle in profile.circles)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s4),
              child: Text(
                '${_place(circle.place)} for ${circle.elderName}',
                style: theme.textTheme.bodyLarge,
              ),
            ),
          const SizedBox(height: MzaziSpace.s24),
        ],
        if (record != null) ...<Widget>[
          const SectionLabel('Your record'),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            record.answered == 0
                ? 'You have not taken an emergency on yet.'
                : record.answered == 1
                ? 'You have answered 1 emergency.'
                : 'You have answered ${record.answered} emergencies.',
            style: theme.textTheme.bodyLarge,
          ),
          if (record.medianResponseSeconds case final int seconds)
            Text(
              'You usually answer in ${_duration(seconds)}.',
              style: theme.textTheme.bodyLarge,
            ),
          if (record.lastAnsweredAt case final DateTime last)
            Text('Last answered on ${_day(last)}.', style: theme.textTheme.bodySmall),
        ],
      ],
    );
  }
}
