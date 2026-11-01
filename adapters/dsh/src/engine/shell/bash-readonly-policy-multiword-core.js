/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode apps/zcode-cli/packages/core/src/tool/handlers/bash-readonly-policy-multiword-core.ts.
 * Modifications: TypeScript types erased for the standalone DSH JavaScript ESM port.
 * Original runtime behavior retained. See package LICENSE/NOTICE for attribution.
 */
                                                                                 
import {
  dockerCommandIsDangerous,
  ghCommandIsDangerous,
} from "./bash-readonly-policy-callbacks.js";
import { DOCKER_INSPECT_SAFE_FLAGS, DOCKER_LOGS_SAFE_FLAGS } from "./bash-readonly-policy-flags.js";

export const READONLY_MULTIWORD_POLICY_ENTRIES_CORE = [
  [
    "docker inspect",
    {
      safeFlags: DOCKER_INSPECT_SAFE_FLAGS,
      additionalCommandIsDangerousCallback: dockerCommandIsDangerous,
    },
  ],
  [
    "docker logs",
    {
      safeFlags: DOCKER_LOGS_SAFE_FLAGS,
      additionalCommandIsDangerousCallback: dockerCommandIsDangerous,
    },
  ],
  [
    "gh auth status",
    {
      safeFlags: {
        "-a": "none",
        "-h": "string",
        "--active": "none",
        "--hostname": "string",
        "--json": "string",
      },
      additionalCommandIsDangerousCallback: ghCommandIsDangerous,
    },
  ],
]                                                                             ;
