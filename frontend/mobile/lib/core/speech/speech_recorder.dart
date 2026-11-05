import 'dart:async';
import 'dart:io';

import 'package:record/record.dart';

/// Records what the elder says after pressing help, to a file that is sent to our own
/// speech server and then deleted.
///
/// An interface so the screens can be tested without a microphone.
abstract class SpeechRecorder {
  /// Starts listening. False when the microphone is refused or missing.
  Future<bool> start();

  /// Stops and gives the file, or null if nothing was recorded.
  Future<String?> stop();

  /// Stops and throws the recording away.
  Future<void> cancel();

  void dispose();
}

/// The phone's microphone, through the record plugin: AAC in an .m4a at 16 kHz mono,
/// which is what the speech server works at and about 250 KB for a minute.
class MicrophoneRecorder implements SpeechRecorder {
  MicrophoneRecorder() : _recorder = AudioRecorder();

  final AudioRecorder _recorder;
  String? _path;

  @override
  Future<bool> start() async {
    if (!await _recorder.hasPermission()) return false;
    final String path =
        '${Directory.systemTemp.path}/help-${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(
      // Raised and cleaned up by the phone, for a quiet or shaking voice in a noisy room.
      const RecordConfig(
        sampleRate: 16000,
        numChannels: 1,
        bitRate: 32000,
        autoGain: true,
        noiseSuppress: true,
      ),
      path: path,
    );
    _path = path;
    return true;
  }

  @override
  Future<String?> stop() async {
    final String? path = await _recorder.stop();
    _path = null;
    return path;
  }

  @override
  Future<void> cancel() async {
    await _recorder.cancel();
    final String? path = _path;
    _path = null;
    if (path != null) {
      try {
        await File(path).delete();
      } on FileSystemException {
        // Already gone.
      }
    }
  }

  @override
  void dispose() => unawaited(_recorder.dispose());
}
