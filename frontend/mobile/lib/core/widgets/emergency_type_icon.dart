import 'package:flutter/material.dart';

import '../api/models.dart';

/// The picture beside each kind of emergency, the same wherever it is shown.
IconData emergencyTypeIcon(EmergencyType type) => switch (type) {
  EmergencyType.fall => Icons.personal_injury_outlined,
  EmergencyType.breathing => Icons.monitor_heart_outlined,
  EmergencyType.unwell => Icons.sick_outlined,
  EmergencyType.fire => Icons.local_fire_department_outlined,
  EmergencyType.unsafe => Icons.local_police_outlined,
};
