'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Utils = require('./utils');

test('MYGGSPRAY lookup by relationId prefers occupancy isDetected and keeps lux', () => {
  const relationId = 'abc';
  const devices = [
    {
      id: `${relationId}_1`,
      relationId,
      deviceType: 'lightSensor',
      attributes: { illuminance: 12, customName: 'light' },
    },
    {
      id: `${relationId}_2`,
      relationId,
      deviceType: 'occupancySensor',
      attributes: { isDetected: true, customName: 'Liiketunnistin' },
    },
  ];
  const selected = Utils.selectDirigeraDevice(devices, relationId);
  assert.equal(selected.deviceType, 'occupancySensor');
  assert.equal(selected.attributes.isDetected, true);
  assert.equal(selected.attributes.illuminance, 12);
  assert.equal(selected.attributes.customName, 'Liiketunnistin');
});

test('lookup by occupancy endpoint id still returns occupancy', () => {
  const relationId = 'abc';
  const devices = [
    { id: `${relationId}_1`, relationId, deviceType: 'lightSensor', attributes: { illuminance: 1 } },
    { id: `${relationId}_2`, relationId, deviceType: 'occupancySensor', attributes: { isDetected: false } },
  ];
  const selected = Utils.selectDirigeraDevice(devices, `${relationId}_2`);
  assert.equal(selected.deviceType, 'occupancySensor');
  assert.equal(selected.attributes.isDetected, false);
});
