/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode apps/zcode-cli/packages/core/src/tool/handlers/bash-readonly-policy.ts.
 * Modifications: TypeScript types erased for the standalone DSH JavaScript ESM port.
 * Original runtime behavior retained. See package LICENSE/NOTICE for attribution.
 */
export {
  evaluateBashReadonlyPolicy,
  hasKnownBashWriteOption,
} from "./bash-readonly-policy-argv.js";
export { isSedInPlaceOption } from "./bash-readonly-policy-callbacks.js";
