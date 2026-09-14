'use strict';
// Logs from a module other than the test file. The output is attributed to the
// test that calls the function, not to the module holding the console call.
module.exports.logFromModule = function logFromModule(message) {
  console.log(message);
};
