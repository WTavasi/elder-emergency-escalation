import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/live/live_updates.dart';
import '../../core/offline/help_card.dart';
import '../../core/offline/sms_link.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/motion.dart';
import '../../core/widgets/notice.dart';
import '../consent/consent_screen.dart';
import '../responder/widgets/call_button.dart';
import 'alert_controller.dart';
import 'check_in_controller.dart';
import 'elder_me_screen.dart';
import 'offline_help.dart';
import 'widgets/countdown_ring.dart';
import 'widgets/elder_call.dart';
import 'widgets/help_progress.dart';
import 'widgets/panic_button.dart';

/// The elder's whole app.
///
/// One screen with five states rather than five screens. Navigation is one more thing
/// to understand at the worst possible moment, and a person who has just pressed for
/// help should not have to recognise that they are somewhere new: the thing they
/// pressed is replaced, in place, by what happened next.
///
/// The help button sits in the middle of the screen, and what replaces it (the countdown's
/// ring, the steps of help coming) appears in the same place. What the elder can do next,
/// stop the alert, text for help, go back, sits at the bottom, where a thumb holding the
/// phone reaches it.
class ElderHomeScreen extends StatefulWidget {
  const ElderHomeScreen({
    this.api,
    this.checkInPoll = const Duration(minutes: 2),
    this.helpCards,
    this.canOpenLink,
    this.openLink,
    super.key,
  });

  /// For the consent question, the daily check-in, the privacy page and the ways to ask
  /// for help without a connection. Without it, which only a test that exercises the
  /// alert alone does, none of them appears.
  final ApiClient? api;

  /// How often to look for a check-in when no push says one is waiting. Null for a test
  /// that drives it by hand.
  final Duration? checkInPoll;

  /// Where the numbers for asking without a connection are kept. Null means the phone's
  /// secure storage.
  final HelpCardStore? helpCards;

  /// The phone's dialler and messages app. Null means the real ones; tests pass their
  /// own to see what would have been opened.
  final CanOpen? canOpenLink;
  final Open? openLink;

  @override
  State<ElderHomeScreen> createState() => _ElderHomeScreenState();
}

class _ElderHomeScreenState extends State<ElderHomeScreen> {
  /// What was agreed on the elder's behalf, while they have not yet confirmed it.
  ConsentView? _toConfirm;

  /// The daily check-in, when there is an API to ask.
  CheckInController? _checkIns;
  AppLifecycleListener? _lifecycle;

  /// The ways to ask for help without MzaziCare, kept on the phone.
  OfflineHelp? _offline;

  @override
  void initState() {
    super.initState();
    unawaited(_checkConsent());

    final ApiClient? api = widget.api;
    final Account? account = context.read<AuthController>().account;
    final String? elderId = account?.id;
    if (api != null && account != null) {
      _offline = OfflineHelp(api: api, account: account, store: widget.helpCards)
        ..addListener(_offlineChanged);
      unawaited(_offline!.load());
    }
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
    _offline?.removeListener(_offlineChanged);
    _offline?.dispose();
    super.dispose();
  }

  void _offlineChanged() {
    if (mounted) setState(() {});
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
    final bool counting = alerts.phase == AlertPhase.cancellable;
    final bool unreachable = alerts.phase == AlertPhase.unreachable;
    final CheckInController? checkIns = _checkIns;
    final CheckInSchedule? toAgree = checkIns?.mine.waitingForAgreement;

    final Widget screen = Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (unreachable) const _NoConnectionBand(),
            Expanded(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  MzaziLayout.margin(context),
                  MzaziSpace.s24,
                  MzaziLayout.margin(context),
                  MzaziSpace.s24,
                ),
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
                      child: _Body(
                        alerts: alerts,
                        api: widget.api,
                        checkIns: checkIns,
                        offline: _offline,
                        account: auth.account,
                        canOpenLink: widget.canOpenLink,
                        openLink: widget.openLink,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );

    if (!counting) return screen;

    // The ten seconds to stop an alert are the one time this screen turns yellow, in
    // light and dark mode alike, so it reads as "something is happening and you can
    // still stop it" before a word is read. Dark status bar icons, to read on yellow.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark,
      child: Theme(data: MzaziTheme.caution(Theme.of(context)), child: screen),
    );
  }
}

/// Across the top while the phone cannot reach MzaziCare: yellow, like every other
/// "this did not go through", and worded for somebody who does not know what a server
/// is.
class _NoConnectionBand extends StatelessWidget {
  const _NoConnectionBand();

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    const Color ink = MzaziColorsLight.onCaution;

