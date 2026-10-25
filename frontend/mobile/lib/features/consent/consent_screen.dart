import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/platform_alert.dart';
import '../../core/widgets/section_label.dart';
import '../legal/legal_screens.dart';

/// Who is reading: the elder about themselves, or somebody in their care circle.
enum ConsentAudience { elder, careCircle }

/// What has been agreed about an elder, and the way to change it.
///
/// Two forms of one screen. Opened from the elder's first sign-in, it asks once whether
/// they agree, for themselves, to what was agreed on their behalf, and "Not now" is
/// always there: the panic button works either way, because a safety feature is never
/// held behind a consent screen. Otherwise it lists each consent with what it means,
/// who gave it and whether it still stands, and lets the elder or their caregiver
/// withdraw it.
class ConsentScreen extends StatefulWidget {
  const ConsentScreen({
    required this.api,
    required this.elderId,
    required this.audience,
    this.firstSignIn = false,
    this.initial,
    this.onServiceEnded,
    super.key,
  });

  final ApiClient api;
  final String elderId;
  final ConsentAudience audience;

  /// The one-time question rather than the full page.
  final bool firstSignIn;

  /// Already loaded by whoever opened this, so it opens without a second request.
  final ConsentView? initial;

  /// Called after the elder withdraws consent to processing, which closes their account,
  /// once this screen has closed. The elder's app signs out.
  final VoidCallback? onServiceEnded;

  @override
  State<ConsentScreen> createState() => _ConsentScreenState();
}

class _ConsentScreenState extends State<ConsentScreen> {
  ConsentView? _view;
  String? _error;
  bool _busy = false;

  bool get _isElder => widget.audience == ConsentAudience.elder;

  /// The elder's first name, for sentences written about them.
  String get _name {
    final String full = _view?.elderName.trim() ?? '';
    return full.isEmpty ? 'They' : full.split(RegExp(r'\s+')).first;
  }

  @override
  void initState() {
    super.initState();
    _view = widget.initial;
    if (_view == null) {
      _busy = true;
      unawaited(_request(() => widget.api.consent(widget.elderId)));
    }
  }

  /// Runs one request and shows what came back. True when it succeeded.
  Future<bool> _request(Future<ConsentView> Function() request) async {
    try {
      final ConsentView view = await request();
      if (!mounted) return false;
      setState(() {
        _view = view;
        _error = null;
        _busy = false;
      });
      return true;
    } on ApiException catch (failure) {
      if (mounted) {
        setState(() {
          _error = failure.message;
          _busy = false;
        });
      }
    } on NetworkException catch (failure) {
      if (mounted) {
        setState(() {
          _error = failure.message;
          _busy = false;
        });
      }
    }
    return false;
  }

  Future<void> _agree() async {
    setState(() => _busy = true);
    final bool done = await _request(() => widget.api.confirmConsent(widget.elderId));
    if (!mounted) return;
    if (done) Navigator.of(context).pop(true);
  }

  /// Giving help from nearby volunteers, or giving back a consent that was withdrawn.
  /// The elder for themselves; a caregiver on their behalf, which the elder is then asked
  /// to confirm and is told about by text.
  Future<void> _give(ConsentItem item) async {
    final bool? sure = await showPlatformAlert<bool>(
      context,
      title: _giveTitle(item.kind),
      content: Text(_meaning(item.kind)),
      actions: const <AlertAction<bool>>[
        AlertAction<bool>('Not now', false),
        AlertAction<bool>('Agree', true),
      ],
    );
    if (!mounted || sure != true) return;

    setState(() => _busy = true);
    await _request(() => widget.api.grantConsent(widget.elderId, item.kind));
  }

  String _giveTitle(ConsentKind kind) => switch (kind) {
    ConsentKind.communityHelp =>
      _isElder ? 'Let nearby volunteers help you?' : 'Let nearby volunteers help $_name?',
    _ => _isElder ? 'Agree to this again?' : 'Agree to this for $_name?',
  };

  Future<void> _withdraw(ConsentItem item) async {
    final bool endsService = item.kind == ConsentKind.dataProcessing;
    final bool? sure = await showPlatformAlert<bool>(
      context,
      title: _withdrawTitle(item.kind),
      content: Text(_withdrawEffect(item.kind)),
      actions: <AlertAction<bool>>[
        const AlertAction<bool>('Keep it', false),
        AlertAction<bool>(endsService ? 'Stop MzaziCare' : 'Withdraw', true, destructive: true),
      ],
    );
    if (!mounted) return;
    if (sure != true) return;

    setState(() => _busy = true);
    final bool done = await _request(
      () => widget.api.withdrawConsent(widget.elderId, item.kind, confirm: endsService),
    );
    if (!mounted) return;
    if (!done || !endsService) return;

    // Closed first, then signed out: a sign-out replaces the screen underneath, and a
    // page left on top of it would belong to nobody.
    final VoidCallback? ended = _isElder ? widget.onServiceEnded : null;
    Navigator.of(context).pop(true);
    ended?.call();
  }

