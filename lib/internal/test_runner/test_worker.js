'use strict';

const { pathToFileURL } = require('url');
const esmLoader = require('internal/modules/esm/loader'); // Internal ESM loader module
const { Buffer } = require('buffer');

module.exports = async function runTestWorker(workerData, parentPort) {
  const { testPath, cwd } = workerData;

  try {
    process.stdout.write = (chunk, encoding, callback) => {
      parentPort.postMessage({ type: 'stdout', data: chunk });
      if (callback) callback();
    };

    process.stderr.write = (chunk, encoding, callback) => {
      parentPort.postMessage({ type: 'stderr', data: chunk });
      if (callback) callback();
    };

    // Ensure process-level error handling
    process.on('uncaughtException', (err) => {
      parentPort.postMessage({
        type: 'error',
        data: {
          message: err.message,
          stack: err.stack,
        },
      });
    });

    process.on('unhandledRejection', (reason) => {
      parentPort.postMessage({
        type: 'error',
        data: {
          message: reason.message || 'Unhandled rejection',
          stack: reason.stack || '',
        },
      });
    });

    // Initialize ESM loader
    const cascadedLoader = esmLoader.getOrInitializeCascadedLoader();

    // Convert the test file path to a file URL
    const fileURL = pathToFileURL(testPath).href;

    await cascadedLoader.import(fileURL, undefined, { __proto__: null });

  } catch (error) {
    // Notify the parent thread of any errors during execution
    parentPort.postMessage({
      type: 'error',
      data: {
        message: error.message,
        stack: error.stack,
      },
    });
  }
};