    return Semantics(
      liveRegion: true,
      child: ColoredBox(
        color: MzaziColorsLight.caution,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s24, vertical: MzaziSpace.s12),
          child: Row(
            children: <Widget>[
              const Icon(Icons.signal_cellular_connected_no_internet_4_bar, color: ink),
              const SizedBox(width: MzaziSpace.s12),
              Expanded(
                child: Text(
                  'No connection',
                  style: theme.textTheme.titleMedium?.copyWith(color: ink),
                ),
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
                height: MzaziSizes.of(context).control,
                child: OutlinedButton(onPressed: onRead, child: const Text('Read it')),
              ),
            ),
            const SizedBox(width: MzaziSpace.s12),
            Expanded(
              child: SizedBox(
                height: MzaziSizes.of(context).control,
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
            constraints: BoxConstraints(
              minWidth: MzaziSizes.of(context).target,
              minHeight: MzaziSizes.of(context).target,
            ),
            iconSize: MzaziSizes.of(context).target / 2.4,
          ),
      ],
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.alerts,
    this.api,
    this.checkIns,
    this.offline,
    this.account,
    this.canOpenLink,
    this.openLink,
  });

  final AlertController alerts;
  final ApiClient? api;
  final CheckInController? checkIns;
  final OfflineHelp? offline;
  final Account? account;
  final CanOpen? canOpenLink;
  final Open? openLink;

  @override
  Widget build(BuildContext context) {
    final bool fromCheckIn = alerts.emergency?.fromMissedCheckIn ?? false;

    return switch (alerts.phase) {
      AlertPhase.idle || AlertPhase.raising => _Idle(alerts: alerts, checkIns: checkIns),
      AlertPhase.unreachable => _Unreachable(
        alerts: alerts,
        card: offline?.card,
        message: offline?.familyMessage,
        home: account?.home?.addressLabel,
        canOpen: canOpenLink,
        open: openLink,
      ),
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
    final String? error = alerts.error;
    final CheckInController? checking = checkIns;
    final CheckIn? waiting = checking?.mine.waiting;
    final CheckInAnswer? answered = checking?.answer;

    final bool sending = alerts.phase == AlertPhase.raising;

    return _CircleStage(
      // Above the button, never in its place: "are you all right?" is one press away,
      // and so is help. The words sit just over the circle, where the countdown's heading
      // will be read, so they are read before the press rather than after it.
      above: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (error != null) ...<Widget>[
            Notice(message: error, isError: true),
            const SizedBox(height: MzaziSpace.s16),
          ],
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
          _HelpCaption(sending: sending),
        ],
      ),
      circle: PanicButton(
        // Words, not a spinner, while the request travels: the button greys and says what
        // it is doing, so a second press is not needed to find out.
        label: sending ? 'Sending…' : 'Get\nhelp',
        enabled: alerts.canRaise,
        onPressed: alerts.raise,
      ),
    );
  }
}

/// The layout the help button and the countdown that replaces it share, so the circle is
/// the same size in the same place on both screens: pressing the button turns the red
/// disc into the countdown's ring where it was, and the eye never has to move.
///
/// Above the circle, what each screen says; below it, the countdown's way out, which the
/// help button has no need of. Each band is held at the height of the taller of the two
/// screens' contents, measured at this width and text size, so the circle's slot, and the
/// circle in it, is identical whichever screen is showing. Only something the idle screen
/// adds above its words, a check-in question or an error, can make that band taller.
class _CircleStage extends StatelessWidget {
  const _CircleStage({required this.circle, this.above, this.below});

  final Widget circle;
  final Widget? above;
  final Widget? below;

  /// The smallest circle the stage will lay out before it scrolls instead.
  static const double _floor = MzaziA11y.elderMinTouchTarget * 2;

  /// How tall [text] sets in [style] at [width], as a Text widget would set it.
  static double _height(
    String text,
    TextStyle? style,
    double width,
    TextScaler scaler, {
    TextAlign align = TextAlign.start,
  }) {
    final TextPainter painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textAlign: align,
      textDirection: TextDirection.ltr,
      textScaler: scaler,
    )..layout(maxWidth: width);
    final double height = painter.height;
    painter.dispose();
    return height;
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final TextScaler scaler = MediaQuery.textScalerOf(context);

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double width = constraints.maxWidth;
        final double heading = math.max(
          _height(_CountdownHeading.title, theme.textTheme.headlineLarge, width, scaler) +
              MzaziSpace.s12 +
              _height(_CountdownHeading.body, theme.textTheme.bodyLarge, width, scaler),
          _height(
            _HelpCaption.waiting,
            theme.textTheme.bodyLarge,
            width,
            scaler,
            align: TextAlign.center,
          ),
        );
        // The countdown's way out is a full touch target tall.
        final double wayOut = MzaziSizes.of(context).control;

