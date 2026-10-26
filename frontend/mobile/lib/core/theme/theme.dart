import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The two sizes the app comes in.
///
/// [elder] is Elder mode: larger text and taller buttons. It starts on for an elder's
/// account and off for everybody else, and anybody can switch it on or off from their
/// own page; the choice is kept on the phone (see `AppearanceController`). Everything
/// else about the app is the same in both: one face, one set of colours, one layout.
enum AppAudience {
  elder,
  standard;

  /// Elder mode's sizes.
  bool get isLarge => this == AppAudience.elder;
}

/// The sizes a screen needs beyond the text styles: how tall a button is and how big a
/// touch target must be, for whichever size the app is in.
@immutable
class MzaziSizes extends ThemeExtension<MzaziSizes> {
  const MzaziSizes({required this.large, required this.control, required this.target});

  static const MzaziSizes standard = MzaziSizes(
    large: false,
    control: MzaziA11y.appControlHeight,
    target: MzaziA11y.standardMinTouchTarget,
  );

  static const MzaziSizes elder = MzaziSizes(
    large: true,
    control: MzaziA11y.elderControlHeight,
    target: MzaziA11y.elderMinTouchTarget,
  );

  /// Whether Elder mode is on.
  final bool large;

  /// The height of a full-width button.
  final double control;

  /// The smallest any touch target may be.
  final double target;

  static MzaziSizes of(BuildContext context) =>
      Theme.of(context).extension<MzaziSizes>() ?? standard;

  @override
  MzaziSizes copyWith({bool? large, double? control, double? target}) => MzaziSizes(
    large: large ?? this.large,
    control: control ?? this.control,
    target: target ?? this.target,
  );

  @override
  MzaziSizes lerp(MzaziSizes? other, double t) => t < 0.5 || other == null ? this : other;
}

/// The page's side margin, from the screen's width: Apple's 16 points on the narrowest
/// phones and 20 on the rest, so text never runs closer to the edge on a big phone than
/// on a small one.
abstract final class MzaziLayout {
  static double margin(BuildContext context) =>
      MediaQuery.sizeOf(context).width < 375 ? MzaziSpace.s16 : 20.0;
}

/// Builds the app's themes from the generated tokens.
///
/// Nothing in this file is a literal. Every colour, size, radius and duration is a
/// constant from `frontend/design-tokens`, which is where the contrast gate can see it. A
/// hard-coded value here would be invisible to that gate, which is the entire reason
/// there are none.
abstract final class MzaziTheme {
  /// Fixed-width digits, for a style built with `copyWith`. See [MzaziTextWeight.figures].
  static const List<FontFeature> figures = <FontFeature>[FontFeature.tabularFigures()];

  static ThemeData light(AppAudience audience) => _build(
    audience: audience,
    brightness: Brightness.light,
    bg: MzaziColorsLight.bg,
    surface: MzaziColorsLight.surface,
    surfaceSunk: MzaziColorsLight.surfaceSunk,
    text: MzaziColorsLight.text,
    textSoft: MzaziColorsLight.textSoft,
    line: MzaziColorsLight.line,
    control: MzaziColorsLight.control,
    danger: MzaziColorsLight.danger,
    onDanger: MzaziColorsLight.onEmergency,
    emergency: MzaziColorsLight.emergency,
    onEmergency: MzaziColorsLight.onEmergency,
    focus: MzaziColorsLight.focus,
    selection: MzaziColorsLight.selection,
  );

  static ThemeData dark(AppAudience audience) => _build(
    audience: audience,
    brightness: Brightness.dark,
    bg: MzaziColorsDark.bg,
    surface: MzaziColorsDark.surface,
    surfaceSunk: MzaziColorsDark.surfaceSunk,
    text: MzaziColorsDark.text,
    textSoft: MzaziColorsDark.textSoft,
    line: MzaziColorsDark.line,
    control: MzaziColorsDark.control,
    danger: MzaziColorsDark.danger,
    onDanger: MzaziColorsDark.bg,
    emergency: MzaziColorsDark.emergency,
    onEmergency: MzaziColorsDark.onEmergency,
    focus: MzaziColorsDark.focus,
    selection: MzaziColorsDark.selection,
  );

