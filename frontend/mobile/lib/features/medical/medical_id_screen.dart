import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../core/api/api_client.dart';
import '../../core/api/medical_models.dart';
import '../../core/api/models.dart';
import '../../core/theme/theme.dart';
import '../../core/widgets/action_sheet.dart';
import '../../core/widgets/notice.dart';
import '../../core/widgets/page_title.dart';
import '../../core/widgets/settings_list.dart';
import '../responder/widgets/call_button.dart';
import 'medical_edit_screen.dart';
import 'medical_words.dart';

/// An elder's medical details, as the medical ID on a phone shows them: who they are and
/// how old, then what a helper should know, then who can see it and who has looked.
///
/// For the elder and their caregivers. Nothing is kept until somebody agrees to keep it,
/// and the elder can delete it all from here. Family and emergency services never come
/// here: they see the details on an alert they were asked about, and the elder sees that
/// they looked.
class MedicalIdScreen extends StatefulWidget {
  const MedicalIdScreen({
    required this.api,
    required this.elderId,
    required this.forElder,
    super.key,
  });

  final ApiClient api;
  final String elderId;

  /// The elder's own page, written to "you"; otherwise a caregiver's, about them.
  final bool forElder;

  @override
  State<MedicalIdScreen> createState() => _MedicalIdScreenState();
}

class _MedicalIdScreenState extends State<MedicalIdScreen> {
  MedicalProfilePage? _page;
  String? _error;
  bool _busy = false;

  String get _name => firstNameOf(_page?.elderName ?? '');

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() => _run(() => widget.api.medicalProfile(widget.elderId));

