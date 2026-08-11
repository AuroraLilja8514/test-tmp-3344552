'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { navigationPlan } = require('../src/navigation-policy');

test('problem -> list saves but does not open or create another notebook', () => {
  const plan = navigationPlan(
    'https://projecteuler.net/problem=17',
    'https://projecteuler.net/archives',
    17
  );
  assert.equal(plan.shouldSaveBeforeNavigation, true);
  assert.equal(plan.shouldOpenProblemNotebook, false);
  assert.equal(plan.shouldClearPageBinding, true);
  assert.equal(plan.targetProblemId, null);
});

test('problem -> login saves and keeps notebook identity unbound', () => {
  const plan = navigationPlan(
    'https://projecteuler.net/problem=17',
    'https://projecteuler.net/sign_in',
    17
  );
  assert.equal(plan.shouldSaveBeforeNavigation, true);
  assert.equal(plan.shouldOpenProblemNotebook, false);
});

test('list -> problem opens the matching notebook without inventing one for list', () => {
  const plan = navigationPlan(
    'https://projecteuler.net/archives',
    'https://projecteuler.net/problem=18',
    17
  );
  assert.equal(plan.shouldSaveBeforeNavigation, false);
  assert.equal(plan.shouldSaveBeforeNotebookSwitch, true);
  assert.equal(plan.shouldOpenProblemNotebook, true);
  assert.equal(plan.targetProblemId, 18);
});

test('problem -> same problem does not require a switch', () => {
  const plan = navigationPlan(
    'https://projecteuler.net/problem=18',
    'https://projecteuler.net/problem=18',
    18
  );
  assert.equal(plan.shouldSaveBeforeNavigation, false);
  assert.equal(plan.shouldSaveBeforeNotebookSwitch, false);
});

test('external pages are not allowed in the left pane', () => {
  const plan = navigationPlan(
    'https://projecteuler.net/problem=18',
    'https://en.wikipedia.org/wiki/Prime_number',
    18
  );
  assert.equal(plan.allowInLeftPane, false);
});
