'use strict';
const test = require('node:test');

test('every console method', () => {
  console.log('log');
  console.info('info');
  console.debug('debug');
  console.warn('warn');
  console.error('error');

  console.dir({ nested: { deep: { deeper: true } } }, { depth: 0 });
  console.dirxml('dirxml');
  console.table([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);

  console.group('group');
  console.log('inside group');
  console.log('two lines\ninside group');
  console.groupCollapsed('collapsed group');
  console.warn('inside collapsed group');
  console.groupEnd();
  console.groupEnd();
  console.log('outside groups');

  console.assert(true, 'not printed');
  console.assert(false, 'assertion message');

  console.count('counter');
  console.count('counter');
  console.countReset('counter');
  console.count('counter');

  console.time('timer');
  console.timeLog('timer', 'checkpoint');
  console.timeEnd('timer');

  console.trace('trace message');

  // Without a TTY, clear() writes nothing.
  console.clear();
});
