import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../theme/theme.dart';
import 'section_label.dart';

/// The parts of a person's own page, as an iPhone's Settings lays one out: sections of
/// rows that run edge to edge on the surface colour, the page colour showing between
/// them, each section under a small-capitals label. A row is an icon, a few words, and
/// what it does at the end: a chevron to go further, a switch, a value to choose from,
/// or a disclosure that opens the row in place.
///
/// No cards and no shadows: tone and hairlines separate the parts. Every size comes from
/// the theme, so Elder mode makes the whole page larger at once.

/// One person at the top of their page: their initials, their name, and a line under it.
class ProfileHeader extends StatelessWidget {
  const ProfileHeader({
    required this.name,
    required this.subtitle,
    this.detail,
    this.onTap,
    super.key,
  });

  final String name;

  /// "Caregiver · +254 700 000 020".
  final String subtitle;

  /// A second line, such as a home address.
  final String? detail;

  /// Opens the person's details. Null for a header that opens nothing.
  final VoidCallback? onTap;

  /// "MO" for Mary Otieno, "G" for a single name.
  static String initials(String name) {
    final List<String> words = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((String w) => w.isNotEmpty)
        .toList();
    if (words.isEmpty) return '?';
    final String first = words.first[0];
    return words.length == 1 ? first.toUpperCase() : '$first${words.last[0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool dark = theme.brightness == Brightness.dark;
    final double margin = MzaziLayout.margin(context);
    // The selection blue with ink on it, a pair the contrast gate already checks: calm,
    // personal without being decoration, and never the emergency red.
    final Color wash = dark ? MzaziColorsDark.selection : MzaziColorsLight.selection;
    final Color ink = theme.colorScheme.onSurface;
    final double size = (theme.textTheme.titleLarge?.fontSize ?? 22) * 2.6;

    final Widget body = Padding(
      padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s16, margin, MzaziSpace.s16),
      child: Row(
        children: <Widget>[
          ExcludeSemantics(
            child: Container(
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: wash, shape: BoxShape.circle),
              child: Text(initials(name), style: theme.textTheme.titleLarge?.copyWith(color: ink)),
            ),
          ),
          const SizedBox(width: MzaziSpace.s16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(name, style: theme.textTheme.titleLarge),
                const SizedBox(height: MzaziSpace.s4),
                Text(subtitle, style: theme.textTheme.bodyMedium?.figures),
                if (detail case final String line) ...<Widget>[
                  const SizedBox(height: MzaziSpace.s4),
                  Text(line, style: theme.textTheme.bodyMedium),
                ],
              ],
            ),
          ),
          if (onTap != null) Icon(Icons.chevron_right, color: theme.colorScheme.onSurfaceVariant),
        ],
      ),
    );

    if (onTap == null) return body;
    return Material(
      type: MaterialType.transparency,
      child: InkWell(onTap: onTap, child: body),
    );
  }
}

/// One section: a label, rows on the surface colour divided by hairlines, and an
/// optional line of small print under it.
class SettingsSection extends StatelessWidget {
  const SettingsSection({required this.children, this.title, this.footer, super.key});

  final String? title;
  final List<Widget> children;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double margin = MzaziLayout.margin(context);
    final List<Widget> rows = children.where((Widget w) => w is! SizedBox).toList();

    return Padding(
      padding: const EdgeInsets.only(top: MzaziSpace.s24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (title case final String label)
            Padding(
              padding: EdgeInsets.symmetric(horizontal: margin),
              child: SectionLabel(label),
            ),
          ColoredBox(
            color: theme.colorScheme.surface,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                for (final (int index, Widget row) in rows.indexed) ...<Widget>[
                  if (index > 0) Divider(height: 1, indent: margin + _iconColumn(context)),
                  row,
                ],
              ],
            ),
          ),
          if (footer case final String note)
            Padding(
              padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s8, margin, 0),
              child: Text(note, style: theme.textTheme.bodySmall),
            ),
        ],
      ),
    );
  }
}

/// The width the icon and its gap take, so hairlines start under the words.
double _iconColumn(BuildContext context) =>
    (Theme.of(context).textTheme.bodyLarge?.fontSize ?? 17) * 1.4 + MzaziSpace.s16;

