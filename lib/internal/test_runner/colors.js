'use strict';
const {
  SafeMap,
  ObjectKeys,
} = primordials;
const {
  validateString,
  validateFunction,
  validateObject,
} = require('internal/validators');
const { green, yellow, red, blue, gray, white } = require('internal/util/colors');

const kDefaultCoverageColors = {
  __proto__: null,
  high: green,
  medium: yellow,
  low: red,
};

const kDefaultReporterColors = {
  '__proto__': null,
  'test:fail': red,
  'test:pass': green,
  'test:diagnostic': blue,
  'info': blue,
  'warn': yellow,
  'error': red,
};

let coverageColorMap;
let reporterColorMap;

function getCoverageColorMap() {
  if (coverageColorMap === undefined) {
    coverageColorMap = new SafeMap();

    const keys = ObjectKeys(kDefaultCoverageColors);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      coverageColorMap.set(key, kDefaultCoverageColors[key]);
    }
  }

  return coverageColorMap;
}

function getReporterColorMap() {
  if (reporterColorMap === undefined) {
    reporterColorMap = new SafeMap();

    const keys = ObjectKeys(kDefaultReporterColors);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      reporterColorMap.set(key, kDefaultReporterColors[key]);
    }
  }

  return reporterColorMap;
}

function registerCoverageColor(name, color) {
  validateString(name, 'name');
  validateString(color, 'color');
  const map = getCoverageColorMap();
  map.set(name, color);
}

function registerReporterColor(name, color) {
  validateString(name, 'name');
  validateString(color, 'color');
  const map = getReporterColorMap();
  map.set(name, color);
}

function registerCoverageColorSchema(schema) {
  validateObject(schema, 'schema');
  const map = getCoverageColorMap();

  const keys = ObjectKeys(schema);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    validateString(schema[key], `schema.${key}`);
    map.set(key, schema[key]);
  }
}

function registerReporterColorSchema(schema) {
  validateObject(schema, 'schema');
  const map = getReporterColorMap();

  const keys = ObjectKeys(schema);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    validateString(schema[key], `schema.${key}`);
    map.set(key, schema[key]);
  }
}

module.exports = {
  getCoverageColorMap,
  getReporterColorMap,
  registerCoverageColor,
  registerReporterColor,
  registerCoverageColorSchema,
  registerReporterColorSchema,
};
