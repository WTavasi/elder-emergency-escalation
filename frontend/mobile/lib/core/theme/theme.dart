import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The audiences this app serves, which need different type and touch sizes.
///
/// Not a preference and not a setting. An elder-facing screen is built to the elder
/// floors because of who is using it, and a caregiver's alert list would be unusable
/// at 22pt body text with 72dp rows. The scale follows the role, and the role comes
/// from the account.
///
/// [welcome] is for the screens before anybody is signed in, where the person could be
/// anyone, an elder included. It keeps the elder's sizes and face, so nobody meets a
/// screen too small to read, but body text is regular weight: bold everywhere is a
/// decision for somebody known to need it, and on a form full of explanation it makes
/// everything shout equally, which reads as nothing standing out.
enum AppAudience {
  elder,
  welcome,
  standard;

  /// The elder's type sizes, face and touch targets.
  bool get isLarge => this != AppAudience.standard;
}

/// Builds the app's themes from the generated tokens.
///
/// Nothing in this file is a literal. Every colour, size, radius and duration is a
/// constant from `frontend/design-tokens`, which is where the contrast gate can see it. A
/// hard-coded value here would be invisible to that gate, which is the entire reason
/// there are none.
abstract final class MzaziTheme {
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
  );

  /// One text style, with the weight declared twice on purpose.
  ///
  /// Source Sans 3 is a variable font: weight is an axis inside one file rather than a
  /// separate file per weight. `fontVariations` is what moves that axis, and
  /// `fontWeight` is what every other part of the framework reads, including the
  /// fallback face when a glyph is missing. Setting only the first would leave the rest
  /// of the framework thinking the text is regular; setting only the second would leave
  /// the axis at its default and the text would come out the same weight everywhere.
  ///
  /// Harmless for the static faces. Atkinson Hyperlegible and IBM Plex Mono have no
  /// `wght` axis, so the variation is ignored and the real weights are used.
  static TextStyle _text({
    required String family,
    required double size,
    required FontWeight weight,
    required Color color,
    double? height,
    double? tracking,
  }) => TextStyle(
    fontFamily: family,
    fontSize: size,
    fontWeight: weight,
    fontVariations: <FontVariation>[FontVariation('wght', weight.value.toDouble())],
    height: height,
    letterSpacing: tracking,
    color: color,
  );

  static double bodySize(AppAudience audience) =>
      audience.isLarge ? MzaziTypeElder.body : MzaziTypeStandard.body;

  static double touchTarget(AppAudience audience) =>
      audience.isLarge ? MzaziA11y.elderMinTouchTarget : MzaziA11y.standardMinTouchTarget;

  static double cardRadius(AppAudience audience) =>
      audience.isLarge ? MzaziRadius.elderCard : MzaziRadius.card;

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
  }) {
    final bool elder = audience.isLarge;
    final double body = bodySize(audience);
    final double target = touchTarget(audience);

    // One family per audience. The elder face is Atkinson Hyperlegible, drawn for low
    // vision; everybody else gets Source Sans 3. Headings are separated from body text by
    // weight rather than by a third family, which is one fewer file to bundle and one
    // fewer way for two faces to disagree.
    final String family = elder ? MzaziFont.elder : MzaziFont.sans;

    // The elder path is bold throughout, which is a legibility decision rather than a
    // stylistic one and therefore lives in tokens.json. Only once the account is known
    // to be an elder's: see [AppAudience.welcome].
    final FontWeight bodyWeight = audience == AppAudience.elder
        ? MzaziWeight.elderBody
        : MzaziWeight.body;

    final TextTheme textTheme = TextTheme(
      displayLarge: _text(
        family: family,
        size: elder ? MzaziTypeElder.display : MzaziTypeStandard.display,
        weight: MzaziWeight.heading,
        height: 1.05,
        tracking: MzaziTracking.display,
        color: text,
      ),
      headlineLarge: _text(
        family: family,
        size: elder ? MzaziTypeElder.title : MzaziTypeStandard.h1,
        weight: MzaziWeight.heading,
        height: 1.1,
        tracking: MzaziTracking.headline,
        color: text,
      ),
      titleLarge: _text(
        family: family,
        size: elder ? MzaziTypeElder.title : MzaziTypeStandard.h2,
        weight: MzaziWeight.strong,
        height: 1.2,
        tracking: MzaziTracking.title,
        color: text,
      ),
      // Every style a widget asks for is defined here, including the ones Flutter's own
      // widgets reach for (list tiles, segmented buttons, sheets). A style left out
      // falls back to Material's default, which has no font family of its own, so it
      // would quietly render in the platform's system font instead of ours.
      headlineSmall: _text(
        family: family,
        size: elder ? MzaziTypeElder.title : MzaziTypeStandard.h2,
        weight: MzaziWeight.heading,
        height: 1.2,
        tracking: MzaziTracking.title,
        color: text,
      ),
      titleMedium: _text(
        family: family,
        size: body,
        weight: MzaziWeight.strong,
        height: 1.4,
        color: text,
      ),
      titleSmall: _text(
        family: family,
        size: elder ? MzaziTypeElder.label : MzaziTypeStandard.small,
        weight: MzaziWeight.strong,
        height: 1.4,
        color: text,
      ),
      labelMedium: _text(
        family: family,
        size: elder ? MzaziTypeElder.label : MzaziTypeStandard.small,
        weight: MzaziWeight.strong,
        color: text,
      ),
      bodyLarge: _text(family: family, size: body, weight: bodyWeight, height: 1.5, color: text),
      bodyMedium: _text(family: family, size: body, weight: bodyWeight, height: 1.5, color: text),
      // Section labels: small capitals, opened out, in the softer ink. The Swiss device for
      // saying "a new part starts here" without a box round it.
      labelSmall: _text(
        family: family,
        size: elder ? MzaziTypeElder.label : MzaziTypeStandard.small,
        weight: MzaziWeight.strong,
        height: 1.3,
        tracking: MzaziTracking.eyebrow,
        color: textSoft,
      ),
      labelLarge: _text(
        family: family,
        size: elder ? MzaziTypeElder.label : MzaziTypeStandard.body,
        weight: MzaziWeight.strong,
        color: text,
      ),
      bodySmall: _text(
        family: family,
        // Never below the floor for this audience, even for secondary text. On an
        // elder's screen there is no such thing as text that does not have to be read.
        size: elder ? MzaziTypeElder.label : MzaziTypeStandard.small,
        weight: bodyWeight,
        height: 1.4,
        color: textSoft,
      ),
    );

    final double inputRadius = elder ? MzaziRadius.elderInput : MzaziRadius.input;
    OutlineInputBorder outline(Color color, [double width = MzaziStroke.hairline]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(inputRadius),
          borderSide: BorderSide(color: color, width: width),
        );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
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
        centerTitle: false,
        titleTextStyle: textTheme.titleMedium,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: MzaziElevation.flat,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cardRadius(audience)),
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
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: Size.fromHeight(target),
          backgroundColor: emergency,
          foregroundColor: onEmergency,
          disabledBackgroundColor: surfaceSunk,
          disabledForegroundColor: textSoft,
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.input)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: Size.fromHeight(target),
          foregroundColor: text,
          textStyle: textTheme.labelLarge,
          side: BorderSide(color: control),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.input)),
        ),
      ),
      // Material's text buttons are 40 points tall, under both platforms' minimum, and
      // red, which here means an emergency. Ink-coloured and underlined instead, at the
      // audience's touch target.
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: Size(target, target),
          foregroundColor: text,
          textStyle: textTheme.labelLarge?.copyWith(decoration: TextDecoration.underline),
          padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s8),
        ),
      ),
      // Square-cornered like every other control, rather than Material's capsule.
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          side: BorderSide(color: control),
          selectedBackgroundColor: surfaceSunk,
          selectedForegroundColor: text,
          foregroundColor: textSoft,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.input)),
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
          borderRadius: BorderRadius.circular(MzaziRadius.input),
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
        surfaceTintColor: surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(MzaziRadius.sheet)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.sheet)),
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
      snackBarTheme: SnackBarThemeData(
        backgroundColor: text,
        contentTextStyle: textTheme.bodyLarge?.copyWith(color: bg),
      ),
    );
  }
}

/// A heavier or lighter weight for one piece of text, moving the variable font's axis
/// as well as the declared weight, for the reason given on `_text` above. A plain
/// `copyWith(fontWeight:)` changes what the framework believes and leaves the glyphs
/// exactly as they were.
extension MzaziTextWeight on TextStyle {
  TextStyle weighted(FontWeight weight) => copyWith(
    fontWeight: weight,
    fontVariations: <FontVariation>[FontVariation('wght', weight.value.toDouble())],
  );
}
