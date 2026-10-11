import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import 'countries.dart';
import 'country.dart';
import 'phone_number.dart';

/// The country and the number typed so far, read together.
class PhoneFieldController extends ChangeNotifier {
  PhoneFieldController({Country? country}) : _country = country ?? defaultCountry;

  final TextEditingController text = TextEditingController();
  Country _country;

  Country get country => _country;
  set country(Country value) {
    if (value == _country) return;
    _country = value;
    notifyListeners();
  }

  /// The number as the API wants it, or why it is not one yet.
  PhoneReading get reading => readPhone(_country, text.text);

  @override
  void dispose() {
    text.dispose();
    super.dispose();
  }
}

/// A phone number field with a country button in front of it.
///
/// Kenya is chosen to begin with, so most people only ever type their number, in
/// whatever way they are used to writing it. The country button opens a searchable
/// list of every country with its dialling code.
class PhoneField extends StatelessWidget {
  const PhoneField({
    required this.controller,
    this.label = 'Phone number',
    this.textInputAction = TextInputAction.next,
    this.onSubmitted,
    super.key,
  });

  final PhoneFieldController controller;
  final String label;
  final TextInputAction textInputAction;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) {
        final Country country = controller.country;
        // As tall as the text field beside it: the theme's sixteen-point padding above
        // and below, plus one line of the field's text. Never under the touch floor.
        final TextStyle? body = Theme.of(context).textTheme.bodyLarge;
        final double fieldHeight =
            MzaziSpace.s16 * 2 + (body?.fontSize ?? 16) * (body?.height ?? 1.25);
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Semantics(
              button: true,
              label: 'Country code, ${country.name}, plus ${country.dial}. Change country.',
              excludeSemantics: true,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  // The theme's buttons are full width; this one sits beside a field.
                  minimumSize: Size(0, fieldHeight < 48 ? 48 : fieldHeight),
                  padding: const EdgeInsets.symmetric(horizontal: MzaziSpace.s12),
                ),
                onPressed: () => _choose(context),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text(country.flag),
                    const SizedBox(width: MzaziSpace.s4),
                    Text('+${country.dial}'),
                    const Icon(Icons.arrow_drop_down),
                  ],
                ),
              ),
            ),
            const SizedBox(width: MzaziSpace.s8),
            Expanded(
              child: TextFormField(
                controller: controller.text,
                keyboardType: TextInputType.phone,
                textInputAction: textInputAction,
                autofillHints: const <String>[AutofillHints.telephoneNumberNational],
                // No hint text. An example number in a sign-in field once disclosed a
                // real account, and the label says what the field is.
                decoration: InputDecoration(labelText: label),
                validator: (_) => controller.reading.problem,
                onFieldSubmitted: onSubmitted,
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _choose(BuildContext context) async {
    final Country? chosen = await showModalBottomSheet<Country>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (BuildContext sheetContext) => _CountryList(current: controller.country),
    );
    if (chosen != null) controller.country = chosen;
  }
}

class _CountryList extends StatefulWidget {
  const _CountryList({required this.current});

  final Country current;

  @override
  State<_CountryList> createState() => _CountryListState();
}

class _CountryListState extends State<_CountryList> {
  String _query = '';

  /// Matches a name, an ISO code, or a dialling code with or without its plus.
  List<Country> get _matches {
    final String q = _query.trim().toLowerCase().replaceFirst('+', '');
    if (q.isEmpty) return countries;
    return countries
        .where(
          (Country c) =>
              c.name.toLowerCase().contains(q) || c.iso.toLowerCase() == q || c.dial.startsWith(q),
        )
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final List<Country> matches = _matches;

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.9,
      maxChildSize: 0.95,
      builder: (BuildContext context, ScrollController scroll) => Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(
              MzaziSpace.s16,
              MzaziSpace.s16,
              MzaziSpace.s16,
              MzaziSpace.s8,
            ),
            child: TextField(
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Search for a country or code',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (String value) => setState(() => _query = value),
            ),
          ),
          Expanded(
            child: matches.isEmpty
                ? const Center(child: Text('No country matches that.'))
                : ListView.builder(
                    controller: scroll,
                    itemCount: matches.length,
                    itemBuilder: (BuildContext context, int index) {
                      final Country country = matches[index];
                      return ListTile(
                        leading: Text(country.flag, style: const TextStyle(fontSize: 24)),
                        title: Text(country.name),
                        trailing: Text('+${country.dial}'),
                        selected: country == widget.current,
                        onTap: () => Navigator.of(context).pop(country),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
