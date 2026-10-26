import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/theme/theme.dart';
import '../../core/voice/voice_call.dart';
import '../../core/widgets/notice.dart';

/// A call with the elder through the app, for the person responding.
///
/// Laid out like the call screens people already know: who, how long, and three round
/// buttons at the bottom for mute, speaker and hang up, the red one last. The screen owns
/// the call, so leaving the screen by any route hangs up.
class CallScreen extends StatefulWidget {
  const CallScreen({required this.call, required this.elderName, super.key});

  final VoiceCall call;
  final String elderName;

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  /// The call this screen joined, kept even if the widget is rebuilt with another, so
  /// the one hung up is always the one that was joined.
  late final VoiceCall _call = widget.call;
  Timer? _clock;

  String get _first => widget.elderName.split(' ').first;

  @override
  void initState() {
    super.initState();
    _call.addListener(_changed);
    unawaited(_call.join());
    // Redraws the timer once a second; nothing else on the screen depends on it.
    _clock = Timer.periodic(const Duration(seconds: 1), (Timer _) {
      if (mounted && _call.since != null) setState(() {});
    });
  }

  void _changed() {
    if (_call.status == CallStatus.ended && mounted) {
      unawaited(Navigator.of(context).maybePop());
    }
  }

  @override
  void dispose() {
    _clock?.cancel();
    _call.removeListener(_changed);
    _call.dispose();
    super.dispose();
  }

  String _status(VoiceCall call) => switch (call.status) {
    CallStatus.idle || CallStatus.connecting => 'Connecting',
    CallStatus.waiting => 'Waiting for $_first to join',
    CallStatus.talking => 'On the call with ${call.others.join(' and ')}',
    CallStatus.ended => 'Call ended',
    CallStatus.failed => 'Not connected',
  };

  static String _elapsed(DateTime since) {
    final Duration gap = DateTime.now().difference(since);
    final String minutes = gap.inMinutes.toString().padLeft(2, '0');
    final String seconds = (gap.inSeconds % 60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return ListenableBuilder(
      listenable: _call,
      builder: (BuildContext context, Widget? _) {
        final VoiceCall call = _call;
        final DateTime? since = call.since;

        return Scaffold(
          appBar: AppBar(),
          body: SafeArea(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: MzaziLayout.margin(context)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  const SizedBox(height: MzaziSpace.s32),
                  Semantics(
                    header: true,
                    child: Text(
                      widget.elderName,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineLarge,
                    ),
                  ),
                  const SizedBox(height: MzaziSpace.s8),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      _status(call),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyLarge,
                    ),
                  ),
                  if (since != null) ...<Widget>[
                    const SizedBox(height: MzaziSpace.s8),
                    Text(
                      _elapsed(since),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.titleLarge?.figures,
                    ),
                  ],
                  const SizedBox(height: MzaziSpace.s24),
                  // The one thing worth knowing before speaking: who hears it, and how.
                  if (call.status == CallStatus.waiting || call.status == CallStatus.talking)
                    Text(
                      '$_first hears you on the phone\'s speaker if MzaziCare is open on it. '
                      'Say who you are first.',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium,
                    ),
                  if (call.status == CallStatus.failed) ...<Widget>[
                    Notice(message: call.error ?? 'The call could not connect.', isError: true),
                    const SizedBox(height: MzaziSpace.s16),
                    FilledButton(
                      onPressed: () => unawaited(call.join()),
                      child: const Text('Try again'),
                    ),
                  ],
                  const Spacer(),
                ],
              ),
            ),
          ),
          bottomNavigationBar: SafeArea(
            top: false,
            minimum: const EdgeInsets.fromLTRB(
              MzaziSpace.s24,
              MzaziSpace.s16,
              MzaziSpace.s24,
              MzaziSpace.s24,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: <Widget>[
                _RoundAction(
                  icon: call.muted ? Icons.mic_off : Icons.mic_none,
                  label: call.muted ? 'Unmute' : 'Mute',
                  selected: call.muted,
                  onPressed: call.isActive ? () => unawaited(call.toggleMute()) : null,
                ),
                _RoundAction(
                  icon: call.speaker ? Icons.volume_up : Icons.phone_in_talk_outlined,
                  label: call.speaker ? 'Speaker on' : 'Speaker',
                  selected: call.speaker,
                  onPressed: call.isActive ? () => unawaited(call.toggleSpeaker()) : null,
                ),
                _RoundAction(
                  icon: Icons.call_end,
                  label: 'End',
                  danger: true,
                  // Hanging up ends the call, and the ended call closes this screen.
                  onPressed: () => unawaited(call.leave()),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// A round button with its word under it, the shape of every phone's call controls.
class _RoundAction extends StatelessWidget {
  const _RoundAction({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.selected = false,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool selected;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ColorScheme colours = theme.colorScheme;
    final Color background = danger
        ? colours.error
        : (selected ? colours.primary : colours.surfaceContainerHighest);
    final Color foreground = danger
        ? colours.onError
        : (selected ? colours.onPrimary : colours.onSurface);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        IconButton(
          onPressed: onPressed,
          tooltip: label,
          icon: Icon(icon, size: 28),
          style: IconButton.styleFrom(
            backgroundColor: background,
            foregroundColor: foreground,
            disabledBackgroundColor: colours.surfaceContainerHighest,
            minimumSize: const Size(64, 64),
            shape: const CircleBorder(),
          ),
        ),
        const SizedBox(height: MzaziSpace.s8),
        ExcludeSemantics(child: Text(label, style: theme.textTheme.bodySmall)),
      ],
    );
  }
}
