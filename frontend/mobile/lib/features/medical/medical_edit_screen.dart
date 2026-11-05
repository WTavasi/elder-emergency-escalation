import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/medical_models.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/section_label.dart';
import '../../core/widgets/settings_list.dart';
import 'medical_words.dart';

/// Changing an elder's medical details: ticks for what a helper must know at a glance,
/// a few lines for the rest. Every part may be left empty; a blood type alone is worth
/// having. Saved as a whole, and the elder is told of a change somebody else made.
class MedicalEditScreen extends StatefulWidget {
  const MedicalEditScreen({
    required this.api,
    required this.page,
    required this.forElder,
    super.key,
  });

  final ApiClient api;
  final MedicalProfilePage page;
  final bool forElder;

  @override
  State<MedicalEditScreen> createState() => _MedicalEditScreenState();
}

class _MedicalEditScreenState extends State<MedicalEditScreen> {
  late final MedicalDetails _start = widget.page.details ?? MedicalDetails.empty;
  late String? _dateOfBirth = _start.dateOfBirth;
  late String? _bloodType = _start.bloodType;
  late final Set<String> _flags = _start.flags.toSet();
  late final Map<String, TextEditingController> _text = <String, TextEditingController>{
    'conditions': TextEditingController(text: _start.conditions ?? ''),
    'medications': TextEditingController(text: _start.medications ?? ''),
    'allergies': TextEditingController(text: _start.allergies ?? ''),
    'languages': TextEditingController(text: _start.languages ?? ''),
    'doctorName': TextEditingController(text: _start.doctorName ?? ''),
    'doctorPhone': TextEditingController(text: _start.doctorPhone ?? ''),
    'hospital': TextEditingController(text: _start.hospital ?? ''),
    'notes': TextEditingController(text: _start.notes ?? ''),
  };
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final TextEditingController controller in _text.values) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _value(String key) {
    final String text = _text[key]!.text.trim();
    return text.isEmpty ? null : text;
  }

  MedicalDetails get _draft => MedicalDetails(
    dateOfBirth: _dateOfBirth,
    bloodType: _bloodType,
    // In the server's order, so the same ticks always read the same.
    flags: <String>[
      for (final MedicalOption option in widget.page.flagOptions)
        if (_flags.contains(option.flag)) option.flag,
    ],
    conditions: _value('conditions'),
    medications: _value('medications'),
    allergies: _value('allergies'),
    languages: _value('languages'),
    doctorName: _value('doctorName'),
    doctorPhone: _value('doctorPhone'),
    hospital: _value('hospital'),
    notes: _value('notes'),
  );

  bool get _changed {
    final Map<String, dynamic> now = _draft.toJson();
    final Map<String, dynamic> was = _start.toJson();
    return now.keys.any((String key) {
      if (key == 'flags') {
        final List<String> a = List<String>.of(now[key] as List<String>)..sort();
        final List<String> b = List<String>.of(was[key] as List<String>)..sort();
        return a.join(',') != b.join(',');
      }
      return now[key] != was[key];
    });
  }

  Future<void> _pickBirthday() async {
    final DateTime now = DateTime.now();
    final DateTime initial =
        DateTime.tryParse(_dateOfBirth ?? '') ?? DateTime(now.year - 75, now.month, now.day);
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: now,
      initialEntryMode: DatePickerEntryMode.calendarOnly,
      helpText: 'Date of birth',
    );
    if (picked == null || !mounted) return;
    final String month = picked.month.toString().padLeft(2, '0');
    final String day = picked.day.toString().padLeft(2, '0');
    setState(() => _dateOfBirth = '${picked.year}-$month-$day');
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final MedicalProfilePage saved = await widget.api.saveMedicalProfile(
        widget.page.elderId,
        _draft,
      );
      if (mounted) Navigator.of(context).pop(saved);
      return;
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on NetworkException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
    if (mounted) setState(() => _busy = false);
  }

  /// Leaving with changes unsaved is asked about, not assumed.
  Future<void> _leave() async {
    final bool? discard = await showActionSheet<bool>(
      context,
      title: 'Discard your changes?',
      actions: const <SheetAction<bool>>[
        SheetAction<bool>('Discard', true, icon: Icons.delete_outline, destructive: true),
        SheetAction<bool>('Keep editing', false, icon: Icons.edit_outlined),
      ],
    );
    if (discard == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final MedicalProfilePage page = widget.page;
    final String name = firstNameOf(page.elderName);
    final double margin = MzaziLayout.margin(context);
    final String? error = _error;

    return PopScope(
      canPop: !_changed || _busy,
      onPopInvokedWithResult: (bool didPop, Object? _) {
        if (!didPop) unawaited(_leave());
      },
      child: Scaffold(
        appBar: AppBar(),
        body: SafeArea(
          top: false,
          child: ListView(
            padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
            children: <Widget>[
              const PageTitle('Edit medical details'),
              if (error != null)
                Padding(
                  padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s8, margin, 0),
                  child: Notice(message: error, isError: true),
                ),
              SettingsSection(
                children: <Widget>[
                  SettingsRow(
                    icon: Icons.cake_outlined,
                    title: 'Date of birth',
                    value: _dateOfBirth == null ? 'Add' : birthDay(_dateOfBirth!),
                    onTap: _busy ? null : () => unawaited(_pickBirthday()),
                  ),
                  SettingsMenuRow<String>(
                    icon: Icons.bloodtype_outlined,
                    title: 'Blood type',
                    value: _bloodType ?? '',
                    choices: <SettingsChoice<String>>[
                      const SettingsChoice<String>('', 'Not known'),
                      for (final String type in page.bloodTypes) SettingsChoice<String>(type, type),
                    ],
                    onChanged: (String type) =>
                        setState(() => _bloodType = type.isEmpty ? null : type),
                  ),
                ],
              ),
              SettingsSection(
                title: 'Conditions and needs',
                footer: 'Tick what a helper should know at a glance.',
                children: <Widget>[
                  for (final MedicalOption option in page.flagOptions)
                    SettingsCheckRow(
                      icon: medicalFlagIcon(option.flag),
                      title: option.label,
                      checked: _flags.contains(option.flag),
                      onChanged: _busy
                          ? null
                          : (bool on) => setState(
                              () => on ? _flags.add(option.flag) : _flags.remove(option.flag),
                            ),
                    ),
                ],
              ),
              _fields(context, 'In their words', <Widget>[
                _field('conditions', 'Other conditions', 500, lines: 3),
                _field('medications', 'Medicines, with how much and when', 500, lines: 3),
                _field('allergies', 'Allergies, and what happens', 300, lines: 2),
                _field(
                  'languages',
                  widget.forElder ? 'Languages you speak' : 'Languages they speak',
                  80,
                ),
              ]),
              _fields(context, 'Doctor', <Widget>[
                _field('doctorName', "Doctor's name", 120),
                _field(
                  'doctorPhone',
                  "Doctor's number",
                  20,
                  keyboard: TextInputType.phone,
                  allow: RegExp(r'[\d\s+-]'),
                ),
                _field('hospital', widget.forElder ? 'Your hospital' : 'Their hospital', 120),
              ]),
              _fields(context, 'Anything else', <Widget>[
                _field('notes', 'Such as where the spare key is', 500, lines: 3),
              ]),
              Padding(
                padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s16, margin, 0),
                child: Text(
                  widget.forElder
                      ? 'Your caregivers can see these. Family and emergency services see them '
                            'only when we ask them to help you.'
                      : "Caregivers can see these. Family and emergency services see them only "
                            "when we ask them to help. We'll text $name that you made a change.",
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
              Padding(
                padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s24, margin, 0),
                child: FilledButton(
                  onPressed: _busy || !_changed ? null : () => unawaited(_save()),
                  child: Text(_busy ? 'Saving…' : 'Save'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _fields(BuildContext context, String title, List<Widget> fields) {
    final double margin = MzaziLayout.margin(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s24, margin, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SectionLabel(title),
          for (final (int index, Widget field) in fields.indexed) ...<Widget>[
            if (index > 0) const SizedBox(height: MzaziSpace.s12),
            field,
          ],
        ],
      ),
    );
  }

  Widget _field(
    String key,
    String label,
    int max, {
    int lines = 1,
    TextInputType? keyboard,
    RegExp? allow,
  }) => TextField(
    controller: _text[key],
    enabled: !_busy,
    minLines: 1,
    maxLines: lines,
    keyboardType: keyboard ?? (lines > 1 ? TextInputType.multiline : TextInputType.text),
    textCapitalization: TextCapitalization.sentences,
    inputFormatters: <TextInputFormatter>[
      LengthLimitingTextInputFormatter(max),
      if (allow != null) FilteringTextInputFormatter.allow(allow),
    ],
    decoration: InputDecoration(labelText: label),
    onChanged: (_) => setState(() {}),
  );
}
