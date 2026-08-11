'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyEulerPage, isProjectEulerUrl, parseEulerProblemId } = require('../src/problem');

const cases = [
  ['https://projecteuler.net/problem=1', 1],
  ['https://projecteuler.net/problem=0007', 7],
  ['https://www.projecteuler.net/problem=932', 932],
  ['https://projecteuler.net/problem=12/', 12],
];

for (const [url, expected] of cases) {
  test(`parses ${url}`, () => assert.equal(parseEulerProblemId(url), expected));
}

test('does not treat list/login/account pages as problems', () => {
  for (const url of [
    'https://projecteuler.net/archives',
    'https://projecteuler.net/sign_in',
    'https://projecteuler.net/account',
    'https://projecteuler.net/about',
  ]) {
    assert.equal(parseEulerProblemId(url), null);
    assert.equal(classifyEulerPage(url).kind, 'euler-non-problem');
  }
});

test('rejects lookalike and external hosts', () => {
  assert.equal(isProjectEulerUrl('https://projecteuler.net.evil.example/problem=1'), false);
  assert.equal(parseEulerProblemId('https://example.com/problem=1'), null);
  assert.equal(parseEulerProblemId('https://projecteuler.net/thread=1'), null);
});
