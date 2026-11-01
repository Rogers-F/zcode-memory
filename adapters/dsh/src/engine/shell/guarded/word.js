/**
 * SPDX-License-Identifier: Apache-2.0
 * Derived from ZCode apps/zcode-cli/packages/core/src/tool/handlers/guarded/word.ts.
 * Modifications: TypeScript types erased for the standalone DSH JavaScript ESM port.
 * Original runtime behavior retained. See package LICENSE/NOTICE for attribution.
 */
/** AST 定位后的单词事实；不执行 expansion，也不将未知词当作已知选项。 */
                              
                
                   
                           
                
              
 

export function literalPosixWord(text        , start        , end        )              {
  let value = "";
  let quote = "";
  let dynamic = false;
  let hasUnquotedGlob = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] ;
    if (c === quote) {
      quote = "";
      continue;
    }
    if (quote !== "'" && c === "\\") {
      const next = text[i + 1];
      if (next === undefined) {
        dynamic = true;
        break;
      }
      if (!quote || ["$", "`", '"', "\\", "\n"].includes(next)) {
        if (next !== "\n") value += next;
        i++;
        continue;
      }
    }
    if (!quote && (c === "'" || c === '"')) {
      quote = c;
      continue;
    }
    if (quote !== "'" && (c === "$" || c === "`")) dynamic = true;
    if (!quote && /[*?[{}~]/.test(c)) dynamic = true;
    if (!quote && /[*?[]/.test(c)) hasUnquotedGlob = true;
    value += c;
  }
  return { value, dynamic: dynamic || Boolean(quote), hasUnquotedGlob, start, end };
}

export function commandBasename(word             , windows         )                     {
  if (word.dynamic) return undefined;
  const name = word.value.split(windows ? /[\\/]/ : /\//).at(-1) ;
  return windows ? name.toLowerCase().replace(/\.exe$/, "") : name;
}
