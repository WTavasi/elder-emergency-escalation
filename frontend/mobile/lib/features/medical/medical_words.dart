import 'package:flutter/material.dart';

import '../../core/api/medical_models.dart';
import '../../core/api/models.dart';

/// The icon for each ticked item: a condition, a treatment, or how they get about.
IconData medicalFlagIcon(String flag) => switch (flag) {
  'BLOOD_THINNERS' || 'INSULIN' => Icons.medication_outlined,
  'PACEMAKER' => Icons.monitor_heart_outlined,
  'HOME_OXYGEN' => Icons.air,
  'WALKING_AID' || 'CANNOT_WALK' => Icons.accessible_outlined,
  'HARD_OF_HEARING' => Icons.hearing_outlined,
  'POOR_SIGHT' => Icons.visibility_outlined,
  'DEMENTIA' => Icons.psychology_outlined,
  _ => Icons.favorite_border,
};

const List<String> _months = <String>[
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/// "15 Mar 1948" from "1948-03-15".
String birthDay(String date) {
  final DateTime? parsed = DateTime.tryParse(date);
  if (parsed == null) return date;
  return '${parsed.day} ${_months[parsed.month - 1]} ${parsed.year}';
}

/// "5 Nov, 17:07".
String dayAndTime(DateTime at) {
  final String minute = at.minute.toString().padLeft(2, '0');
  return '${at.day} ${_months[at.month - 1]}, ${at.hour}:$minute';
}

/// "80 years old · Blood type O+", or null when neither is known.
String? ageAndBlood(int? age, String? bloodType) {
  final List<String> parts = <String>[
    if (age != null) '$age years old',
    if (bloodType != null) 'Blood type $bloodType',
  ];
  return parts.isEmpty ? null : parts.join(' · ');
}

/// "medicines and allergies", for a change.
String changedParts(List<String> fields) {
  final List<String> names = fields.map((String f) => medicalFieldNames[f] ?? f).toList();
  if (names.isEmpty) return 'their details';
  if (names.length == 1) return names.single;
  return '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
}

/// "Caregiver", "Family", "Emergency responder".
String roleWord(Role? role) => switch (role) {
  Role.caregiver => 'Caregiver',
  Role.familyMember => 'Family',
  Role.emergencyResponder => 'Emergency responder',
  Role.elder => 'Themselves',
  _ => '',
};

/// First name, for sentences about somebody.
String firstNameOf(String name) {
  final String trimmed = name.trim();
  return trimmed.isEmpty ? 'They' : trimmed.split(RegExp(r'\s+')).first;
}