        final List<Widget> bands = <Widget>[
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: heading),
            child: above ?? const SizedBox.shrink(),
          ),
          const SizedBox(height: MzaziSpace.s24),
        ];
        final List<Widget> foot = <Widget>[
          const SizedBox(height: MzaziSpace.s24),
          ConstrainedBox(
            constraints: BoxConstraints(minHeight: wayOut),
            child: Align(
              alignment: Alignment.bottomCenter,
              heightFactor: 1,
              child: below ?? const SizedBox.shrink(),
            ),
          ),
        ];

        // On a very small screen at the elder's text size the words leave too little room
        // for a circle worth pressing. Then the circle keeps a floor and the screen scrolls,
        // rather than the button shrinking to a dot or the layout overflowing. Both screens
        // reach the same answer, so the circle still matches.
        final double room = constraints.maxHeight - heading - wayOut - MzaziSpace.s24 * 2;
        if (room < _floor) {
          return SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                ...bands,
                SizedBox(height: _floor, child: circle),
                ...foot,
              ],
            ),
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            ...bands,
            Expanded(child: circle),
            ...foot,
          ],
        );
      },
    );
  }
}

/// What the help button does, said over it.
class _HelpCaption extends StatelessWidget {
  const _HelpCaption({required this.sending});

  final bool sending;

  static const String waiting =
      'Press the red circle and the people who look after you will be told straight away.';
  static const String sent = 'Sending your alert…';

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: sending,
    child: Text(
      sending ? sent : waiting,
      textAlign: TextAlign.center,
      style: Theme.of(context).textTheme.bodyLarge,
    ),
  );
}

/// What the countdown screen says above its ring.
class _CountdownHeading extends StatelessWidget {
  const _CountdownHeading();

  static const String title = 'Help is on the way';
  static const String body =
      'Your caregiver has been told. If you pressed by mistake, you can stop this.';

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return Semantics(
      liveRegion: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(title, style: theme.textTheme.headlineLarge),
          const SizedBox(height: MzaziSpace.s12),
          Text(body, style: theme.textTheme.bodyLarge),
        ],
      ),
    );
  }
}

/// The ten seconds in which a pressed alert can still be withdrawn.
///
/// The alert has already gone: tier one is told at the press, because ten seconds on
/// every real emergency is a worse trade than an occasional withdrawn one. So the screen
/// says help is on the way and offers the way out, rather than counting down to sending
/// as a phone's SOS does.
///
/// It is told three ways at once, for whoever is holding the phone: the screen turns
/// yellow, a ring empties around the seconds left, and the phone gives a light tap each
/// second, which can be felt with the phone face down or the screen unread. The way out
/// is at the bottom, under the thumb, in the darkest ink on the screen.
class _Cancellable extends StatefulWidget {
  const _Cancellable({required this.alerts});

  final AlertController alerts;

  @override
  State<_Cancellable> createState() => _CancellableState();
}

class _CancellableState extends State<_Cancellable> {
  late int _felt = widget.alerts.secondsLeft;

  @override
  void didUpdateWidget(covariant _Cancellable oldWidget) {
    super.didUpdateWidget(oldWidget);
    final int left = widget.alerts.secondsLeft;
    if (left != _felt && left > 0) unawaited(Haptics.tick());
    _felt = left;
  }

  @override
  Widget build(BuildContext context) {
    final AlertController alerts = widget.alerts;

    return _CircleStage(
      above: const _CountdownHeading(),
      circle: CountdownRing(secondsLeft: alerts.secondsLeft, total: alerts.cancelWindow.inSeconds),
      below: SizedBox(
        height: MzaziSizes.of(context).control,
        child: FilledButton(
          onPressed: alerts.cancel,
          // The inverse of the screen: yellow on the dark ink, at 12.7:1, so the one thing
          // to press is the heaviest thing on it. Not red: stopping an alert is not an
          // emergency.
          style: FilledButton.styleFrom(
            backgroundColor: MzaziColorsLight.onCaution,
            foregroundColor: MzaziColorsLight.caution,
          ),
          // Says what it does, in the words the person would use. "Cancel" alone is
          // ambiguous when the thing on screen is already called a cancellation.
          child: const Text('I am all right, stop this'),
        ),
      ),
    );
  }
}

/// The press did not reach MzaziCare, and the other ways to ask for help.
///
/// Nothing on this screen needs the internet. Texting HELP to MzaziCare's shortcode
/// raises the full alert through the gateway when the phone has signal but no data.
/// Texting the family reaches them directly even when MzaziCare cannot, and calling
/// needs nothing but signal. Each opens the phone's own messages app or dialler with
/// everything filled in, so it is two presses: this one, and send or call.
///
/// The address is shown because it is the first thing anybody on the other end of a
/// call will ask, and it is on the phone already.
///
/// The alert keeps being tried in the background meanwhile, and the screen moves on by
/// itself when it goes through.
class _Unreachable extends StatelessWidget {
  const _Unreachable({
    required this.alerts,
    this.card,
    this.message,
    this.home,
    this.canOpen,
    this.open,
  });

