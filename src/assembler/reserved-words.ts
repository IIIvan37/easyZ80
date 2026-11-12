import { isMnemonic, isRegister } from "./instructions.ts";

const DIRECTIVES = ["ORG", "EQU", "DEFB", "DEFW", "DEFS"];

// The names FantAMS refuses as a label beyond registers and mnemonics, found by
// trying each word of its binary as a label (version of 2026-11-12).
const FANTAMS_KEYWORDS = [
  "ALIGN",
  "ASSERT_SIZE",
  "BANK",
  "BANKOF",
  "BOUNDARY",
  "CHARSET",
  "DS",
  "ELSE",
  "ELSEIF",
  "END",
  "ENDFOR",
  "ENDIF",
  "ENDM",
  "ENDMACRO",
  "ENDMODULE",
  "ENDREPEAT",
  "ENDWHILE",
  "END_BOUNDARY",
  "EXTERN",
  "FOR",
  "HIGH",
  "HX",
  "HY",
  "IF",
  "IFDEF",
  "IFNDEF",
  "INCBIN",
  "INCLUDE",
  "IXH",
  "IXL",
  "IYH",
  "IYL",
  "LET",
  "LOW",
  "LX",
  "LY",
  "MACRO",
  "MEND",
  "MODULE",
  "NOPS_BETWEEN",
  "OPCODE",
  "PC",
  "PUBLIC",
  "READ",
  "REND",
  "REPEAT",
  "RMB",
  "RUN",
  "SECTION",
  "SETCPC",
  "SLL",
  "SNASET",
  "STR",
  "STRUCT",
  "TICKER",
  "TO",
  "UNTIL",
  "WEND",
  "WHILE",
];

const RESERVED = new Set([...DIRECTIVES, ...FANTAMS_KEYWORDS]);

/** Whether `name`, upper-cased, cannot name a label or a constant. */
export const isReservedWord = (name: string) =>
  isRegister(name) ||
  isMnemonic(name) ||
  RESERVED.has(name) ||
  name.startsWith("__");
