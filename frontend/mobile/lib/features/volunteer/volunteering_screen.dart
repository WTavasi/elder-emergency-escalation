import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_client.dart';
import '../../core/api/models.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/section_label.dart';
import '../elders/widgets/address_picker.dart';
import 'volunteer_controller.dart';

/// The volunteer's application: what they can do, where, and how far they will go.
///
/// The same form sends a first application and changes one later. Changing an approved
/// application keeps the approval; an administrator vetted the person, not the street.
class VolunteeringScreen extends StatefulWidget {
  const VolunteeringScreen({required this.api, super.key});

  final ApiClient api;

  /// Half a kilometre to five, the same bounds the server holds.
  static const double nearest = 0.5;
  static const double furthest = 5;

  @override
  State<VolunteeringScreen> createState() => _VolunteeringScreenState();
}

class _VolunteeringScreenState extends State<VolunteeringScreen> {
  final TextEditingController _note = TextEditingController();
  Set<VolunteerTraining> _training = <VolunteerTraining>{};
  AddressMatch? _area;
  double _radiusKm = 1;
  bool _showMissing = false;
  bool _filled = false;
  String? _saved;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  /// Fills the form from the application once it has loaded, and only once, so typing
  /// is never overwritten by a refresh.
  void _fillFrom(VolunteerProfile profile, bool loading) {
    if (_filled || loading) return;
    _filled = true;
    _training = profile.training.toSet();
    _area = profile.area;
    _radiusKm = (profile.radiusKm ?? 1.0).clamp(
      VolunteeringScreen.nearest,
      VolunteeringScreen.furthest,
    );
    _note.text = profile.note ?? '';
  }

  Future<void> _send(VolunteerController volunteer) async {
    final AddressMatch? area = _area;
    final bool needsNote = _training.contains(VolunteerTraining.other) && _note.text.trim().isEmpty;
    if (_training.isEmpty || area == null || needsNote) {
      setState(() => _showMissing = true);
      return;
    }
    final bool first = volunteer.profile.status == VolunteerStatus.notApplied;
    final bool done = await volunteer.apply(
      training: VolunteerTraining.values.where(_training.contains).toList(),
      area: area,
      radiusKm: _radiusKm,
      note: _note.text,
    );
    if (!mounted || !done) return;
    setState(() {
      _showMissing = false;
      _saved = first ? 'Sent. You will get a text when it is decided.' : 'Saved.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final VolunteerController volunteer = context.watch<VolunteerController>();
    final VolunteerProfile profile = volunteer.profile;
    _fillFrom(profile, volunteer.loading);
    final bool applied = profile.status != VolunteerStatus.notApplied;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(0, 0, 0, MzaziSpace.s32),
          children: <Widget>[
            const PageTitle('Volunteering'),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: MzaziLayout.margin(context)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Text(
                    'When someone near you needs help, you may be asked to go. You are told '
                    'how far away they are first, and who and where only once you say you '
                    'will go. Their family is asked as usual; you go alongside them.',
                    style: theme.textTheme.bodyMedium,
                  ),
                  const SizedBox(height: MzaziSpace.s24),
                  const SectionLabel('What you can do'),
                  const SizedBox(height: MzaziSpace.s8),
                  Wrap(
                    spacing: MzaziSpace.s8,
                    runSpacing: MzaziSpace.s8,
                    children: <Widget>[
                      for (final VolunteerTraining kind in VolunteerTraining.values)
                        FilterChip(
                          label: Text(kind.label),
                          selected: _training.contains(kind),
                          onSelected: (bool on) => setState(() {
                            on ? _training.add(kind) : _training.remove(kind);
                          }),
                        ),
                    ],
                  ),
                  if (_showMissing && _training.isEmpty) ...<Widget>[
                    const SizedBox(height: MzaziSpace.s8),
                    Text(
                      'Choose at least one.',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.error),
                    ),
                  ],
                  const SizedBox(height: MzaziSpace.s16),
                  TextField(
                    controller: _note,
                    maxLength: 300,
                    maxLines: 3,
                    minLines: 1,
                    decoration: InputDecoration(
                      labelText: _training.contains(VolunteerTraining.other)
                          ? 'What else can you do?'
                          : 'Anything the reviewer should know (optional)',
                      errorText:
                          _showMissing &&
                              _training.contains(VolunteerTraining.other) &&
                              _note.text.trim().isEmpty
                          ? 'Say what your other training is.'
                          : null,
                    ),
                  ),
                  const SizedBox(height: MzaziSpace.s16),
                  AddressPicker(
                    api: widget.api,
                    chosen: _area,
                    showMissing: _showMissing,
                    onChosen: (AddressMatch match) => setState(() => _area = match),
                    title: 'Where can you help?',
                    explanation:
                        'Usually your home. You are asked about people within the distance '
                        'below of this place, and never told where you are matched from.',
                    chosenPrefix: 'Area',
                  ),
                  const SizedBox(height: MzaziSpace.s16),
                  Text(
                    'How far you will go: ${_kilometres(_radiusKm)}',
                    style: theme.textTheme.titleSmall,
                  ),
                  Slider(
                    value: _radiusKm,
                    min: VolunteeringScreen.nearest,
                    max: VolunteeringScreen.furthest,
                    divisions: 9,
                    label: _kilometres(_radiusKm),
                    onChanged: (double value) => setState(() => _radiusKm = value),
                  ),
                  if (volunteer.error case final String failure) ...<Widget>[
                    Notice(message: failure, isError: true),
                    const SizedBox(height: MzaziSpace.s12),
                  ],
                  if (_saved case final String saved) ...<Widget>[
                    Notice(message: saved),
                    const SizedBox(height: MzaziSpace.s12),
                  ],
                  FilledButton(
                    onPressed: volunteer.busy || volunteer.loading
                        ? null
                        : () => unawaited(_send(volunteer)),
                    child: Text(
                      !applied
                          ? 'Send my application'
                          : profile.status == VolunteerStatus.rejected
                          ? 'Send it again'
                          : 'Save changes',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _kilometres(double km) =>
      km < 1 ? '${(km * 1000).round()} m' : '${km.toStringAsFixed(km % 1 == 0 ? 0 : 1)} km';
}