  String _title(ConsentKind kind) => switch (kind) {
    ConsentKind.dataProcessing =>
      _isElder ? 'Looking after your information' : 'Looking after their information',
    ConsentKind.locationSharing => _isElder ? 'Sharing where you are' : 'Sharing where they are',
    ConsentKind.contactSharing =>
      _isElder ? 'Sharing your phone number' : 'Sharing their phone number',
    ConsentKind.communityHelp =>
      _isElder ? 'Help from volunteers near you' : 'Help from volunteers near them',
  };

  String _meaning(ConsentKind kind) => switch (kind) {
    ConsentKind.dataProcessing =>
      _isElder
          ? 'MzaziCare keeps your name, number, home and how much help you need, so it can '
                'tell the right people when you ask for help.'
          : 'MzaziCare keeps their name, number, home and how much help they need, so it '
                'can tell the right people when they ask for help.',
    ConsentKind.locationSharing =>
      _isElder
          ? 'The people who look after you can see your home and any place you are staying.'
          : 'The people who look after them can see their home and any place they are '
                'staying.',
    ConsentKind.contactSharing =>
      _isElder
          ? 'The people who look after you can see your number and call you from the app.'
          : 'The people who look after them can see their number and call them from the app.',
    ConsentKind.communityHelp =>
      _isElder
          ? 'When you need help urgently, or no emergency service covers your area, vetted '
                'volunteers living near you can be asked to come too. The one who says they '
                'will come is told your name, address and number. Your family is still asked '
                'as before.'
          : 'When they need help urgently, or no emergency service covers their area, vetted '
                'volunteers living nearby can be asked to come too. The one who says they will '
                'come is told their name, address and number. Their chain is still asked as '
                'before.',
  };

  String _withdrawTitle(ConsentKind kind) => switch (kind) {
    ConsentKind.dataProcessing =>
      _isElder ? 'Stop MzaziCare for you?' : 'Stop MzaziCare for $_name?',
    ConsentKind.locationSharing =>
      _isElder ? 'Stop sharing where you are?' : 'Stop sharing where $_name is?',
    ConsentKind.contactSharing =>
      _isElder ? 'Stop sharing your phone number?' : "Stop sharing $_name's phone number?",
    ConsentKind.communityHelp =>
      _isElder ? 'Stop asking volunteers to help you?' : 'Stop asking volunteers to help $_name?',
  };

  String _withdrawEffect(ConsentKind kind) => switch (kind) {
    ConsentKind.dataProcessing =>
      _isElder
          ? 'You will not be able to ask for help with this app any more, and you will be '
                'signed out. Your history is kept, and an administrator can restore your '
                'account.'
          : '$_name will not be able to ask for help with this app any more. Their history '
                'is kept, and an administrator can restore the account.',
    ConsentKind.locationSharing =>
      _isElder
          ? 'The people who look after you will no longer see your home or where you are '
                'staying. In an emergency, the people helping you still see where to go.'
          : 'Nobody looking after $_name will see their home or where they are staying any '
                'more. In an emergency, the people helping still see where to go.',
    ConsentKind.contactSharing =>
      _isElder
          ? 'The people who look after you will no longer see your number. In an '
                'emergency, the people helping you can still call you.'
          : "Nobody looking after $_name will see their number any more. In an emergency, "
                'the people helping can still call them.',
    ConsentKind.communityHelp =>
      _isElder
          ? 'Volunteers will not be asked to come to you. Your family and the emergency '
                'services are asked as before.'
          : 'Volunteers will not be asked to come to $_name. Their chain and the emergency '
                'services are asked as before.',
  };

  String _status(ConsentItem item) {
    final DateTime? withdrawn = item.withdrawnAt;
    if (!item.active && item.givenAt == null) return 'Not agreed';
    if (!item.active) return withdrawn == null ? 'Withdrawn' : 'Withdrawn on ${_day(withdrawn)}';

    final DateTime? confirmed = item.confirmedAt;
    if (confirmed != null) return '${_isElder ? 'You' : _name} agreed on ${_day(confirmed)}';

    final String? by = item.givenByName;
    final DateTime? given = item.givenAt;
    if (by == null) return 'Agreed';
    return given == null ? 'Agreed by $by' : 'Agreed by $by on ${_day(given)}';
  }

  String _onBehalfLine(ConsentView view) {
    final ConsentItem? given = view.givenOnBehalf;
    final String? who = given?.givenByName;
    if (who == null) return 'MzaziCare needs your agreement to these.';

    final String relation = given?.givenByRelationship?.trim() ?? '';
    final String byWhom = relation.isEmpty ? who : '$who ($relation)';
    return '$byWhom agreed to these for you. Do you agree to them yourself?';
  }

  @override
  Widget build(BuildContext context) {
    final ConsentView? view = _view;

    return Scaffold(
      appBar: widget.firstSignIn ? null : AppBar(title: const Text('Privacy and consent')),
      body: SafeArea(
        child: view == null
            ? _loading(context)
            : widget.firstSignIn
            ? _question(context, view)
            : _page(context, view),
      ),
    );
  }

