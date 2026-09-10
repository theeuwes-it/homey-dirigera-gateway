'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  toHomeySet,
  fromHomeySet,
  toHomeyClosed,
  fromHomeyClosed,
} = require('./position');

test('DIRIGERA 0 is Homey fully open and 100 is fully closed', () => {
  assert.equal(toHomeySet(0, false), 1);
  assert.equal(toHomeySet(100, false), 0);
  assert.equal(toHomeySet(25, false), 0.75);
  assert.equal(toHomeyClosed(0, false), false);
  assert.equal(toHomeyClosed(100, false), true);
});

test('Homey open/close commands send the matching DIRIGERA target', () => {
  assert.equal(fromHomeySet(1, false), 0);
  assert.equal(fromHomeySet(0, false), 100);
  assert.equal(fromHomeySet(0.75, false), 25);
  assert.equal(fromHomeyClosed(true, false), 100);
  assert.equal(fromHomeyClosed(false, false), 0);
});

test('swap up/down inverts both reported state and commands', () => {
  assert.equal(toHomeySet(0, true), 0);
  assert.equal(toHomeySet(100, true), 1);
  assert.equal(toHomeyClosed(0, true), true);
  assert.equal(toHomeyClosed(100, true), false);
  assert.equal(fromHomeySet(1, true), 100);
  assert.equal(fromHomeySet(0, true), 0);
  assert.equal(fromHomeyClosed(true, true), 0);
  assert.equal(fromHomeyClosed(false, true), 100);
});
