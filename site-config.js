(function (root) {
  'use strict';

  var versions = {
    campaignProtocol: 'ng-campaign-v1',
    campaignContentVersion: '3.2',
    rulesetId: 'null-grail-core-d20-v2.1',
    rulesetVersion: '2.1',
    rulesetLabel: '《零之圣杯》通用圣杯战争规则 · 规则版本 2.1',
    rulesetShortLabel: 'v2.1',
    playerProtocol: 'null-grail-player-v4',
    characterProtocol: 'null-grail-character-v3',
    checkProtocol: 'null-grail-check-v2',
    characterSchemaVersion: 3,
    legacyRulesetIds: [
      'null-grail-core-d20-v2',
      'null-grail-core-d20-v2.0',
      'null-grail-general-v2.0'
    ],
    legacyCharacterProtocols: [
      'null-grail-character-v1',
      'null-grail-character-v2',
      'null-grail-character-v3'
    ]
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function canMigrateCharacter(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var protocol = String(value.protocol || versions.characterProtocol);
    var rulesetId = String(value.rulesetId || '');
    var knownProtocol = versions.legacyCharacterProtocols.indexOf(protocol) !== -1;
    var knownRuleset = rulesetId === versions.rulesetId || versions.legacyRulesetIds.indexOf(rulesetId) !== -1;
    return knownProtocol && knownRuleset;
  }

  function migrateCharacter(value) {
    if (!canMigrateCharacter(value)) return null;
    var migrated = clone(value);
    if (migrated.rulesetId !== versions.rulesetId) {
      migrated.migratedFromRulesetId = migrated.rulesetId;
    }
    migrated.protocol = versions.characterProtocol;
    migrated.rulesetId = versions.rulesetId;
    migrated.rulesetVersion = versions.rulesetShortLabel;
    migrated.schemaVersion = versions.characterSchemaVersion;
    return migrated;
  }

  root.NG_SITE_CONFIG = Object.freeze({
    versions: Object.freeze(versions),
    canMigrateCharacter: canMigrateCharacter,
    migrateCharacter: migrateCharacter
  });
})(typeof window !== 'undefined' ? window : globalThis);