  Widget _loading(BuildContext context) {
    final String? error = _error;
    if (error == null) return const Center(child: CircularProgressIndicator());

    return ListView(
      padding: const EdgeInsets.all(MzaziSpace.s24),
      children: <Widget>[
        Notice(message: error, isError: true),
        const SizedBox(height: MzaziSpace.s16),
        OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Go back')),
      ],
    );
  }

  /// The one-time question at an elder's first sign-in.
  Widget _question(BuildContext context, ConsentView view) {
    final ThemeData theme = Theme.of(context);
    final String? error = _error;

    return ListView(
      padding: const EdgeInsets.all(MzaziSpace.s24),
      children: <Widget>[
        Semantics(
          header: true,
          child: Text('Before you start', style: theme.textTheme.headlineLarge),
        ),
        const SizedBox(height: MzaziSpace.s12),
        Text(_onBehalfLine(view), style: theme.textTheme.bodyLarge),
        const SizedBox(height: MzaziSpace.s24),
        for (final ConsentItem item in view.items.where((ConsentItem i) => i.active)) ...<Widget>[
          Text(_title(item.kind), style: theme.textTheme.titleMedium),
          const SizedBox(height: MzaziSpace.s4),
          Text(_meaning(item.kind), style: theme.textTheme.bodyLarge),
          const SizedBox(height: MzaziSpace.s16),
        ],
        Text(
          'In an emergency, the people helping you always see what they need to reach you. '
          'You can change your mind at any time. Tap the round button at the top of your '
          'screen, then Privacy and consent.',
          style: theme.textTheme.bodyLarge,
        ),
        if (error != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s16),
          Notice(message: error, isError: true),
        ],
        const SizedBox(height: MzaziSpace.s24),
        SizedBox(
          height: MzaziA11y.elderMinTouchTarget,
          child: FilledButton(
            onPressed: _busy ? null : () => unawaited(_agree()),
            child: const Text('I agree'),
          ),
        ),
        const SizedBox(height: MzaziSpace.s12),
        SizedBox(
          height: MzaziA11y.elderMinTouchTarget,
          child: OutlinedButton(
            onPressed: _busy ? null : () => Navigator.of(context).pop(false),
            child: const Text('Not now'),
          ),
        ),
      ],
    );
  }

  /// The full page: every consent, its standing, and the way to withdraw it.
  Widget _page(BuildContext context, ConsentView view) {
    final ThemeData theme = Theme.of(context);
    final String? error = _error;
    final double target = _isElder
        ? MzaziA11y.elderMinTouchTarget
        : MzaziA11y.standardMinTouchTarget;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        MzaziSpace.s16,
        MzaziSpace.s8,
        MzaziSpace.s16,
        MzaziSpace.s32,
      ),
      children: <Widget>[
        if (error != null) ...<Widget>[
          Notice(message: error, isError: true),
          const SizedBox(height: MzaziSpace.s16),
        ],
        if (view.items.isEmpty)
          Text('Nothing has been recorded yet.', style: theme.textTheme.bodyLarge),
        for (final ConsentItem item in view.items) ...<Widget>[
          SectionLabel(_title(item.kind)),
          Text(_meaning(item.kind), style: theme.textTheme.bodyLarge),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            _status(item),
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          // Help from volunteers is never given at registration, so it is agreed to here;
          // location and contact sharing can be agreed to again once withdrawn.
          if (!item.active && view.canWithdraw && item.kind != ConsentKind.dataProcessing)
            ...<Widget>[
              const SizedBox(height: MzaziSpace.s8),
              Align(
                alignment: Alignment.centerLeft,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minHeight: target),
                  child: FilledButton.tonal(
                    onPressed: _busy ? null : () => unawaited(_give(item)),
                    child: Text(_isElder ? 'Agree' : 'Agree for $_name'),
                  ),
                ),
              ),
            ],
          if (item.active && view.canWithdraw) ...<Widget>[
            const SizedBox(height: MzaziSpace.s8),
            Align(
              alignment: Alignment.centerLeft,
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: target),
                child: OutlinedButton(
                  onPressed: _busy ? null : () => unawaited(_withdraw(item)),
                  child: Text(
                    item.kind == ConsentKind.dataProcessing ? 'Stop MzaziCare' : 'Withdraw',
                  ),
                ),
              ),
            ),
          ],
          const SizedBox(height: MzaziSpace.s24),
        ],
        Text(
          _isElder
              ? 'In an emergency, the people helping you always see what they need to reach '
                    'you, whatever you have withdrawn.'
              : 'In an emergency, the people helping $_name always see what they need to '
                    'reach them, whatever has been withdrawn.',
          style: theme.textTheme.bodyMedium,
        ),
        if (!view.canWithdraw) ...<Widget>[
          const SizedBox(height: MzaziSpace.s12),
          Text(
            'Only $_name or their caregiver can withdraw these.',
            style: theme.textTheme.bodyMedium,
          ),
        ],
        const SizedBox(height: MzaziSpace.s16),
        // The whole notice, with what is kept, who sees it and for how long.
        const LegalLinks(),
      ],
    );
  }
}

const List<String> _months = <String>[
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

String _day(DateTime at) => '${at.day} ${_months[at.month - 1]} ${at.year}';