/// The common shape of a row: an icon, a title with an optional line under it, and
/// whatever goes at the end.
class _RowBody extends StatelessWidget {
  const _RowBody({
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.colour,
    this.iconColour,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  /// For the words: the text-safe red for signing out, ink otherwise.
  final Color? colour;
  final Color? iconColour;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double margin = MzaziLayout.margin(context);
    final double iconSize = (theme.textTheme.bodyLarge?.fontSize ?? 17) * 1.4;

    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: MzaziSizes.of(context).target),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          margin,
          MzaziSpace.s12,
          margin - MzaziSpace.s4,
          MzaziSpace.s12,
        ),
        child: Row(
          children: <Widget>[
            Icon(icon, size: iconSize, color: iconColour ?? colour ?? theme.colorScheme.onSurface),
            const SizedBox(width: MzaziSpace.s16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(title, style: theme.textTheme.bodyLarge?.copyWith(color: colour)),
                  if (subtitle case final String line) ...<Widget>[
                    const SizedBox(height: 2),
                    Text(line, style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...<Widget>[const SizedBox(width: MzaziSpace.s8), trailing!],
          ],
        ),
      ),
    );
  }
}

/// A row that goes somewhere or does something when tapped.
class SettingsRow extends StatelessWidget {
  const SettingsRow({
    required this.icon,
    required this.title,
    this.subtitle,
    this.value,
    this.onTap,
    this.destructive = false,
    this.chevron = true,
    this.iconColour,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  /// The current value, set at the end in the softer ink: "+254 700 000 020".
  final String? value;
  final VoidCallback? onTap;

  /// Signing out: the words in the text-safe red, as Settings sets them, and no chevron.
  final bool destructive;
  final bool chevron;
  final Color? iconColour;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool dark = theme.brightness == Brightness.dark;
    final Color? colour = destructive
        ? (dark ? MzaziColorsDark.danger : MzaziColorsLight.danger)
        : null;

    return Semantics(
      button: onTap != null,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onTap,
          child: _RowBody(
            icon: icon,
            title: title,
            subtitle: subtitle,
            colour: colour,
            iconColour: iconColour,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (value case final String shown)
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.45),
                    child: Text(
                      shown,
                      textAlign: TextAlign.end,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.figures,
                    ),
                  ),
                if (onTap != null && chevron && !destructive)
                  Icon(Icons.chevron_right, color: theme.colorScheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A row with a switch, the whole row toggling it, as iOS does.
class SettingsSwitchRow extends StatelessWidget {
  const SettingsSwitchRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;

  /// Null while it cannot be changed, as while a change is being saved.
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final ValueChanged<bool>? change = onChanged;
    return MergeSemantics(
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: change == null ? null : () => change(!value),
          child: _RowBody(
            icon: icon,
            title: title,
            subtitle: subtitle,
            trailing: Switch.adaptive(value: value, onChanged: change),
          ),
        ),
      ),
    );
  }
}

/// One fact, as a contact card or a phone's medical ID sets it: what it is, small, above
/// what it says, in reading size, since what it says is the part that matters.
class SettingsFact extends StatelessWidget {
  const SettingsFact({required this.icon, required this.label, required this.value, super.key});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final double margin = MzaziLayout.margin(context);
    final double iconSize = (theme.textTheme.bodyLarge?.fontSize ?? 17) * 1.4;

