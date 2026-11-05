import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/speech/speech_recorder.dart';

/// The longest the elder is listened to. Enough for "I fell in the kitchen and my hip
/// hurts", short enough that the speech server answers within a few seconds.
const Duration speakLimit = Duration(minutes: 1);

/// Listens to the elder from a sheet at the bottom: it starts at once, says it is
/// listening and for how long, and stops on Done or after a minute. Gives the recording,
/// or null when they went back or the microphone could not be used.
Future<String?> listenToElder(BuildContext context, SpeechRecorder recorder) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      isDismissible: false,
      enableDrag: false,
      builder: (BuildContext _) => _SpeakSheet(recorder: recorder),
    );

class _SpeakSheet extends StatefulWidget {
  const _SpeakSheet({required this.recorder});

  final SpeechRecorder recorder;

  @override
  State<_SpeakSheet> createState() => _SpeakSheetState();
}

class _SpeakSheetState extends State<_SpeakSheet> {
  Timer? _tick;
  int _seconds = 0;
  bool _started = false;
  bool _refused = false;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    unawaited(_start());
  }

  Future<void> _start() async {
    final bool started = await widget.recorder.start();
    if (!mounted) {
      if (started) unawaited(widget.recorder.cancel());
      return;
    }
    setState(() {
      _started = started;
      _refused = !started;
    });
    if (!started) return;
    _tick = Timer.periodic(const Duration(seconds: 1), (Timer timer) {
      if (!mounted) return;
      setState(() => _seconds += 1);
      if (_seconds >= speakLimit.inSeconds) unawaited(_finish());
    });
  }

  Future<void> _finish() async {
    if (_done) return;
    _done = true;
    _tick?.cancel();
    final String? path = await widget.recorder.stop();
    if (mounted) Navigator.of(context).pop(path);
  }

  Future<void> _back() async {
    if (_done) return;
    _done = true;
    _tick?.cancel();
    if (_started) await widget.recorder.cancel();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final int left = speakLimit.inSeconds - _seconds;
    const double target = MzaziA11y.elderMinTouchTarget;

    return Padding(
      padding: const EdgeInsets.fromLTRB(
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s24,
        MzaziSpace.s16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (_refused) ...<Widget>[
            Text("Can't use the microphone", style: theme.textTheme.headlineSmall),
            const SizedBox(height: MzaziSpace.s12),
            Text(
              "Allow MzaziCare to use the microphone in Settings, or tap what's happening.",
              style: theme.textTheme.bodyLarge,
            ),
          ] else ...<Widget>[
            Semantics(
              liveRegion: true,
              child: Row(
                children: <Widget>[
                  Icon(Icons.mic, size: theme.textTheme.headlineSmall?.fontSize),
                  const SizedBox(width: MzaziSpace.s12),
                  Expanded(
                    child: Text(
                      _started ? "I'm listening" : 'Starting…',
                      style: theme.textTheme.headlineSmall,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: MzaziSpace.s12),
            Text(
              "Say what's happening, in English or Swahili. Press Done when you've finished.",
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: MzaziSpace.s8),
            Text(
              _started ? '$left seconds left' : '',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
              ),
            ),
          ],
          const SizedBox(height: MzaziSpace.s24),
          if (!_refused)
            SizedBox(
              height: target,
              child: OutlinedButton.icon(
                onPressed: _started ? () => unawaited(_finish()) : null,
                icon: const Icon(Icons.check),
                label: const Text('Done'),
              ),
            ),
          const SizedBox(height: MzaziSpace.s8),
          SizedBox(
            height: target,
            child: TextButton(
              style: TextButton.styleFrom(foregroundColor: theme.colorScheme.onSurface),
              onPressed: () => unawaited(_back()),
              child: Text(_refused ? 'Close' : 'Go back'),
            ),
          ),
        ],
      ),
    );
  }
}
