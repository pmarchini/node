'use strict';
const test = require('node:test');

test('a-todo.cjs fails but is only a todo', { todo: true }, () => {
  throw new Error('known failure');
});
