import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/widgets/notice.dart';
import '../consent/consent_screen.dart';
import 'alert_controller.dart';
import 'elder_me_screen.dart';
import 'widgets/elder_call.dart';
import 'widgets/help_progress.dart';
import 'widgets/panic_button.dart';

/// The elder's whole app.
///
/// One screen with four states rather than four screens. Navigation is one more thing
/// to understand at the worst possible moment, and a person who has just pressed for
/// help should not have to recognise that they are somewhere new: the thing they
/// pressed is replaced, in place, by what happened next.
class ElderHomeScreen extends StatefulWidget {
  const ElderHomeScreen({this.api, super.key});

  /// For the consent question and the privacy page. Without it, which only a test that
  /// exercises the alert alone does, neither appears.
  final ApiClient? api;

  @override
  State<ElderHomeScreen> createState() => _ElderHomeScreenState();
}

class _ElderHomeScreenState extends State<ElderHomeScreen> {
  /// What was agreed on the elder's behalf, while they have not yet confirmed it.
  ConsentView? _toConfirm;

  @override
  void initState() {
    super.initState();
    unawaited(_checkConsent());
  }

  /// Asks, once each time the app opens, until the elder has confirmed for themselves.
  /// Never in the way: it is a line above the panic button, not a screen in front of it.
  Future<void> _checkConsent() async {
    final ApiClient? api = widget.api;
    final String? elderId = context.read<AuthController>().account?.id;
    if (api == null || elderId == null) return;

    try {
      final ConsentView view = await api.consent(elderId);
      if (mounted && view.needsConfirmation) setState(() => _toConfirm = view);
    } on ApiException {
      // Asked again the next time the app opens.
    } on NetworkException {
      // Likewise. Nothing about consent may stand between the elder and the button.
    }
  }

  Future<void> _openConsent({ConsentView? initial}) async {
    final ApiClient? api = widget.api;
    final AuthController auth = context.read<AuthController>();
    final String? elderId = auth.account?.id;
    if (api == null || elderId == null) return;

    setState(() => _toConfirm = null);
    await Navigator.of(context).push(
      MaterialPageRoute<bool>(
        builder: (_) => ConsentScreen(
          api: api,
          elderId: elderId,
          audience: ConsentAudience.elder,
          firstSignIn: initial != null,
          initial: initial,
          onServiceEnded: () => unawaited(auth.signOut()),
        ),
      ),
    );
  }

  /// Null without an API, which only a test that exercises the alert alone builds.
  VoidCallback? get _openMe {
    final ApiClient? api = widget.api;
    if (api == null) return null;
    return () => unawaited(
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ElderMeScreen(api: api))),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AlertController alerts = context.watch<AlertController>();
    final AuthController auth = context.watch<AuthController>();
    final ConsentView? toConfirm = _toConfirm;
    final bool idle = alerts.phase == AlertPhase.idle || alerts.phase == AlertPhase.raising;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(MzaziSpace.s24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _Header(name: auth.account?.name ?? '', onMe: _openMe),
              if (toConfirm != null && idle) ...<Widget>[
                const SizedBox(height: MzaziSpace.s16),
                _ConsentQuestion(
                  onRead: () => unawaited(_openConsent(initial: toConfirm)),
                  onLater: () => setState(() => _toConfirm = null),
                ),
              ],
              const SizedBox(height: MzaziSpace.s24),
              Expanded(child: _Body(alerts: alerts, api: widget.api)),
            ],
          ),
        ),
      ),
    );
  }
}

/// The first-sign-in question, as a line above the panic button rather than a screen in
/// front of it.
class _ConsentQuestion extends StatelessWidget {
  const _ConsentQuestion({required this.onRead, required this.onLater});

