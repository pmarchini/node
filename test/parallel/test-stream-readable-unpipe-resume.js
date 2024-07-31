'use strict';

const common = require('../common');
const stream = require('stream');
const fs = require('fs');

const fixtures = require('../common/fixtures');
const fixtureFilePath = fixtures.path('x.txt');

const readStream = fs.createReadStream(fixtureFilePath);

const transformStream = new stream.Transform({
  transform: common.mustCall(() => {
    readStream.unpipe();
    readStream.resume();
  })
});

readStream.on('end', common.mustCall());

readStream
  .pipe(transformStream)
  .resume();
