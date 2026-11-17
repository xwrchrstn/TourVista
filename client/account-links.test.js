import test from 'node:test';
import assert from 'node:assert/strict';
import { accountToken } from './src/account-links.js';
import { readRoute, canOpenPage } from './src/flow.js';
test('Email links accept only bounded tokens, preserve their destination and never become arbitrary redirects', () => {
  const token = 'a'.repeat(64);
  assert.equal(accountToken('#/verify-email?token=' + token), token);
  assert.equal(accountToken('#/reset?token=' + token), token);
  for (const value of ['', 'javascript:alert(1)', 'a'.repeat(63), 'a'.repeat(65), '<b>']) assert.equal(accountToken('#/reset?token=' + value), '');
  assert.equal(readRoute('#/verify-email?token=' + token).page, 'verify-email');
  assert.equal(canOpenPage(undefined, 'verify-email'), true);
  for (const role of ['tourist', 'owner', 'admin']) assert.equal(canOpenPage(role, 'account'), true);
  assert.equal(canOpenPage(undefined, 'account'), false);
});
