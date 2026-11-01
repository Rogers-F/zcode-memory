/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode apps/zcode-cli/packages/core/src/tool/handlers/bash-readonly-policy-commands.ts.
 * Modifications: TypeScript types erased for the standalone DSH JavaScript ESM port.
 * Original runtime behavior retained. See package LICENSE/NOTICE for attribution.
 */
                                                                                 
import { GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_CORE } from "./bash-readonly-policy-git-subcommands-core.js";
import { GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_HISTORY } from "./bash-readonly-policy-git-subcommands-history.js";
import { READONLY_MULTIWORD_POLICY_ENTRIES_CORE } from "./bash-readonly-policy-multiword-core.js";
import { READONLY_MULTIWORD_POLICY_ENTRIES_GH } from "./bash-readonly-policy-multiword-gh.js";

export {
  GIT_GLOBAL_DANGEROUS_FLAGS,
  GIT_GLOBAL_NO_VALUE_FLAGS,
  GIT_GLOBAL_VALUE_FLAGS,
  READONLY_ALLOW_ANY_ARG_COMMAND_PREFIXES,
  READONLY_ALLOW_ANY_ARG_COMMANDS,
  READONLY_COMMAND_POLICIES,
} from "./bash-readonly-policy-simple-commands.js";

export const GIT_READONLY_SUBCOMMAND_POLICIES = new Map                                   ([
  ...GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_CORE,
  ...GIT_READONLY_SUBCOMMAND_POLICY_ENTRIES_HISTORY,
]);

export const READONLY_MULTIWORD_COMMAND_POLICIES = new Map                                   ([
  ...READONLY_MULTIWORD_POLICY_ENTRIES_CORE,
  ...READONLY_MULTIWORD_POLICY_ENTRIES_GH,
]);
