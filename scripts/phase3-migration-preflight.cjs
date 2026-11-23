const PHASE3_PREREQUISITES = Object.freeze({
  phase3: Object.freeze([
    '016-procurement',
    '017-commerce-foundation',
    '018-public-media',
    '019-point-of-sale',
    '020-procurement-expansion',
    '021-people-expansion',
    '026-app15-16',
  ]),
  'phase3-calendar': Object.freeze([
    '016-procurement',
    '017-commerce-foundation',
    '018-public-media',
    '019-point-of-sale',
    '020-procurement-expansion',
    '021-people-expansion',
    '026-app15-16',
    '027-website-forms',
  ]),
});

exports.missingPrerequisites = function (mode, appliedVersions) {
  const required = PHASE3_PREREQUISITES[mode];
  if (!required) throw new Error('Unknown Phase 3 migration mode');
  const applied = new Set(appliedVersions);
  return required.filter((version) => !applied.has(version));
};
