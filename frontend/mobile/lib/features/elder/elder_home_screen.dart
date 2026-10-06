import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/sign_out_button.dart';
import 'alert_controller.dart';
import 'widgets/panic_button.dart';

/// The elder's whole app.
///
/// One screen with four states rather than four screens. Navigation is one more thing
/// to understand at the worst possible moment, and a person who has just pressed for
/// help should not have to recognise that they are somewhere new: the thing they
/// pressed is replaced, in place, by what happened next.
class ElderHomeScreen extends StatelessWidget {
  const ElderHomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AlertController alerts = context.watch<AlertController>();
    final AuthController auth = context.watch<AuthController>();

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(MzaziSpace.s24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              _Header(name: auth.account?.name ?? '', onSignOut: auth.signOut),
              const SizedBox(height: MzaziSpace.s24),
              Expanded(child: _Body(alerts: alerts)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.name, required this.onSignOut});

  final String name;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Row(
      children: <Widget>[
        Expanded(
          child: Text(name, style: theme.textTheme.titleLarge, overflow: TextOverflow.ellipsis),
        ),
        // The same control the caregiver's app bar uses, at the elder touch target. It
        // stays visually quiet next to the panic control because it is an icon rather
        // than a filled button, and it must never be mistaken for the one that matters.
        SignOutButton(onPressed: onSignOut, minSize: MzaziA11y.elderMinTouchTarget),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.alerts});

  final AlertController alerts;

  @override
  Widget build(BuildContext context) {
    return switch (alerts.phase) {
      AlertPhase.idle || AlertPhase.raising => _Idle(alerts: alerts),
      AlertPhase.cancellable => _Cancellable(alerts: alerts),
      AlertPhase.live => _Live(alerts: alerts),
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
              color: MzaziColorsLight.timer,
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
  const _Live({required this.alerts});

  final AlertController alerts;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Emergency? emergency = alerts.emergency;
    final String? owner = emergency?.acknowledgedByName;

    return Semantics(
      liveRegion: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('Help is on the way', style: theme.textTheme.headlineLarge),
          const SizedBox(height: MzaziSpace.s24),
          // Three steps, ticked off as they happen, the way a delivery is tracked. The
          // elder can see it moving without having to read a sentence closely, and
          // without anything to press.
          const _Step(done: true, text: 'Your call for help was sent'),
          _Step(
            done: emergency != null && emergency.state != EventState.triggered,
            text: 'The people who look after you have been told',
          ),
          _Step(
            done: owner != null,
            text: owner == null ? 'Waiting for someone to answer' : '$owner is coming',
          ),
          const SizedBox(height: MzaziSpace.s16),
          Text('Stay where you are if you can.', style: theme.textTheme.bodyLarge),
          const Spacer(),
          Text(
            'Someone will call you. You do not need to do anything else.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

/// One step of the progress list on the elder's screen. A tick when it has happened,
/// an empty circle when it has not, and the elder-size text either way; the screen
/// reader hears "done" or "not yet" first, so the shape is never the only signal.
class _Step extends StatelessWidget {
  const _Step({required this.done, required this.text});

  final bool done;
  final String text;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    // Bold either way, as all elder text is. A step not reached yet is set in the
    // softer text colour, which still meets the elder contrast target.
    final TextStyle? style = done
        ? theme.textTheme.bodyLarge
        : theme.textTheme.bodyLarge?.copyWith(color: theme.textTheme.bodySmall?.color);

    return Padding(
      padding: const EdgeInsets.only(bottom: MzaziSpace.s16),
      child: Semantics(
        label: '${done ? 'Done' : 'Not yet'}: $text',
        excludeSemantics: true,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Icon(
              done ? Icons.check_circle : Icons.radio_button_unchecked,
              size: 32,
              color: done
                  ? (theme.brightness == Brightness.dark
                        ? MzaziColorsDark.pillResolvedFg
                        : MzaziColorsLight.pillResolvedFg)
                  : theme.textTheme.bodySmall?.color,
            ),
            const SizedBox(width: MzaziSpace.s12),
            Expanded(child: Text(text, style: style)),
          ],
        ),
      ),
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