  final VoidCallback onRead;
  final VoidCallback onLater;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          'Before you start, please read what was agreed for you.',
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: MzaziSpace.s8),
        Row(
          children: <Widget>[
            Expanded(
              child: SizedBox(
                height: MzaziA11y.elderMinTouchTarget,
                child: OutlinedButton(onPressed: onRead, child: const Text('Read it')),
              ),
            ),
            const SizedBox(width: MzaziSpace.s12),
            Expanded(
              child: SizedBox(
                height: MzaziA11y.elderMinTouchTarget,
                child: TextButton(onPressed: onLater, child: const Text('Not now')),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.name, this.onMe});

  final String name;
  final VoidCallback? onMe;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final VoidCallback? me = onMe;

    return Row(
      children: <Widget>[
        Expanded(
          child: Text(name, style: theme.textTheme.titleLarge, overflow: TextOverflow.ellipsis),
        ),
        // One quiet control: the elder's own page, with privacy and signing out behind
        // it. Nothing next to the panic control can end the session in one tap.
        if (me != null)
          IconButton(
            onPressed: me,
            icon: const Icon(Icons.account_circle_outlined, semanticLabel: 'You and your privacy'),
            tooltip: 'You and your privacy',
            constraints: const BoxConstraints(
              minWidth: MzaziA11y.elderMinTouchTarget,
              minHeight: MzaziA11y.elderMinTouchTarget,
            ),
            iconSize: MzaziA11y.elderMinTouchTarget / 2.4,
          ),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.alerts, this.api});

  final AlertController alerts;
  final ApiClient? api;

  @override
  Widget build(BuildContext context) {
    return switch (alerts.phase) {
      AlertPhase.idle || AlertPhase.raising => _Idle(alerts: alerts),
      AlertPhase.cancellable => _Cancellable(alerts: alerts),
      AlertPhase.live => _Live(alerts: alerts, api: api),
      AlertPhase.cancelled => _Finished(
        alerts: alerts,
        headline: 'Cancelled',
        detail: 'Nobody is being called. You can press for help again at any time.',
      ),
      AlertPhase.closed => _Finished(
        alerts: alerts,
        headline: 'This is finished',
        detail: 'Your emergency has been closed. You can press for help again at any time.',
      ),
    };
  }
}

class _Idle extends StatelessWidget {
  const _Idle({required this.alerts});

  final AlertController alerts;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? error = alerts.error;

    return Column(
      children: <Widget>[
        if (error != null) ...<Widget>[
          Notice(message: error, isError: true),
          const SizedBox(height: MzaziSpace.s16),
        ],
        Expanded(
          child: PanicButton(label: 'Get\nhelp', enabled: alerts.canRaise, onPressed: alerts.raise),
        ),
        const SizedBox(height: MzaziSpace.s24),
        Text(
          'Press the red circle and the people who look after you will be told straight away.',
          textAlign: TextAlign.center,
          style: theme.textTheme.bodyLarge,
        ),
      ],
    );
  }
}

class _Cancellable extends StatelessWidget {
  const _Cancellable({required this.alerts});

  final AlertController alerts;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Semantics(
          liveRegion: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text('Help is on the way', style: theme.textTheme.headlineLarge),
              const SizedBox(height: MzaziSpace.s12),
              Text(
                'Your caregiver has been told. If you pressed by mistake, you can stop this.',
                style: theme.textTheme.bodyLarge,
              ),
            ],
          ),
        ),
        const Spacer(),
        // The number is the thing being read under pressure, so it is set at display
        // size in the monospaced face, where a changing digit does not move the ones
        // beside it.
        Center(
          child: Text(
            '${alerts.secondsLeft}',
            style: theme.textTheme.displayLarge?.copyWith(
              fontFamily: MzaziFont.mono,
              // The theme's own timer colour. It was the light one in both modes, which
              // put the number an elder reads under pressure at 2.3:1 in dark mode.
              color: theme.brightness == Brightness.dark
                  ? MzaziColorsDark.timer
                  : MzaziColorsLight.timer,
            ),
            semanticsLabel: '${alerts.secondsLeft} seconds left to stop this',
          ),
        ),
        const Spacer(),
        SizedBox(
          height: MzaziA11y.elderMinTouchTarget,
          child: OutlinedButton(
            onPressed: alerts.cancel,
            // Says what it does, in the words the person would use. "Cancel" alone is
            // ambiguous when the thing on screen is already called a cancellation.
            child: const Text('I am all right, stop this'),
          ),
        ),
      ],
    );
  }
}

class _Live extends StatelessWidget {
  const _Live({required this.alerts, this.api});

  final AlertController alerts;
  final ApiClient? api;

  @override
  Widget build(BuildContext context) {
    final ApiClient? client = api;
    // Without an API, which only a test of the alert alone builds, there is no calling.
    if (client == null) return HelpProgress(emergency: alerts.emergency);
    return ElderCall(emergency: alerts.emergency, api: client);
  }
}

class _Finished extends StatelessWidget {
  const _Finished({required this.alerts, required this.headline, required this.detail});

  final AlertController alerts;
  final String headline;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Semantics(
          liveRegion: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(headline, style: theme.textTheme.headlineLarge),
              const SizedBox(height: MzaziSpace.s12),
              Text(detail, style: theme.textTheme.bodyLarge),
            ],
          ),
        ),
        const Spacer(),
        SizedBox(
          height: MzaziA11y.elderMinTouchTarget,
          child: FilledButton(
            onPressed: alerts.reset,
            child: const Text('Back to the help button'),
          ),
        ),
      ],
    );
  }
}
