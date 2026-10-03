export const DEFAULT_INPUT_MIB = 128;
const MIB = 1024 * 1024;

/** Restored workspace archives stay bounded, including opt-in larger inputs. */
export function verificationInputMiB(value?: number): number {
  const limit = value === undefined ? DEFAULT_INPUT_MIB : value;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(limit * MIB))
    throw new Error("Verification inputMiB must be a positive integer with a safe byte count");
  return limit;
}

export function verificationInputBytes(value?: number): number {
  return verificationInputMiB(value) * MIB;
}
