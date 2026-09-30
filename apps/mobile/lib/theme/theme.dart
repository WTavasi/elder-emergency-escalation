import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

/// The two audiences this app serves, which need different type and touch sizes.
///
/// Not a preference and not a setting. An elder-facing screen is built to the elder
/// floors because of who is using it, and a caregiver's alert list would be unusable
/// at 22pt body text with 72dp rows. The scale follows the role, and the role comes
/// from the account.
enum AppAudience { elder, standard }

/// Builds the app's themes from the generated tokens.
///
/// Nothing in this file is a literal. Every colour, size, radius and duration is a
/// constant from `packages/tokens`, which is where the contrast gate can see it. A
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
  }) => TextStyle(
    fontFamily: family,
    fontSize: size,
    fontWeight: weight,
    fontVariations: <FontVariation>[FontVariation('wght', weight.value.toDouble())],
    height: height,
    color: color,
  );

  static double bodySize(AppAudience audience) =>
      audience == AppAudience.elder ? MzaziTypeElder.body : MzaziTypeStandard.body;

  static double touchTarget(AppAudience audience) => audience == AppAudience.elder
      ? MzaziA11y.elderMinTouchTarget
      : MzaziA11y.standardMinTouchTarget;

  static double cardRadius(AppAudience audience) =>
      audience == AppAudience.elder ? MzaziRadius.elderCard : MzaziRadius.card;

  static ThemeData _build({
    required AppAudience audience,
    required Brightness brightness,
    required Color bg,
    required Color surface,
    required Color surfaceSunk,
    required Color text,
    required Color textSoft,
    required Color line,
    required Color emergency,
    required Color onEmergency,
    required Color focus,
  }) {
    final bool elder = audience == AppAudience.elder;
    final double body = bodySize(audience);
    final double target = touchTarget(audience);

    // One family per audience. The elder face is Atkinson Hyperlegible, drawn for low
    // vision; everybody else gets Source Sans 3. Headings are separated from body text by
    // weight rather than by a third family, which is one fewer file to bundle and one
    // fewer way for two faces to disagree.
    final String family = elder ? MzaziFont.elder : MzaziFont.sans;

    // The elder path is bold throughout, which is a legibility decision rather than a
    // stylistic one and therefore lives in tokens.json.
    final FontWeight bodyWeight = elder ? MzaziWeight.elderBody : MzaziWeight.body;

    final TextTheme textTheme = TextTheme(
      displayLarge: _text(
        family: family,
        size: elder ? MzaziTypeElder.display : MzaziTypeStandard.display,
        weight: MzaziWeight.heading,
        height: 1.1,
        color: text,
      ),
      headlineLarge: _text(
        family: family,
        size: elder ? MzaziTypeElder.title : MzaziTypeStandard.h1,
        weight: MzaziWeight.heading,
        height: 1.2,
        color: text,
      ),
      titleLarge: _text(
        family: family,
        size: elder ? MzaziTypeElder.title : MzaziTypeStandard.h2,
        weight: MzaziWeight.strong,
        color: text,
      ),
      bodyLarge: _text(family: family, size: body, weight: bodyWeight, height: 1.5, color: text),
      bodyMedium: _text(family: family, size: body, weight: bodyWeight, height: 1.5, color: text),
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

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: bg,
      canvasColor: bg,
      textTheme: textTheme,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: emergency,
        onPrimary: onEmergency,
        secondary: focus,
        onSecondary: onEmergency,
        error: emergency,
        onError: onEmergency,
        surface: surface,
        onSurface: text,
      ),
      dividerColor: line,
      cardTheme: CardThemeData(
        color: surface,
        elevation: MzaziElevation.card,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cardRadius(audience)),
          side: BorderSide(color: line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: Size.fromHeight(target),
          backgroundColor: emergency,
          foregroundColor: onEmergency,
          textStyle: textTheme.labelLarge,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.input)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: Size.fromHeight(target),
          foregroundColor: text,
          textStyle: textTheme.labelLarge,
          side: BorderSide(color: line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.input)),
        ),
      ),
      inputDecorationTheme: InputDecorationThemeData(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: MzaziSpace.s16,
          vertical: MzaziSpace.s16,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(elder ? MzaziRadius.elderInput : MzaziRadius.input),
          borderSide: BorderSide(color: line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(elder ? MzaziRadius.elderInput : MzaziRadius.input),
          // Three logical pixels, because a focus ring that can only be seen by
          // someone looking for it is not doing its job.
          borderSide: BorderSide(color: focus, width: 3),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surfaceSunk,
        contentTextStyle: textTheme.bodyLarge,
      ),
    );
  }
}