  final AlertController alerts;
  final HelpCard? card;
  final String? message;
  final String? home;
  final CanOpen? canOpen;
  final Open? open;

  /// Kenya's emergency number, the one the rest of the app and every alert text give.
  static const String emergencyNumber = '999';

  Future<void> _text(BuildContext context, List<String> to, String body) async {
    final Uri uri = smsLink(to, body);
    final Open go = open ?? launchUrl;
    try {
      if (await go(uri)) return;
    } on Exception {
      // Told below, the same as a phone that has no messages app.
    }
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('This phone cannot send a text. Call $emergencyNumber instead.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final HelpByText? byText = card?.helpByText;
    final List<String> family = <String>[
      for (final Carer carer in card?.carers ?? const <Carer>[])
        if (carer.phone.isNotEmpty) carer.phone,
    ];
    final Carer? first = card?.first;
    final String body = message ?? 'HELP';
    final String? address = home;

    // The shortcode first when there is one, because it reaches everybody the button
    // would have, in order, and escalates. The family directly otherwise.
    final List<Widget> texts = <Widget>[
      if (byText != null)
        _Action(
          primary: true,
          icon: Icons.sms_outlined,
          label: 'Text ${byText.word} to MzaziCare',
          onPressed: () => unawaited(_text(context, <String>[byText.number], byText.word)),
        ),
      if (family.isNotEmpty)
        _Action(
          primary: byText == null,
          icon: Icons.sms_outlined,
          label: 'Text my family',
          onPressed: () => unawaited(_text(context, family, body)),
        ),
    ];

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: IntrinsicHeight(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Semantics(
                  liveRegion: true,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      Text('Not sent yet', style: theme.textTheme.headlineLarge),
                      const SizedBox(height: MzaziSpace.s8),
                      Text(
                        'Your phone cannot reach MzaziCare. It will keep trying. '
                        'Ask for help another way now:',
                        style: theme.textTheme.bodyLarge,
                      ),
                    ],
                  ),
                ),
                if (address != null && address.isNotEmpty) ...<Widget>[
                  const SizedBox(height: MzaziSpace.s12),
                  Text('Your address: $address', style: theme.textTheme.titleMedium),
                ],
                // Away from the thumb, so it is not pressed on the way to the others.
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton(
                    onPressed: alerts.stopTrying,
                    child: const Text('I am all right, stop trying'),
                  ),
                ),
                const SizedBox(height: MzaziSpace.s16),
                const Spacer(),
                for (final Widget action in texts) ...<Widget>[
                  action,
                  const SizedBox(height: MzaziSpace.s12),
                ],
                // As tall as the taller of the two, so the pair is even whatever the names.
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      if (first != null && first.phone.isNotEmpty) ...<Widget>[
                        Expanded(
                          child: ConstrainedBox(
                            constraints: BoxConstraints(minHeight: MzaziSizes.of(context).control),
                            child: CallButton(
                              name: first.name,
                              phone: first.phone,
                              stacked: true,
                              canOpen: canOpen,
                              open: open,
                            ),
                          ),
                        ),
                        const SizedBox(width: MzaziSpace.s12),
                      ],
                      Expanded(
                        child: ConstrainedBox(
                          constraints: BoxConstraints(minHeight: MzaziSizes.of(context).control),
                          child: CallButton(
                            name: emergencyNumber,
                            phone: emergencyNumber,
                            stacked: true,
                            canOpen: canOpen,
                            open: open,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// One way to ask for help from [_Unreachable]: the first in red, because it is the
/// emergency action on that screen, and the rest outlined.
class _Action extends StatelessWidget {
  const _Action({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.primary = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MzaziSizes.of(context).control,
      child: primary
          ? FilledButton.icon(onPressed: onPressed, icon: Icon(icon), label: Text(label))
          : OutlinedButton.icon(onPressed: onPressed, icon: Icon(icon), label: Text(label)),
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
            height: MzaziSizes.of(context).control,
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
          height: MzaziSizes.of(context).control,
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
                height: MzaziSizes.of(context).control,
                child: OutlinedButton(
                  onPressed: busy ? null : onYes,
                  child: const Text('Yes, check on me'),
                ),
              ),
            ),
            const SizedBox(width: MzaziSpace.s12),
            Expanded(
              child: SizedBox(
                height: MzaziSizes.of(context).control,
                child: TextButton(
                  onPressed: busy ? null : onNo,
                  child: const Text('No, thank you'),
                ),
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
          height: MzaziSizes.of(context).control,
          child: FilledButton(
            onPressed: alerts.reset,
            child: const Text('Back to the help button'),
          ),
        ),
      ],
    );
  }
}
