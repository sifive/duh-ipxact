'use strict';

const drom = require('@drom/eslint-config');

module.exports = [
  {ignores: ['dist/**', 'node_modules/**', 'import/**', 'specs/**']},
  drom,
  {
    files: ['bin/**/*.js'],
    rules: {'no-console': 'off'}
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    },
    rules: {'no-console': 'off'}
  }
];
