import '../../../common/index.mjs';
import * as fixtures from '../../../common/fixtures.mjs';
import { spawn } from 'node:child_process';

spawn(process.execPath,
      [
        '--no-warnings', '--test', '--test-bail', '--test-isolation=none',
        '--test-reporter', 'tap',
        fixtures.path('test-runner/bail/a.mjs'),
        fixtures.path('test-runner/bail/b.mjs'),
      ],
      { stdio: 'inherit' });
