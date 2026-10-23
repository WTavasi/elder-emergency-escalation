import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/models.dart';
import '../../../core/widgets/notice.dart';

/// A caregiver signing the elder's phone in for them: a code to type into it.
///
/// Shown, never sent. The caregiver is usually beside the elder, setting up a new phone
/// or helping after a sign-out, and reading six digits off one screen into another is
/// the whole job. On the elder's phone: Elder? Sign in with a code, their number, then
/// this code.
class PairingSheet extends StatefulWidget {
  const PairingSheet({required this.api, required this.elderId, required this.elderName, super.key});

  final ApiClient api;
  final String elderId;
  final String elderName;

  @override
  State<PairingSheet> createState() => _PairingSheetState();
}

class _PairingSheetState extends State<PairingSheet> {
  PairingCode? _code;
  String? _error;
  bool _busy = false;
  Duration _left = Duration.zero;
  Timer? _timer;

  String get _first => widget.elderName.trim().split(RegExp(r'\s+')).first;

  @override
  void initState() {
    super.initState();
    unawaited(_fetch());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final PairingCode code = await widget.api.elderSignInCode(widget.elderId);
      if (!mounted) return;
      setState(() {
        _code = code;
        _left = code.expiresIn;
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (Timer timer) {
        if (!mounted) return timer.cancel();
        setState(() => _left -= const Duration(seconds: 1));
        if (_left <= Duration.zero) timer.cancel();
      });
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } on NetworkException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Six digits as two groups of three, which is how a person reads a code out.
  static String _spaced(String code) =>
      code.length == 6 ? '${code.substring(0, 3)} ${code.substring(3)}' : code;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final PairingCode? code = _code;
    final bool expired = code != null && _left <= Duration.zero;
    final int minutes = _left.inSeconds ~/ 60;
    final int seconds = _left.inSeconds % 60;

    return Padding(
      padding: const EdgeInsets.fromLTRB(MzaziSpace.s24, MzaziSpace.s8, MzaziSpace.s24, MzaziSpace.s24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Text('Sign in $_first\'s phone', style: theme.textTheme.titleLarge),
          const SizedBox(height: MzaziSpace.s8),
          Text(
            'On $_first\'s phone, choose "Elder? Sign in with a code", type their number, '
            'then this code. It works once.',
            style: theme.textTheme.bodyLarge,
          ),
          const SizedBox(height: MzaziSpace.s24),
          if (_error != null) ...<Widget>[
            Notice(message: _error!, isError: true),
            const SizedBox(height: MzaziSpace.s16),
          ],
          if (code != null)
            Semantics(
              label: expired ? 'Code expired' : 'Code ${code.code.split('').join(' ')}',
              excludeSemantics: true,
              child: Text(
                _spaced(code.code),
                textAlign: TextAlign.center,
                style: theme.textTheme.displaySmall?.copyWith(
                  fontFamily: MzaziFont.mono,
                  letterSpacing: 6,
                  color: expired ? theme.disabledColor : null,
                  decoration: expired ? TextDecoration.lineThrough : null,
                ),
              ),
            )
          else if (_busy)
            const Center(child: CircularProgressIndicator()),
          if (code != null) ...<Widget>[
            const SizedBox(height: MzaziSpace.s8),
            Text(
              expired
                  ? 'This code has expired.'
                  : 'Works for $minutes:${seconds.toString().padLeft(2, '0')} more',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
              ),
            ),
          ],
          const SizedBox(height: MzaziSpace.s24),
          OutlinedButton.icon(
            onPressed: _busy ? null : () => unawaited(_fetch()),
            icon: const Icon(Icons.refresh),
            label: const Text('Get a new code'),
          ),
          const SizedBox(height: MzaziSpace.s8),
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );
  }
}