    return MergeSemantics(
      child: ConstrainedBox(
        constraints: BoxConstraints(minHeight: MzaziSizes.of(context).target),
        child: Padding(
          padding: EdgeInsets.fromLTRB(margin, MzaziSpace.s12, margin, MzaziSpace.s12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Icon(icon, size: iconSize, color: theme.colorScheme.onSurface),
              const SizedBox(width: MzaziSpace.s16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(label, style: theme.textTheme.bodySmall),
                    const SizedBox(height: 2),
                    Text(value, style: theme.textTheme.bodyLarge),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A row in a list to pick several from, a tick at the end of each chosen one, the
/// whole row toggling it, as iOS marks a choice.
class SettingsCheckRow extends StatelessWidget {
  const SettingsCheckRow({
    required this.icon,
    required this.title,
    required this.checked,
    required this.onChanged,
    super.key,
  });

  final IconData icon;
  final String title;
  final bool checked;

  /// Null while it cannot be changed.
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final ValueChanged<bool>? change = onChanged;
    return Semantics(
      checked: checked,
      button: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: change == null ? null : () => change(!checked),
          child: _RowBody(
            icon: icon,
            title: title,
            // In ink, as the action sheet marks a choice: the theme's primary is the
            // emergency red, which a tick in a list has no business wearing. Kept in place
            // when clear, so the words do not move as rows are ticked.
            trailing: Icon(
              Icons.check,
              color: checked ? theme.colorScheme.onSurface : Colors.transparent,
            ),
          ),
        ),
      ),
    );
  }
}

/// A row that opens in place to show more, its chevron turning as it does. For what a
/// person looks at now and then rather than every time, such as their care circles.
class SettingsExpandable extends StatefulWidget {
  const SettingsExpandable({
    required this.icon,
    required this.title,
    required this.children,
    this.summary,
    this.initiallyOpen = false,
    super.key,
  });

  final IconData icon;
  final String title;

  /// What is inside, in a few words, while it is closed: "2 people".
  final String? summary;
  final List<Widget> children;
  final bool initiallyOpen;

  @override
  State<SettingsExpandable> createState() => _SettingsExpandableState();
}

class _SettingsExpandableState extends State<SettingsExpandable> {
  late bool _open = widget.initiallyOpen;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final bool still = MediaQuery.disableAnimationsOf(context);
    final Duration duration = still ? Duration.zero : const Duration(milliseconds: 200);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Semantics(
          button: true,
          expanded: _open,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: () => setState(() => _open = !_open),
              child: _RowBody(
                icon: widget.icon,
                title: widget.title,
                subtitle: _open ? null : widget.summary,
                trailing: AnimatedRotation(
                  turns: _open ? 0.25 : 0,
                  duration: duration,
                  child: Icon(Icons.chevron_right, color: theme.colorScheme.onSurfaceVariant),
                ),
              ),
            ),
          ),
        ),
        AnimatedSize(
          duration: duration,
          curve: Curves.easeOut,
          alignment: Alignment.topCenter,
          child: _open
              ? Padding(
                  padding: EdgeInsetsDirectional.only(
                    start: MzaziLayout.margin(context) + _iconColumn(context),
                    end: MzaziLayout.margin(context),
                    bottom: MzaziSpace.s12,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: widget.children,
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }
}

/// One choice in a pull-down.
class SettingsChoice<T> {
  const SettingsChoice(this.value, this.label, {this.icon});

  final T value;
  final String label;
  final IconData? icon;
}

/// A row whose value is chosen from a pull-down menu, the menu dropping from the value
/// at the end of the row with a tick by the current one, as iOS's pull-down buttons do.
class SettingsMenuRow<T> extends StatelessWidget {
  const SettingsMenuRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.choices,
    required this.onChanged,
    super.key,
  });

  final IconData icon;
  final String title;
  final T value;
  final List<SettingsChoice<T>> choices;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final SettingsChoice<T> current = choices.firstWhere(
      (SettingsChoice<T> c) => c.value == value,
      orElse: () => choices.first,
    );

    return MenuAnchor(
      alignmentOffset: const Offset(0, MzaziSpace.s4),
      // Floats over the page, so a soft shadow and a hairline rather than a frame, from
      // the end of the row where the value is, as an iOS pull-down drops.
      style: MenuStyle(
        alignment: AlignmentDirectional.bottomEnd,
        backgroundColor: WidgetStatePropertyAll<Color>(theme.colorScheme.surface),
        elevation: const WidgetStatePropertyAll<double>(8),
        shadowColor: WidgetStatePropertyAll<Color>(Colors.black.withValues(alpha: 0.25)),
        side: WidgetStatePropertyAll<BorderSide>(
          BorderSide(color: theme.colorScheme.outlineVariant, width: 0.5),
        ),
        shape: WidgetStatePropertyAll<OutlinedBorder>(
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(MzaziRadius.group)),
        ),
      ),
      menuChildren: <Widget>[
        for (final SettingsChoice<T> choice in choices)
          MenuItemButton(
            leadingIcon: SizedBox(
              width: 24,
              child: choice.value == value ? const Icon(Icons.check, size: 20) : null,
            ),
            trailingIcon: choice.icon == null ? null : Icon(choice.icon, size: 20),
            onPressed: () => onChanged(choice.value),
            child: Text(choice.label, style: theme.textTheme.bodyLarge),
          ),
      ],
      builder: (BuildContext context, MenuController menu, Widget? _) => Semantics(
        button: true,
        value: current.label,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: () => menu.isOpen ? menu.close() : menu.open(),
            child: _RowBody(
              icon: icon,
              title: title,
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Text(current.label, style: theme.textTheme.bodyMedium),
                  const SizedBox(width: 2),
                  Icon(Icons.unfold_more, size: 18, color: theme.colorScheme.onSurfaceVariant),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A line of words inside an open row: a name with a note under it.
class SettingsDetail extends StatelessWidget {
  const SettingsDetail({required this.title, this.note, super.key});

  final String title;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: MzaziSpace.s8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(title, style: theme.textTheme.bodyLarge),
          if (note case final String line) Text(line, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}

/// Opens [screen] over the current one.
void openScreen(BuildContext context, Widget screen) {
  unawaited(Navigator.of(context).push<void>(MaterialPageRoute<void>(builder: (_) => screen)));
}
