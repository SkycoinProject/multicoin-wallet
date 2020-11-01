/**
 * Return true if current is equal or superior to target. Versions must be composed of 3
 * parts, separated by points.
 */
export function isEqualOrSuperiorVersion(current: string, target: string): boolean {
  const currentParts = current.split('.');
  if (currentParts.length !== 3) { return false; }

  const targetParts = target.split('.');
  if (targetParts.length !== 3) { return false; }

  for (let i = 0; i < 3; i++) {
    const currentNumber = Number(currentParts[i]);
    const targetNumber = Number(targetParts[i]);

    if (currentNumber > targetNumber) {
      return true;
    }

    if (currentNumber < targetNumber) {
      return false;
    }
  }

  return true;
}