  /// The same theme laid on the caution yellow, for the screen that says "you can still
  /// stop this": the elder's ten seconds to withdraw an alert.
  ///
  /// The yellow is the same in light and dark mode, because its job is to be seen, so the
  /// one ink that reads on it is the same in both too. Every text style, icon and control
  /// takes that ink.
  static ThemeData caution(ThemeData base) {
    const Color ink = MzaziColorsLight.onCaution;
    const Color paper = MzaziColorsLight.caution;
    return base.copyWith(
      scaffoldBackgroundColor: paper,
      canvasColor: paper,
      textTheme: base.textTheme.apply(bodyColor: ink, displayColor: ink),
      iconTheme: base.iconTheme.copyWith(color: ink),
      colorScheme: base.colorScheme.copyWith(
        surface: paper,
        onSurface: ink,
        onSurfaceVariant: ink,
        outline: ink,
      ),
      // The ink first, then the rest of the base style: merge keeps the receiver's values
      // and only fills what it leaves unset, so the other way round the base colour wins.
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: ink).merge(base.iconButtonTheme.style),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: ink).merge(base.textButtonTheme.style),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ink,
          side: const BorderSide(color: ink, width: MzaziStroke.focus),
        ).merge(base.outlinedButtonTheme.style),
      ),
    );
  }

  /// One text style, in the phone's own face.
  ///
  /// SF Pro on an iPhone, as in Apple's own apps, and Roboto on Android. SF Pro is already
  /// on every iPhone at every weight, follows the phone's text-size setting, and may not
  /// be bundled for anything else, so nothing is shipped. The family is named on every
  /// style rather than left to be inherited, because some widgets, buttons among them,
  /// take a style from the theme as it is and never merge it with the platform's own.
  static TextStyle _text({
    required double size,
    required FontWeight weight,
    required Color color,
    double? height,
    double? tracking,
  }) => TextStyle(
    fontFamily: systemFamily(size),
    fontSize: size,
    fontWeight: weight,
    height: height,
    letterSpacing: tracking,
    color: color,
  );

  /// The phone's own face for text of [size]. On an iPhone, Flutter's names for SF Pro:
  /// its Display cut from 20 points up and its Text cut below, as Apple sets them.
  static String systemFamily(double size) => switch (defaultTargetPlatform) {
    TargetPlatform.iOS ||
    TargetPlatform.macOS => size >= 20 ? 'CupertinoSystemDisplay' : 'CupertinoSystemText',
    _ => 'Roboto',
  };

  static double bodySize(AppAudience audience) =>
      audience.isLarge ? MzaziTypeElder.body : MzaziTypeApp.body;

  static double touchTarget(AppAudience audience) =>
      audience.isLarge ? MzaziA11y.elderMinTouchTarget : MzaziA11y.standardMinTouchTarget;

  static ThemeData _build({
    required AppAudience audience,
    required Brightness brightness,
    required Color bg,
    required Color surface,
    required Color surfaceSunk,
    required Color text,
    required Color textSoft,
    required Color line,
    required Color control,
    required Color danger,
    required Color onDanger,
    required Color emergency,
    required Color onEmergency,
    required Color focus,
    required Color selection,
  }) {
    final bool elder = audience.isLarge;
    final double target = touchTarget(audience);
    final double buttonHeight = elder ? MzaziA11y.elderControlHeight : MzaziA11y.appControlHeight;

    // Apple's steps, in Apple's order. Elder mode takes the same steps, larger, so a
    // screen built for one reads correctly in the other.
    double size({required double app, required double large}) => elder ? large : app;

    // Elder mode's body text is semibold, a legibility decision rather than a stylistic
    // one, which lives in tokens.json. Headings stay a step heavier than the text beside
    // them in both sizes.
    final FontWeight bodyWeight = elder ? MzaziWeight.elderBody : MzaziWeight.body;
    final FontWeight strong = elder ? MzaziWeight.heading : MzaziWeight.strong;

    final TextTheme textTheme = TextTheme(
      // The countdown's seconds and nothing else.
      displayLarge: _text(
        size: size(app: MzaziTypeApp.display, large: MzaziTypeElder.display),
        weight: MzaziWeight.heading,
        height: 1.05,
        color: text,
      ),
      // A page's title: Apple's large title.
      headlineLarge: _text(
        size: size(app: MzaziTypeApp.largeTitle, large: MzaziTypeElder.largeTitle),
        weight: MzaziWeight.heading,
        height: 1.15,
        color: text,
      ),
      headlineMedium: _text(
        size: size(app: MzaziTypeApp.title1, large: MzaziTypeElder.title1),
        weight: MzaziWeight.heading,
        height: 1.2,
        color: text,
      ),
      // The heading of a step or a sheet.
      headlineSmall: _text(
        size: size(app: MzaziTypeApp.title2, large: MzaziTypeElder.title2),
        weight: MzaziWeight.heading,
        height: 1.25,
        color: text,
      ),
      titleLarge: _text(
        size: size(app: MzaziTypeApp.title3, large: MzaziTypeElder.title3),
        weight: strong,
        height: 1.25,
        color: text,
      ),
      // Apple's headline: the body size, heavier. Names in a list, a row's title.
      titleMedium: _text(
        size: size(app: MzaziTypeApp.headline, large: MzaziTypeElder.headline),
        weight: strong,
        height: 1.3,
        color: text,
      ),
      titleSmall: _text(
        size: size(app: MzaziTypeApp.subheadline, large: MzaziTypeElder.subheadline),
        weight: strong,
        height: 1.3,
        color: text,
      ),
      bodyLarge: _text(
        size: size(app: MzaziTypeApp.body, large: MzaziTypeElder.body),
        weight: bodyWeight,
        height: 1.35,
        color: text,
      ),
      bodyMedium: _text(
        size: size(app: MzaziTypeApp.body, large: MzaziTypeElder.body),
        weight: bodyWeight,
        height: 1.35,
        color: text,
      ),
      // Secondary text, in the softer ink. Apple's subheadline rather than its footnote,
      // so nothing a person has to read is smaller than 15 points.
      bodySmall: _text(
        size: size(app: MzaziTypeApp.subheadline, large: MzaziTypeElder.subheadline),
        weight: bodyWeight,
        height: 1.35,
        color: textSoft,
      ),
      // Buttons.
      labelLarge: _text(
        size: size(app: MzaziTypeApp.headline, large: MzaziTypeElder.headline),
        weight: strong,
        color: text,
      ),
      labelMedium: _text(
        size: size(app: MzaziTypeApp.subheadline, large: MzaziTypeElder.subheadline),
        weight: strong,
        color: text,
      ),
      // Section labels: small capitals, opened out, in the softer ink, as the iPhone's
      // Settings app heads its groups.
      labelSmall: _text(
        size: size(app: MzaziTypeApp.footnote, large: MzaziTypeElder.footnote),
        weight: strong,
        height: 1.3,
        tracking: MzaziTracking.eyebrow / 2,
        color: textSoft,
      ),
    );

    const double inputRadius = MzaziRadius.field;
    OutlineInputBorder outline(Color color, [double width = MzaziStroke.hairline]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(inputRadius),
          borderSide: BorderSide(color: color, width: width),
        );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      extensions: <ThemeExtension<dynamic>>[elder ? MzaziSizes.elder : MzaziSizes.standard],
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      textTheme: textTheme,
      // Material tints raised surfaces with the primary colour. Here the primary is the
      // emergency red, so every sheet and menu came out faintly pink. No tint anywhere.
      applyElevationOverlayColor: false,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: emergency,
        onPrimary: onEmergency,
        secondary: focus,
        onSecondary: onEmergency,
        // The text-safe red, not the brand red. The brand red is 2:1 on the dark
        // background, which made every validation message unreadable in dark mode.
        error: danger,
        onError: onDanger,
        surface: surface,
        onSurface: text,
        onSurfaceVariant: textSoft,
        surfaceTint: surface,
        surfaceContainerLowest: surface,
        surfaceContainerLow: surface,
        surfaceContainer: surface,
        surfaceContainerHigh: surface,
        surfaceContainerHighest: surfaceSunk,
        outline: control,
        outlineVariant: line,
      ),
      dividerColor: line,
      dividerTheme: DividerThemeData(
        color: line,
        thickness: MzaziStroke.hairline,
        space: MzaziStroke.hairline,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        foregroundColor: text,
        elevation: MzaziElevation.flat,
        scrolledUnderElevation: MzaziElevation.flat,
        surfaceTintColor: bg,
        titleTextStyle: textTheme.titleMedium,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: MzaziElevation.flat,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MzaziRadius.group),
          side: BorderSide(color: line),
        ),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s16),
        minTileHeight: target,
        iconColor: text,
        titleTextStyle: textTheme.bodyLarge,
        subtitleTextStyle: textTheme.bodySmall,
      ),
      expansionTileTheme: ExpansionTileThemeData(
        shape: Border(
          top: BorderSide(color: line),
          bottom: BorderSide(color: line),
        ),
        collapsedShape: Border(
          top: BorderSide(color: line),
          bottom: BorderSide(color: line),
        ),
        iconColor: text,
        collapsedIconColor: text,
        tilePadding: EdgeInsets.zero,
      ),
      // One button shape everywhere: solid, gently rounded, no border, glow or shadow,
      // at Apple's large-control height (taller in Elder mode).
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: Size.fromHeight(buttonHeight),
          backgroundColor: emergency,
          foregroundColor: onEmergency,
          disabledBackgroundColor: surfaceSunk,
          disabledForegroundColor: textSoft,
          textStyle: textTheme.labelLarge,
          elevation: MzaziElevation.flat,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.button)),
        ),
      ),
      // The second action beside a filled one: Apple's grey button, the same shape filled
      // with the sunk grey, so it never competes with the filled one and needs no outline.
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: Size.fromHeight(buttonHeight),
          foregroundColor: text,
          backgroundColor: surfaceSunk,
          disabledForegroundColor: textSoft,
          textStyle: textTheme.labelLarge,
          side: BorderSide.none,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.button)),
        ),
      ),
      // A plain button: the words alone, in the brand red, as Apple tints its plain
      // buttons. No underline, which on a phone marks a link inside a sentence.
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: Size(target, target),
          foregroundColor: emergency,
          disabledForegroundColor: textSoft,
          textStyle: textTheme.labelLarge,
          padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s8),
        ),
      ),
      // Apple's segmented control: a grey track with the chosen segment lifted out.
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          side: BorderSide.none,
          backgroundColor: surfaceSunk,
          selectedBackgroundColor: surface,
          selectedForegroundColor: text,
          foregroundColor: textSoft,
          textStyle: textTheme.labelMedium,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.field)),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: Size(target, target), foregroundColor: text),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        surfaceTintColor: surface,
        elevation: MzaziElevation.flat,
        indicatorColor: surfaceSunk,
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MzaziRadius.field),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => states.contains(WidgetState.selected)
              ? textTheme.titleSmall?.copyWith(color: text)
              : textTheme.titleSmall?.weighted(MzaziWeight.body).copyWith(color: textSoft),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) =>
              IconThemeData(color: states.contains(WidgetState.selected) ? text : textSoft),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        modalBackgroundColor: surface,
        surfaceTintColor: surface,
        showDragHandle: true,
        dragHandleColor: control,
        dragHandleSize: const Size(36, 5),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(MzaziRadius.sheetTop)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.sheetTop)),
      ),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: MzaziSpace.s16,
          vertical: MzaziSpace.s16,
        ),
        // The field's outline in the control colour, which clears 3:1 against the page
        // as WCAG 1.4.11 asks. The hairline colour it used before was 1.3:1, so an empty
        // field was close to invisible.
        border: outline(control),
        enabledBorder: outline(control),
        // Three logical pixels, because a focus ring that can only be seen by someone
        // looking for it is not doing its job.
        focusedBorder: outline(focus, MzaziStroke.focus),
        errorBorder: outline(danger),
        focusedErrorBorder: outline(danger, MzaziStroke.focus),
        errorStyle: textTheme.bodySmall?.copyWith(color: danger),
      ),
      // Material colours every selected control from the primary colour, which here is the
      // emergency red: an "on" switch, a ticked box, a chosen radio, a slider, a spinner.
      // None of those is an emergency. They take the ink, as primary actions do, so red
      // keeps its one meaning. On iPhone an adaptive switch stays the platform's own green,
      // because the Material switch theme is not applied to it.
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => states.contains(WidgetState.selected) ? surface : control,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => states.contains(WidgetState.selected) ? text : surfaceSunk,
        ),
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => states.contains(WidgetState.selected) ? text : control,
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) =>
              states.contains(WidgetState.selected) ? text : Colors.transparent,
        ),
        checkColor: WidgetStatePropertyAll<Color>(surface),
        side: BorderSide(color: control, width: MzaziStroke.hairline * 2),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (Set<WidgetState> states) => states.contains(WidgetState.selected) ? text : control,
        ),
      ),
      sliderTheme: SliderThemeData(
        activeTrackColor: text,
        thumbColor: text,
        inactiveTrackColor: line,
        activeTickMarkColor: surface,
        inactiveTickMarkColor: control,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: text, linearTrackColor: line),
      // iOS-style controls (dialog actions, the adaptive switch's focus) take their tint from
      // here rather than from the primary colour, for the same reason.
      cupertinoOverrideTheme: CupertinoThemeData(primaryColor: focus),
      // Material takes the cursor and the selection from the primary colour, which here is
      // the emergency red, so every field had a red caret. The focus blue and the gated
      // selection colour instead.
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: focus,
        selectionColor: selection,
        selectionHandleColor: focus,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: text,
        contentTextStyle: textTheme.bodyLarge?.copyWith(color: bg),
      ),
    );
  }
}

/// A heavier or lighter weight for one piece of text.
extension MzaziTextWeight on TextStyle {
  TextStyle weighted(FontWeight weight) => copyWith(fontWeight: weight);

  /// Figures that line up: timers, codes and phone numbers, where a changing digit must
  /// not move the ones beside it. The system face's own fixed-width digits, rather than
  /// a second, monospaced face.
  TextStyle get figures => copyWith(fontFeatures: MzaziTheme.figures);
}
