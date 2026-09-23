'use strict';

/**
 * DIRIGERA blindsCurrentLevel / blindsTargetLevel: 0 = fully open, 100 = fully closed.
 * Homey windowcoverings_set: 0 = closed, 1 = open.
 * Homey windowcoverings_closed: true = closed.
 *
 * swapUpDown inverts that mapping for blinds that report or are mounted the other way.
 */

function clampPercent(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toHomeySet(dirigeraLevel, swapUpDown) {
  const level = Number(dirigeraLevel);
  if (!Number.isFinite(level)) return null;
  const openPercent = swapUpDown ? level : 100 - level;
  return clampPercent(openPercent) / 100;
}

function fromHomeySet(homeySet, swapUpDown) {
  const value = Number(homeySet);
  if (!Number.isFinite(value)) return null;
  const closedPercent = swapUpDown ? value * 100 : 100 - value * 100;
  return clampPercent(closedPercent);
}

function toHomeyClosed(dirigeraLevel, swapUpDown) {
  const level = Number(dirigeraLevel);
  if (!Number.isFinite(level)) return null;
  return swapUpDown ? level === 0 : level === 100;
}

function fromHomeyClosed(closed, swapUpDown) {
  if (swapUpDown) return closed ? 0 : 100;
  return closed ? 100 : 0;
}

module.exports = {
  toHomeySet,
  fromHomeySet,
  toHomeyClosed,
  fromHomeyClosed,
};
