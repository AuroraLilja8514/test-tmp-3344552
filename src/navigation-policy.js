'use strict';

const { classifyEulerPage, parseEulerProblemId } = require('./problem');

/**
 * Describe what must happen before and after a left-pane navigation.
 *
 * Rules:
 * - entering /problem=N binds N and opens its notebook;
 * - list/login/account/forum pages never create or switch notebooks;
 * - leaving a problem page saves the currently open notebook first;
 * - moving problem N -> M saves before switching;
 * - external pages are not allowed inside the Project Euler pane.
 */
function navigationPlan(fromUrl, toUrl, rightNotebookProblemId = null) {
  const from = classifyEulerPage(fromUrl);
  const to = classifyEulerPage(toUrl);
  const targetProblemId = to.problemId;

  const leavingBoundProblem = from.kind === 'problem' && from.problemId !== targetProblemId;
  const switchingRightNotebook =
    targetProblemId !== null &&
    rightNotebookProblemId !== null &&
    rightNotebookProblemId !== targetProblemId;

  return {
    from,
    to,
    targetProblemId,
    shouldSaveBeforeNavigation: leavingBoundProblem,
    shouldSaveBeforeNotebookSwitch: switchingRightNotebook,
    shouldOpenProblemNotebook: targetProblemId !== null,
    shouldClearPageBinding: targetProblemId === null,
    allowInLeftPane: to.kind !== 'external',
  };
}

function shouldSaveBeforeHistoryNavigation(currentUrl) {
  return parseEulerProblemId(currentUrl) !== null;
}

module.exports = {
  navigationPlan,
  shouldSaveBeforeHistoryNavigation,
};
