'use strict';

const { pathToFileURL } = require('url');
const esmLoader = require('internal/modules/esm/loader'); // Internal ESM loader module

module.exports = async function runTestWorker(workerData, parentPort) {
  const { testPath, args, env, cwd } = workerData;

  try {
    // Set environment variables
    Object.assign(process.env, env);

    // Capture stdout and stderr using stream listeners
    process.stdout.on('data', (chunk) => {
      parentPort.postMessage({ type: 'stdout', data: chunk.toString() });
    });

    process.stderr.on('data', (chunk) => {
      parentPort.postMessage({ type: 'stderr', data: chunk.toString() });
    });

    // Ensure process-level error handling
    process.on('uncaughtException', (err) => {
      parentPort.postMessage({
        type: 'error',
        data: {
          message: err.message,
          stack: err.stack,
        },
      });
      parentPort.postMessage({ type: 'exit', code: 1 });
    });

    process.on('unhandledRejection', (reason) => {
      parentPort.postMessage({
        type: 'error',
        data: {
          message: reason.message || 'Unhandled rejection',
          stack: reason.stack || '',
        },
      });
      parentPort.postMessage({ type: 'exit', code: 1 });
    });

    // Initialize ESM loader
    const cascadedLoader = esmLoader.getOrInitializeCascadedLoader();

    // Convert the test file path to a file URL
    const fileURL = pathToFileURL(testPath).href;

    // Debugging: Notify parent of loading process
    // parentPort.postMessage({ type: 'stdout', data: `Loading test file: ${fileURL}\n` });

    await cascadedLoader.import(fileURL, undefined, { __proto__: null });

    // Notify the parent thread of successful execution
    parentPort.postMessage({ type: 'exit', code: 0 });
  } catch (error) {
    // Notify the parent thread of any errors during execution
    parentPort.postMessage({
      type: 'error',
      data: {
        message: error.message,
        stack: error.stack,
      },
    });
    parentPort.postMessage({ type: 'exit', code: 1 });
  }
};
