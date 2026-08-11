'use strict';

const EULER_HOSTS = new Set(['projecteuler.net', 'www.projecteuler.net']);

function normalizeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isProjectEulerUrl(value) {
  const url = normalizeUrl(value);
  return Boolean(url && EULER_HOSTS.has(url.hostname.toLowerCase()));
}

function parseEulerProblemId(value) {
  const url = normalizeUrl(value);
  if (!url || !EULER_HOSTS.has(url.hostname.toLowerCase())) return null;

  // Project Euler problem URLs use /problem=N. Accept a trailing slash but
  // deliberately reject other pages that merely contain a number.
  const match = url.pathname.match(/^\/problem=(\d+)\/?$/);
  if (!match) return null;

  const id = Number(match[1]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return id;
}

function classifyEulerPage(value) {
  const problemId = parseEulerProblemId(value);
  if (problemId !== null) {
    return { kind: 'problem', problemId };
  }
  if (isProjectEulerUrl(value)) {
    return { kind: 'euler-non-problem', problemId: null };
  }
  return { kind: 'external', problemId: null };
}

module.exports = {
  EULER_HOSTS,
  classifyEulerPage,
  isProjectEulerUrl,
  parseEulerProblemId,
};
