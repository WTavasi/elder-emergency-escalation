import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/models.dart';
import '../../../core/voice/voice_call.dart';
import '../../../core/voice/voice_room.dart';
import '../../../core/widgets/motion.dart';
import '../../../core/widgets/notice.dart';
import 'help_progress.dart';

/// The elder's screen while help is coming, with talking through the app.
///
/// When somebody responding starts a call, the phone buzzes once a second for a few
/// seconds while it says who is joining, then joins on the speaker by itself. An elder
/// who has fallen should not have to reach the phone and answer it. "Not now" stops it,
/// and a large "End call" is there for the whole call. Joining again is one press.
///
/// The microphone is only ever opened by this, during an emergency the elder raised,
/// after somebody in their circle asked to talk. Nothing said is recorded.
class ElderCall extends StatefulWidget {
  const ElderCall({
    required this.emergency,
    required this.api,
    this.room,
    this.countdown = const Duration(seconds: 3),
    super.key,
  });

  final Emergency? emergency;
  final ApiClient api;

  /// How a voice room is made. Null means the real one; tests pass their own.
  final VoiceRoom Function()? room;

  /// How long the elder is told who is joining before the call opens.
  final Duration countdown;

  @override
  State<ElderCall> createState() => _ElderCallState();
}

class _ElderCallState extends State<ElderCall> {
  VoiceCall? _call;
  Timer? _ticker;
  int _secondsLeft = 0;

  /// The call already announced, so a refresh does not announce it again.
  DateTime? _announced;

  Voice get _voice => widget.emergency?.voice ?? Voice.off;
  String get _who => _voice.startedBy ?? 'Someone';

  @override
  void initState() {
    super.initState();
    _consider();
  }

  @override
  void didUpdateWidget(covariant ElderCall oldWidget) {
    super.didUpdateWidget(oldWidget);
    _consider();
  }

  /// Announces a call the first time this screen sees it started.
  void _consider() {
    final Voice voice = _voice;
    if (!voice.hasStarted || voice.startedAt == _announced) return;
    if (_call?.isActive ?? false) return;
    _announced = voice.startedAt;
    _secondsLeft = widget.countdown.inSeconds;
    unawaited(Haptics.attention());
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (Timer timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() => _secondsLeft -= 1);
      if (_secondsLeft <= 0) {
        timer.cancel();
        _ticker = null;
        _join();
      } else {
        unawaited(Haptics.attention());
      }
    });
  }

  void _join() {
    _ticker?.cancel();
    _ticker = null;
    final String? eventId = widget.emergency?.id;
    if (eventId == null) return;
    VoiceCall? call = _call;
    if (call == null) {
      call = VoiceCall(
        api: widget.api,
        eventId: eventId,
        // The phone may be on a table or the floor, so the loudspeaker, always.
        speakerFirst: true,
        room: widget.room,
      );
      call.addListener(_changed);
      _call = call;
    }
    unawaited(call.join());
    setState(() {});
  }

  void _notNow() {
    _ticker?.cancel();
    setState(() {
      _ticker = null;
    });
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _call?.removeListener(_changed);
    // Leaving this screen, which happens when the emergency closes, hangs up.
    _call?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bool announcing = _ticker != null;
    final VoiceCall? call = _call;
    final bool shown = _voice.hasStarted || (call?.isActive ?? false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (shown) ...<Widget>[
          Semantics(liveRegion: true, child: _panel(context, announcing, call)),
          const SizedBox(height: MzaziSpace.s24),
        ],
        Expanded(
          child: HelpProgress(emergency: widget.emergency, compact: shown),
        ),
      ],
    );
  }

  Widget _panel(BuildContext context, bool announcing, VoiceCall? call) {
    final ThemeData theme = Theme.of(context);
    const BoxConstraints elderTarget = BoxConstraints(minHeight: MzaziA11y.elderMinTouchTarget);

    if (announcing) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('$_who is joining to talk to you', style: theme.textTheme.titleLarge),
          const SizedBox(height: MzaziSpace.s8),
          Text('Your phone will use its speaker.', style: theme.textTheme.bodyLarge),
          const SizedBox(height: MzaziSpace.s12),
          ConstrainedBox(
            constraints: elderTarget,
            child: OutlinedButton(onPressed: _notNow, child: const Text('Not now')),
          ),
        ],
      );
    }

    if (call != null && call.isActive) {
      final bool connecting = call.status == CallStatus.connecting;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text(
            connecting ? 'Connecting to $_who' : 'Talking with $_who',
            style: theme.textTheme.titleLarge,
          ),
          const SizedBox(height: MzaziSpace.s8),
          Text('You are on speaker. Speak normally.', style: theme.textTheme.bodyLarge),
          const SizedBox(height: MzaziSpace.s12),
          ConstrainedBox(
            constraints: elderTarget,
            child: FilledButton.icon(
              onPressed: () => unawaited(call.leave()),
              icon: const Icon(Icons.call_end),
              label: const Text('End call'),
              style: FilledButton.styleFrom(
                backgroundColor: theme.colorScheme.error,
                foregroundColor: theme.colorScheme.onError,
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (call?.status == CallStatus.failed) ...<Widget>[
          Notice(message: call?.error ?? 'The call could not connect.', isError: true),
          const SizedBox(height: MzaziSpace.s12),
        ],
        ConstrainedBox(
          constraints: elderTarget,
          child: OutlinedButton.icon(
            onPressed: _join,
            icon: const Icon(Icons.headset_mic_outlined),
            label: Text('Talk to $_who'),
          ),
        ),
      ],
    );
  }
}
