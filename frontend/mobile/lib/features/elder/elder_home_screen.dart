import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/live/live_updates.dart';
import '../../core/widgets/notice.dart';
import '../consent/consent_screen.dart';
import 'alert_controller.dart';
import 'check_in_controller.dart';
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
  const ElderHomeScreen({this.api, this.checkInPoll = const Duration(minutes: 2), super.key});

  /// For the consent question, the daily check-in and the privacy page. Without it,
  /// which only a test that exercises the alert alone does, none of them appears.
  final ApiClient? api;

  /// How often to look for a check-in when no push says one is waiting. Null for a test
  /// that drives it by hand.
  final Duration? checkInPoll;

  @override
  State<ElderHomeScreen> createState() => _ElderHomeScreenState();
}

class _ElderHomeScreenState extends State<ElderHomeScreen> {
  /// What was agreed on the elder's behalf, while they have not yet confirmed it.
  ConsentView? _toConfirm;

  /// The daily check-in, when there is an API to ask.
  CheckInController? _checkIns;
  AppLifecycleListener? _lifecycle;

  @override
  void initState() {
    super.initState();
    unawaited(_checkConsent());

    final ApiClient? api = widget.api;
    final String? elderId = context.read<AuthController>().account?.id;
    if (api != null && elderId != null) {
      _checkIns = CheckInController(
        api: api,
        elderId: elderId,
        live: LiveUpdates.maybeOf(context),
        pollInterval: widget.checkInPoll,
      )..addListener(_checkInsChanged);
      _checkIns!.start();
      // Back in front after the phone was put down: the check-in may have been asked,
      // or missed and raised an alert, while the screen was away.
      _lifecycle = AppLifecycleListener(onResume: _lookAgain);
    }
  }

  @override
  void dispose() {
    _lifecycle?.dispose();
    _checkIns?.removeListener(_checkInsChanged);
    _checkIns?.dispose();
    super.dispose();
  }

  void _lookAgain() {
    if (!mounted) return;
    unawaited(_checkIns?.refresh());
    unawaited(context.read<AlertController>().resume());
  }

  /// A check-in that was missed has raised an alert. If this screen is still showing the
  /// help button, it picks that alert up, so the elder sees what their family was told.
  void _checkInsChanged() {
    if (!mounted) return;
    final CheckIn? checkIn = _checkIns?.mine.checkIn;
    final AlertController alerts = context.read<AlertController>();
    if (checkIn?.status == CheckInStatus.missed && alerts.phase == AlertPhase.idle) {
      unawaited(alerts.resume());
    }
    setState(() {});
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
    final CheckInController? checkIns = _checkIns;
    final CheckInSchedule? toAgree = checkIns?.mine.waitingForAgreement;

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
              if (checkIns != null && toAgree != null && idle) ...<Widget>[
                const SizedBox(height: MzaziSpace.s16),
                _CheckInSetUpQuestion(
                  schedule: toAgree,
                  busy: checkIns.busy,
                  onYes: () => unawaited(checkIns.agree(yes: true)),
                  onNo: () => unawaited(checkIns.agree(yes: false)),
                ),
              ],
              const SizedBox(height: MzaziSpace.s24),
              Expanded(
                child: _Body(alerts: alerts, api: widget.api, checkIns: checkIns),
              ),
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
  const _Body({required this.alerts, this.api, this.checkIns});

  final AlertController alerts;
  final ApiClient? api;
  final CheckInController? checkIns;

  @override
  Widget build(BuildContext context) {
    final bool fromCheckIn = alerts.emergency?.fromMissedCheckIn ?? false;

    return switch (alerts.phase) {
      AlertPhase.idle || AlertPhase.raising => _Idle(alerts: alerts, checkIns: checkIns),
      AlertPhase.cancellable => _Cancellable(alerts: alerts),
      AlertPhase.live => _Live(alerts: alerts, api: api, checkIns: checkIns),
      // Withdrawn by answering the check-in late, rather than by pressing "stop".
      AlertPhase.cancelled when fromCheckIn => _Finished(
        alerts: alerts,
        headline: 'Thank you',
        detail: 'Your family has been told you are all right. You can press for help at any time.',
      ),
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
  const _Idle({required this.alerts, this.checkIns});

  final AlertController alerts;
  final CheckInController? checkIns;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? error = alerts.error;
    final CheckInController? checking = checkIns;
    final CheckIn? waiting = checking?.mine.waiting;
    final CheckInAnswer? answered = checking?.answer;

    return Column(
      children: <Widget>[
        if (error != null) ...<Widget>[
          Notice(message: error, isError: true),
          const SizedBox(height: MzaziSpace.s16),
        ],
        // Above the button, never in its place: "are you all right?" is one press away,
        // and so is help.
        if (checking != null && waiting != null) ...<Widget>[
          _CheckInPrompt(
            busy: checking.busy,
            error: checking.error,
            onAnswer: () => unawaited(checking.answerNow()),
          ),
          const SizedBox(height: MzaziSpace.s16),
        ] else if (answered != null && answered != CheckInAnswer.nothing) ...<Widget>[
          const Notice(message: 'Thank you. Your family can see you are all right.'),
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
  const _Live({required this.alerts, this.api, this.checkIns});

  final AlertController alerts;
  final ApiClient? api;
  final CheckInController? checkIns;

  @override
  Widget build(BuildContext context) {
    final ApiClient? client = api;
    // Without an API, which only a test of the alert alone builds, there is no calling.
    final Widget progress = client == null
        ? HelpProgress(emergency: alerts.emergency)
        : ElderCall(emergency: alerts.emergency, api: client);

    final CheckInController? checking = checkIns;
    final Emergency? emergency = alerts.emergency;
    if (checking == null || emergency == null || !emergency.fromMissedCheckIn) return progress;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        _MissedCheckIn(
          answered: checking.answer,
          busy: checking.busy,
          error: checking.error,
          coming: emergency.acknowledgedByName,
          onAnswer: () async {
            final CheckInAnswer? outcome = await checking.answerNow();
            // Withdrawn: the alert has closed, and the screen should say so now.
            if (outcome == CheckInAnswer.withdrawn) await alerts.checkNow();
          },
        ),
        const SizedBox(height: MzaziSpace.s16),
        Expanded(child: progress),
      ],
    );
  }
}

/// "Are you all right?", above the help button while a check-in is waiting.
class _CheckInPrompt extends StatelessWidget {
  const _CheckInPrompt({required this.busy, required this.onAnswer, this.error});

  final bool busy;
  final String? error;
  final VoidCallback onAnswer;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? failure = error;

    return Semantics(
      liveRegion: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('Are you all right?', style: theme.textTheme.headlineSmall),
          const SizedBox(height: MzaziSpace.s4),
          Text(
            'Your family would like to know. Press below if you are.',
            style: theme.textTheme.bodyLarge,
          ),
          if (failure != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s8),
            Notice(message: failure, isError: true),
          ],
          const SizedBox(height: MzaziSpace.s12),
          SizedBox(
            height: MzaziA11y.elderMinTouchTarget,
            child: FilledButton(
              onPressed: busy ? null : onAnswer,
              child: const Text('I am all right'),
            ),
          ),
        ],
      ),
    );
  }
}

