import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mzazicare_tokens/mzazicare_tokens.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/models.dart';

/// Searching for a place and choosing one of the matches: an elder's home, or where
/// they are staying.
///
/// Searched when Search is pressed, never as the person types: the address search
/// behind it is OpenStreetMap's public service, whose usage policy forbids
/// search-as-you-type. The attribution its licence asks for is shown under the results.
class AddressPicker extends StatefulWidget {
  const AddressPicker({
    required this.api,
    required this.chosen,
    required this.showMissing,
    required this.onChosen,
    this.title = 'Where is their home?',
    this.explanation =
        'Alerts from them are sent to this place, and responders get directions to it.',
    this.chosenPrefix = 'Home',
    super.key,
  });

  final String title;
  final String explanation;

  /// Shown before the chosen place, for example "Home: Kilimani, Nairobi".
  final String chosenPrefix;

  final ApiClient api;
  final AddressMatch? chosen;
  final bool showMissing;
  final ValueChanged<AddressMatch> onChosen;

  @override
  State<AddressPicker> createState() => _AddressPickerState();
}

class _AddressPickerState extends State<AddressPicker> {
  final TextEditingController _query = TextEditingController();
  AddressSearchResult? _result;
  String? _error;
  bool _searching = false;

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    if (_query.text.trim().length < 3) {
      setState(() => _error = 'Type at least three letters of the address.');
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final AddressSearchResult result = await widget.api.searchAddress(_query.text);
      if (!mounted) return;
      setState(() {
        _result = result;
        _searching = false;
        if (result.matches.isEmpty) {
          _error = 'Nothing found. Try the estate or road, then the town.';
        }
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AddressSearchResult? result = _result;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(widget.title, style: theme.textTheme.titleMedium),
        const SizedBox(height: MzaziSpace.s4),
        Text(widget.explanation, style: theme.textTheme.bodySmall),
        const SizedBox(height: MzaziSpace.s12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Expanded(
              child: TextField(
                controller: _query,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  labelText: 'Estate, road or building',
                  helperText: 'For example: Kileleshwa, Nairobi',
                ),
                onSubmitted: (_) => unawaited(_search()),
              ),
            ),
            const SizedBox(width: MzaziSpace.s8),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 56)),
              onPressed: _searching ? null : () => unawaited(_search()),
              icon: const Icon(Icons.search),
              label: const Text('Search'),
            ),
          ],
        ),
        if (_error != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
        ],
        if (widget.showMissing && widget.chosen == null && _error == null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Text(
            'Search for the place and choose it from the list.',
            style: TextStyle(color: theme.colorScheme.error),
          ),
        ],
        if (result != null && result.matches.isNotEmpty) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          RadioGroup<AddressMatch>(
            groupValue: widget.chosen,
            onChanged: (AddressMatch? match) {
              if (match != null) widget.onChosen(match);
            },
            child: Column(
              children: <Widget>[
                for (final AddressMatch match in result.matches)
                  RadioListTile<AddressMatch>(
                    contentPadding: EdgeInsets.zero,
                    value: match,
                    title: Text(match.label, style: theme.textTheme.bodyMedium),
                  ),
              ],
            ),
          ),
          Text(result.attribution, style: theme.textTheme.bodySmall),
        ],
        if (widget.chosen != null) ...<Widget>[
          const SizedBox(height: MzaziSpace.s8),
          Row(
            children: <Widget>[
              const Icon(Icons.home_outlined),
              const SizedBox(width: MzaziSpace.s8),
              Expanded(
                child: Text(
                  '${widget.chosenPrefix}: ${widget.chosen!.label}',
                  style: theme.textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
