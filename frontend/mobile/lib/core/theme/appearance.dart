import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:provider/provider.dart';

import '../api/models.dart';

/// Light or dark, and Elder mode, chosen by the person rather than only by the phone.
///
/// The phone's own setting is the default, because that is where most people already
/// made the choice. But it is one setting for every app, and an older person may find
/// one mode easier to read in this app alone, or be helped to set the phone up by
/// somebody who prefers the other. So each person can override it here, and it is kept
/// on this phone: it is about the screen in front of them, not about their account.
///
/// Whatever is chosen, the alert's own colours stay the same: the panic control's red,
/// with a brighter red edge in dark mode so its outline still stands off the page, and
/// the caution yellow, which is the same in both.
///
/// Elder mode, larger text and taller buttons, follows the same rule. It starts on for an
/// elder's account and off for everybody else, and anybody can switch it either way. The
/// choice is the phone's too, so an elder's phone stays large on the sign-in screen after
/// a sign-out, and somebody who switched it on keeps it after signing in again.
class AppearanceController extends ChangeNotifier {
  AppearanceController({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          );

  static const String _key = 'mzazicare.appearance';
  static const String _elderKey = 'mzazicare.elderMode';

  final FlutterSecureStorage _storage;
  ThemeMode _mode = ThemeMode.system;
  bool? _elderMode;

  ThemeMode get mode => _mode;

  /// What was chosen on this phone, or null when nobody has chosen.
  bool? get elderMode => _elderMode;

  /// Whether Elder mode is on for [role]: the choice made on this phone, or, until one
  /// is made, on for an elder and off for everybody else.
  bool elderModeFor(Role? role) => _elderMode ?? role == Role.elder;

  /// Null where a test builds a screen without one.
  static AppearanceController? maybeOf(BuildContext context) {
    try {
      return Provider.of<AppearanceController>(context);
    } on ProviderNotFoundException {
      return null;
    }
  }

  /// Reads what was chosen before. A setting that cannot be read is the phone's own.
  Future<void> load() async {
    try {
      final ThemeMode stored = _parse(await _storage.read(key: _key));
      final bool? elder = switch (await _storage.read(key: _elderKey)) {
        'on' => true,
        'off' => false,
        _ => null,
      };
      if (stored == _mode && elder == _elderMode) return;
      _mode = stored;
      _elderMode = elder;
      notifyListeners();
    } on Exception {
      // Kept at the phone's setting.
    }
  }

  Future<void> setElderMode(bool on) async {
    if (on == _elderMode) return;
    _elderMode = on;
    notifyListeners();
    try {
      await _storage.write(key: _elderKey, value: on ? 'on' : 'off');
    } on Exception {
      // Applies for this launch, and is asked again next time.
    }
  }

  Future<void> choose(ThemeMode mode) async {
    if (mode == _mode) return;
    _mode = mode;
    notifyListeners();
    try {
      await _storage.write(key: _key, value: mode.name);
    } on Exception {
      // Applies for this launch, and is asked again next time.
    }
  }

  static ThemeMode _parse(String? value) => switch (value) {
    'light' => ThemeMode.light,
    'dark' => ThemeMode.dark,
    _ => ThemeMode.system,
  };
}

/// The three choices, one per row, each a full touch target for whoever is reading.
///
/// Rows rather than a segmented control, because at the elder's type size three words
/// side by side do not fit a phone's width, and a choice that wraps mid-word is harder
/// to read than one that takes a little more height.
class AppearancePicker extends StatelessWidget {
  const AppearancePicker({required this.controller, super.key});

  final AppearanceController controller;

  static const List<(ThemeMode, String, IconData)> _choices = <(ThemeMode, String, IconData)>[
    (ThemeMode.system, 'Same as this phone', Icons.smartphone_outlined),
    (ThemeMode.light, 'Light', Icons.light_mode_outlined),
    (ThemeMode.dark, 'Dark', Icons.dark_mode_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final (ThemeMode mode, String label, IconData icon) in _choices)
            _Choice(
              label: label,
              icon: icon,
              selected: controller.mode == mode,
              onTap: () => controller.choose(mode),
            ),
        ],
      ),
    );
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      inMutuallyExclusiveGroup: true,
      selected: selected,
      button: true,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(label),
        // A tick as well as the word being chosen, so the choice never rests on colour.
        trailing: selected ? const Icon(Icons.check, semanticLabel: 'Chosen') : null,
        onTap: onTap,
      ),
    );
  }
}

/// The switch for Elder mode, for the "Screen" part of a person's own page.
class ElderModeSwitch extends StatelessWidget {
  const ElderModeSwitch({required this.controller, required this.role, super.key});

  final AppearanceController controller;
  final Role? role;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) => SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: const Text('Elder mode'),
        subtitle: const Text('Larger text and bigger buttons'),
        value: controller.elderModeFor(role),
        onChanged: controller.setElderMode,
      ),
    );
  }
}
