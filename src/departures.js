exports.groups = [
  { label: 'Morning', times: ['06:00', '08:00', '10:00'] },
  { label: 'Noon', times: ['12:00', '14:00'] },
  { label: 'Evening', times: ['16:00', '18:00'] },
  { label: 'Night', times: ['20:00', '22:00', '23:30'] },
];
const times = new Set(exports.groups.flatMap(group => group.times));
exports.isAvailable = time => times.has(time);