  /// Runs one request, then shows the page as it now stands. True when it worked.
  Future<bool> _run(Future<Object?> Function() request, {bool reload = false}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Object? result = await request();
      final MedicalProfilePage page = result is MedicalProfilePage && !reload
          ? result
          : await widget.api.medicalProfile(widget.elderId);
      if (!mounted) return false;
      setState(() {
        _page = page;
        _busy = false;
      });
      return true;
    } on ApiException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    } on NetworkException catch (failure) {
      if (mounted) setState(() => _error = failure.message);
    }
    if (mounted) setState(() => _busy = false);
    return false;
  }

  String get _meaning => widget.forElder
      ? 'Conditions, medicines, allergies and your doctor, so helpers know what matters. Your '
            'caregivers can see them. Family and emergency services see them only when we ask '
            'them to help you. You can see who looked.'
      : 'Conditions, medicines, allergies and their doctor, so helpers know what matters. '
            'Caregivers can see them. Family and emergency services see them only when we ask '
            'them to help $_name. $_name can see who looked.';

  /// Nothing is kept until somebody agrees. A caregiver's agreement is for keeping them;
  /// the elder is asked to agree too before anybody else sees them.
  Future<void> _agree() async {
    final bool? sure = await showActionSheet<bool>(
      context,
      title: widget.forElder ? 'Keep your medical details?' : 'Keep medical details for $_name?',
      message: widget.forElder
          ? _meaning
          : '$_meaning We\'ll text $_name and ask them to agree too.',
      actions: const <SheetAction<bool>>[
        SheetAction<bool>('Agree', true, icon: Icons.check, primary: true),
        SheetAction<bool>('Not now', false, icon: Icons.close),
      ],
    );
    if (!mounted || sure != true) return;
    final bool done = await _run(
      () => widget.api.grantConsent(widget.elderId, ConsentKind.medicalProfile),
      reload: true,
    );
    if (done && mounted && (_page?.details?.isEmpty ?? true)) await _edit();
  }

  /// The elder agreeing for themselves, after a caregiver agreed for them.
  Future<void> _share() async {
    final bool? sure = await showActionSheet<bool>(
      context,
      title: 'Share in an emergency?',
      message:
          'Family and emergency services see these only when we ask them to help you. You '
          'can see who looked.',
      actions: const <SheetAction<bool>>[
        SheetAction<bool>('Share', true, icon: Icons.check, primary: true),
        SheetAction<bool>('Not now', false, icon: Icons.close),
      ],
    );
    if (!mounted || sure != true) return;
    await _run(
      () => widget.api.grantConsent(widget.elderId, ConsentKind.medicalProfile),
      reload: true,
    );
  }

  /// A caregiver saying the elder can't decide this for themselves and that they act for
  /// them. Only for an elder who cannot, which the sheet says plainly.
  Future<void> _decideFor() async {
    final bool? sure = await showActionSheet<bool>(
      context,
      title: 'Decide for $_name?',
      message:
          "Only if $_name can't decide this for themselves, for example because of dementia or "
          "a serious illness. You'll act for them: family and emergency services will see these "
          "when we ask them to help. We'll record your name and the time, and text $_name and "
          'the other caregivers. Any of you can stop this.',
      actions: const <SheetAction<bool>>[
        SheetAction<bool>('I act for them', true, icon: Icons.check, primary: true),
        SheetAction<bool>('Not now', false, icon: Icons.close),
      ],
    );
    if (!mounted || sure != true) return;
    await _run(() => widget.api.decideMedicalFor(widget.elderId));
  }

  /// Taking that back: the elder deciding for themselves, or a caregiver stepping back.
  Future<void> _stopDeciding(MedicalGuardian guardian) async {
    final String who = firstNameOf(guardian.by?.name ?? '');
    final bool? sure = await showActionSheet<bool>(
      context,
      title: widget.forElder ? 'Decide this yourself?' : 'Stop deciding for $_name?',
      message: widget.forElder
          ? "${who.isEmpty ? 'Your caregiver' : who} will no longer decide for you. Your "
                'caregivers still see these. Share them if you want helpers to see them too.'
          : "Family and emergency services won't see these until $_name agrees to share them. "
                "We'll text $_name and the other caregivers.",
      actions: <SheetAction<bool>>[
        SheetAction<bool>(
          widget.forElder ? 'Decide myself' : 'Stop deciding',
          true,
          icon: Icons.check,
          primary: true,
        ),
        const SheetAction<bool>('Not now', false, icon: Icons.close),
      ],
    );
    if (!mounted || sure != true) return;
    await _run(() => widget.api.stopDecidingMedicalFor(widget.elderId));
  }

  Future<void> _delete() async {
    final bool? sure = await showActionSheet<bool>(
      context,
      title: widget.forElder ? 'Delete your medical details?' : "Delete $_name's medical details?",
      message: widget.forElder
          ? "We'll delete them now. Helpers won't see them in an emergency."
          : "We'll delete them now and text $_name. Helpers won't see them in an emergency.",
      actions: const <SheetAction<bool>>[
        SheetAction<bool>('Delete', true, icon: Icons.delete_outline, destructive: true),
        SheetAction<bool>('Keep', false, icon: Icons.close),
      ],
    );
    if (!mounted || sure != true) return;
    await _run(
      () => widget.api.withdrawConsent(widget.elderId, ConsentKind.medicalProfile),
      reload: true,
    );
  }

  Future<void> _edit() async {
    final MedicalProfilePage? page = _page;
    if (page == null) return;
    final MedicalProfilePage? saved = await Navigator.of(context).push<MedicalProfilePage>(
      MaterialPageRoute<MedicalProfilePage>(
        builder: (_) => MedicalEditScreen(api: widget.api, page: page, forElder: widget.forElder),
      ),
    );
    if (saved != null && mounted) setState(() => _page = saved);
  }

  @override
  Widget build(BuildContext context) {
    final MedicalProfilePage? page = _page;
    final double margin = MzaziLayout.margin(context);
    final String? error = _error;

    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: MzaziSpace.s32),
          children: <Widget>[
            const PageTitle('Medical details'),
            if (error != null)
              Padding(
                padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s8, margin, 0),
                child: Notice(message: error, isError: true),
              ),
            if (page == null)
              if (_busy)
                const Padding(
                  padding: EdgeInsets.all(MzaziSpace.s32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else
                const SizedBox.shrink()
            else if (!page.enabled)
              Padding(
                padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s16, margin, 0),
                child: const Notice(message: "Medical details aren't available yet."),
              )
            else if (!page.consentActive)
              ..._intro(context)
            else
              ..._kept(context, page),
          ],
        ),
      ),
    );
  }

  /// Before anybody has agreed: what this is, and the one way to start.
  List<Widget> _intro(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double margin = MzaziLayout.margin(context);
    return <Widget>[
      Padding(
        padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s8, margin, MzaziSpace.s24),
        child: Text(_meaning, style: theme.textTheme.bodyLarge),
      ),
      Padding(
        padding: EdgeInsets.symmetric(horizontal: margin),
        child: SizedBox(
          height: MzaziSizes.of(context).control,
          // The grey button: the red is kept for what needs a person now.
          child: OutlinedButton(
            onPressed: _busy ? null : () => unawaited(_agree()),
            child: const Text('Add medical details'),
          ),
        ),
      ),
    ];
  }

  List<Widget> _kept(BuildContext context, MedicalProfilePage page) {
    final MedicalDetails details = page.details ?? MedicalDetails.empty;
    final bool dark = Theme.of(context).brightness == Brightness.dark;
    final Color amber = dark ? MzaziColorsDark.callFg : MzaziColorsLight.callFg;

    return <Widget>[
      ProfileHeader(
        name: page.elderName,
        subtitle: ageAndBlood(page.age, details.bloodType) ?? 'Age and blood type not added',
        detail: details.dateOfBirth == null ? null : 'Born ${birthDay(details.dateOfBirth!)}',
      ),
      if (details.isEmpty)
        SettingsSection(
          children: <Widget>[
            SettingsRow(
              icon: Icons.add,
              title: 'Add medical details',
              onTap: page.canEdit && !_busy ? () => unawaited(_edit()) : null,
            ),
          ],
        )
      else ...<Widget>[
        if (details.flags.isNotEmpty || details.conditions != null)
          SettingsSection(
            title: 'Conditions and needs',
            children: <Widget>[
              for (final String flag in details.flags)
                SettingsRow(icon: medicalFlagIcon(flag), title: page.labelOf(flag), chevron: false),
              if (details.conditions case final String text)
                SettingsFact(icon: Icons.notes, label: 'Other conditions', value: text),
            ],
          ),
        if (details.medications != null || details.allergies != null)
          SettingsSection(
            title: 'Medicines and allergies',
            children: <Widget>[
              if (details.medications case final String text)
                SettingsFact(icon: Icons.medication_outlined, label: 'Medicines', value: text),
              if (details.allergies case final String text)
                SettingsFact(icon: Icons.error_outline, label: 'Allergies', value: text),
            ],
          ),
        if (details.doctorName != null || details.doctorPhone != null || details.hospital != null)
          SettingsSection(
            title: 'Doctor',
            children: <Widget>[
              if (details.doctorName case final String name)
                SettingsFact(icon: Icons.person_outline, label: 'Doctor', value: name),
              if (details.doctorPhone case final String phone)
                SettingsRow(
                  icon: Icons.phone,
                  iconColour: amber,
                  chevron: false,
                  title: 'Call ${details.doctorName ?? 'the doctor'}',
                  subtitle: phone,
                  onTap: () => unawaited(
                    CallButton.dial(
                      context,
                      name: details.doctorName ?? 'the doctor',
                      phone: phone,
                    ),
                  ),
                ),
              if (details.hospital case final String hospital)
                SettingsFact(
                  icon: Icons.local_hospital_outlined,
                  label: widget.forElder ? 'Your hospital' : 'Their hospital',
                  value: hospital,
                ),
            ],
          ),
        if (details.languages != null || details.notes != null)
          SettingsSection(
            title: 'Good to know',
            children: <Widget>[
              if (details.languages case final String text)
                SettingsFact(icon: Icons.translate, label: 'Speaks', value: text),
              if (details.notes case final String text)
                SettingsFact(icon: Icons.info_outline, label: 'Notes', value: text),
            ],
          ),
        if (page.canEdit)
          SettingsSection(
            footer: page.updatedAt == null
                ? null
                : 'Changed ${dayAndTime(page.updatedAt!)}'
                      '${page.updatedBy == null ? '' : ' by ${page.updatedBy!.name}'}.',
            children: <Widget>[
              SettingsRow(
                icon: Icons.edit_outlined,
                title: 'Edit medical details',
                onTap: _busy ? null : () => unawaited(_edit()),
              ),
            ],
          ),
      ],
      _sharing(page),
      _record(page),
      SettingsSection(
        children: <Widget>[
          SettingsRow(
            icon: Icons.delete_outline,
            title: 'Delete medical details',
            destructive: true,
            onTap: _busy ? null : () => unawaited(_delete()),
          ),
        ],
      ),
    ];
  }

  /// Who sees these, and, until the elder agrees for themselves or a caregiver decides for
  /// them, that nobody else does.
  Widget _sharing(MedicalProfilePage page) {
    final MedicalGuardian? guardian = page.consentByElder ? null : page.guardian;
    if (page.shared) {
      final String who = guardian?.by?.name ?? 'A caregiver';
      return SettingsSection(
        title: 'Who can see these',
        footer: guardian == null
            ? null
            : widget.forElder
            ? '$who decides this for you, since ${dayAndTime(guardian.at)}.'
            : "$who said $_name can't decide this and acts for them, since "
                  '${dayAndTime(guardian.at)}.',
        children: <Widget>[
          SettingsRow(
            icon: Icons.lock_outline,
            title: widget.forElder ? 'Your caregivers, anytime' : 'Caregivers, anytime',
            chevron: false,
          ),
          SettingsRow(
            icon: Icons.emergency_outlined,
            title: 'Family and emergency services',
            subtitle: widget.forElder
                ? 'Only when we ask them to help you'
                : 'Only when we ask them to help $_name',
            chevron: false,
          ),
          if (guardian != null)
            SettingsRow(
              icon: Icons.person_outline,
              title: widget.forElder ? 'Decide this myself' : 'Stop deciding for $_name',
              onTap: _busy ? null : () => unawaited(_stopDeciding(guardian)),
            ),
        ],
      );
    }
    return SettingsSection(
      title: 'Who can see these',
      footer: widget.forElder
          ? 'Your caregiver agreed to keep these. Share them so helpers see them in an emergency.'
          : 'Only caregivers see these until $_name agrees to share them. We asked by text.',
      children: <Widget>[
        SettingsRow(
          icon: Icons.lock_outline,
          title: widget.forElder ? 'Your caregivers only' : 'Caregivers only',
          chevron: false,
        ),
        if (widget.forElder)
          SettingsRow(
            icon: Icons.emergency_outlined,
            title: 'Share in an emergency',
            onTap: _busy ? null : () => unawaited(_share()),
          )
        else
          SettingsRow(
            icon: Icons.person_outline,
            title: 'Decide for $_name',
            subtitle: "If $_name can't decide this themselves",
            onTap: _busy ? null : () => unawaited(_decideFor()),
          ),
      ],
    );
  }

  /// Who has looked and who changed what, folded away: there when wanted.
  Widget _record(MedicalProfilePage page) => SettingsSection(
    children: <Widget>[
      SettingsExpandable(
        icon: Icons.visibility_outlined,
        title: 'Who has looked',
        summary: page.views.isEmpty
            ? 'Nobody yet'
            : page.views.length == 1
            ? 'One look'
            : '${page.views.length} looks',
        children: <Widget>[
          if (page.views.isEmpty)
            const SettingsDetail(title: 'Nobody yet')
          else
            for (final MedicalView view in page.views)
              SettingsDetail(
                title: view.by?.name ?? 'Someone who has left',
                note: <String>[
                  if (roleWord(view.by?.role).isNotEmpty) roleWord(view.by?.role),
                  dayAndTime(view.at),
                  if (view.eventId != null) 'during an emergency',
                ].join(' · '),
              ),
        ],
      ),
      SettingsExpandable(
        icon: Icons.history,
        title: 'Changes',
        summary: page.changes.isEmpty ? 'None yet' : 'Last on ${dayAndTime(page.changes.first.at)}',
        children: <Widget>[
          if (page.changes.isEmpty)
            const SettingsDetail(title: 'None yet')
          else
            for (final MedicalChange change in page.changes)
              SettingsDetail(
                title: '${change.by?.name ?? 'Someone'} changed ${changedParts(change.fields)}',
                note: dayAndTime(change.at),
              ),
        ],
      ),
    ],
  );
}