/// On an alert raised because a check-in went unanswered: what happened, and the one
/// thing the elder can do about it.
class _MissedCheckIn extends StatelessWidget {
  const _MissedCheckIn({
    required this.busy,
    required this.onAnswer,
    this.answered,
    this.error,
    this.coming,
  });

  final CheckInAnswer? answered;
  final bool busy;
  final String? error;

  /// Who has taken it on, if anybody has.
  final String? coming;
  final VoidCallback onAnswer;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? failure = error;

    // Answered, and somebody was already coming: they still come, and they know.
    if (answered == CheckInAnswer.noted) {
      return Semantics(
        liveRegion: true,
        child: Text(
          coming == null
              ? 'Thank you. Your family can see you answered.'
              : 'Thank you. $coming is still coming, and can see you answered.',
          style: theme.textTheme.bodyLarge,
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          'You did not answer the check-in, so your family has been told.',
          style: theme.textTheme.bodyLarge,
        ),
        if (failure != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Notice(message: failure, isError: true),
        ],
        const SizedBox(height: MzaziSpace.s12),
        SizedBox(
          height: MzaziA11y.elderMinTouchTarget,
          child: OutlinedButton(
            onPressed: busy ? null : onAnswer,
            child: const Text('I am all right'),
          ),
        ),
      ],
    );
  }
}

/// Somebody in the circle set up a daily check-in. Nothing is asked until the elder
/// says yes here, on their own phone.
class _CheckInSetUpQuestion extends StatelessWidget {
  const _CheckInSetUpQuestion({
    required this.schedule,
    required this.busy,
    required this.onYes,
    required this.onNo,
  });

  final CheckInSchedule schedule;
  final bool busy;
  final VoidCallback onYes;
  final VoidCallback onNo;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String who = schedule.setByName?.split(' ').first ?? 'Your family';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          '$who would like MzaziCare to check on you every day at ${schedule.timesInWords}. '
          'If you do not answer within ${schedule.graceMinutes} minutes, your family is told. '
          'Is that all right?',
          style: theme.textTheme.bodyLarge,
        ),
        const SizedBox(height: MzaziSpace.s8),
        Row(
          children: <Widget>[
            Expanded(
              child: SizedBox(
                height: MzaziA11y.elderMinTouchTarget,
                child: OutlinedButton(
                  onPressed: busy ? null : onYes,
                  child: const Text('Yes, check on me'),
                ),
              ),
            ),
            const SizedBox(width: MzaziSpace.s12),
            Expanded(
              child: SizedBox(
                height: MzaziA11y.elderMinTouchTarget,
                child: TextButton(onPressed: busy ? null : onNo, child: const Text('No, thank you')),
              ),
            ),
          ],
        ),
      ],
    );
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
