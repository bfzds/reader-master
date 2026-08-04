export const createMigrationConflictResolver = function (choose) {
  let reusableIndex = null;
  return async function resolveMigrationConflict(context) {
    const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
    if (Number.isInteger(reusableIndex) && candidates[reusableIndex]) {
      return candidates[reusableIndex];
    }
    const selection = await choose(context);
    if (!selection || !Number.isInteger(selection.index) || !candidates[selection.index]) return null;
    reusableIndex = selection.applyToRemaining ? selection.index : null;
    return candidates[selection.index];
  };
};

export const getMigrationConflictDialogResult = function (returnValue, index, candidateCount) {
  if (!Number.isInteger(index) || index < 0 || index >= candidateCount) return null;
  if (returnValue === 'once') return { index, applyToRemaining: false };
  if (returnValue === 'apply') return { index, applyToRemaining: true };
  return null;
};
