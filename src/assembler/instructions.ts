/** Why a line gives no bytes, as a code with data (ADR 0005). */
export type Problem =
  | { readonly kind: "unknown-instruction" }
  | {
      readonly kind: "number-too-big";
      readonly value: number;
      readonly bits: 8 | 16;
    }
  | { readonly kind: "jump-too-far"; readonly distance: number }
  | {
      readonly kind: "displacement-out-of-range";
      readonly displacement: number;
    };

type TooBig = Extract<Problem, { kind: "number-too-big" }>;
type TooFar = Extract<Problem, { kind: "jump-too-far" }>;

const UNKNOWN: Problem = { kind: "unknown-instruction" };

/**
 * Reads one operand as written in the source, upper-cased and trimmed, and
 * returns the value an encoding needs, or undefined when it does not fit. A
 * number out of range returns why, so the beginner learns it is the number.
 */
type Operand = (text: string) => number | TooBig | undefined;

interface Form {
  readonly mnemonic: string;
  readonly operands: readonly Operand[];
  /**
   * The bytes of the instruction at `address`, given what each operand read,
   * or why the address puts it out of reach.
   */
  readonly encode: (
    values: readonly number[],
    address: number,
  ) => number[] | TooFar;
}

const among =
  (names: readonly (string | undefined)[]) =>
  (text: string): number | undefined => {
    const index = names.indexOf(text);
    return index === -1 ? undefined : index;
  };

const is = (name: string): Operand => among([name]);

/** The 8-bit registers, in the order of their code in an opcode; (HL) is 6. */
const r = among(["B", "C", "D", "E", "H", "L", "(HL)", "A"]);
/** The register pairs of LD, INC, DEC and ADD. */
const rp = among(["BC", "DE", "HL", "SP"]);
/** The register pairs of PUSH and POP. */
const rp2 = among(["BC", "DE", "HL", "AF"]);
const cc = among(["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"]);
/** The conditions JR accepts. */
const jrcc = among(["NZ", "Z", "NC", "C"]);

const REGISTER_NAMES = new Set([
  "A",
  "B",
  "C",
  "D",
  "E",
  "H",
  "L",
  "I",
  "R",
  "AF",
  "BC",
  "DE",
  "HL",
  "SP",
  "IX",
  "IY",
  "AF'",
  "NZ",
  "Z",
  "NC",
  "PO",
  "PE",
  "P",
  "M",
]);

/** A number written in decimal, or in hexadecimal after `#`. */
export function number(text: string): number | undefined {
  if (REGISTER_NAMES.has(text)) return undefined;
  if (/^#[0-9A-F]+$/.test(text)) return Number.parseInt(text.slice(1), 16);
  if (/^\d+$/.test(text)) return Number(text);
  return undefined;
}

/** A number that fits in `bits` bits. */
const fitting =
  (bits: 8 | 16): Operand =>
  (text) => {
    const n = number(text);
    if (n === undefined) return undefined;
    return n < 2 ** bits ? n : { kind: "number-too-big", value: n, bits };
  };
const byte = fitting(8);
const word16 = fitting(16);

/** A number in brackets: the address of a memory access. */
const memory: Operand = (text) =>
  text.startsWith("(") && text.endsWith(")")
    ? word16(text.slice(1, -1).trim())
    : undefined;

/** A port number in brackets, for IN and OUT. */
const port: Operand = (text) =>
  text.startsWith("(") && text.endsWith(")")
    ? byte(text.slice(1, -1).trim())
    : undefined;

const word = (value: number) => [value & 0xff, (value >> 8) & 0xff];
/**
 * JR or DJNZ to `target`: the offset counts from the instruction after their
 * 2 bytes, and reaches from 128 bytes back to 127 forward.
 */
const relative = (
  opcode: number,
  target: number,
  address: number,
): number[] | TooFar => {
  const distance = target - (address + 2);
  return distance < -128 || distance > 127
    ? { kind: "jump-too-far", distance }
    : [opcode, distance & 0xff];
};

const alone = (mnemonic: string, ...bytes: number[]): Form => ({
  mnemonic,
  operands: [],
  encode: () => bytes,
});

const ALU = ["ADD", "ADC", "SUB", "SBC", "AND", "XOR", "OR", "CP"];
/** ADD, ADC and SBC name A as their first operand; the others leave it out. */
const aluForms = ALU.flatMap((mnemonic, alu): Form[] => {
  const target = ["ADD", "ADC", "SBC"].includes(mnemonic) ? [is("A")] : [];
  // The register or the number is always the last operand.
  return [
    {
      mnemonic,
      operands: [...target, r],
      encode: (v) => [0x80 | (alu << 3) | (v.at(-1) ?? 0)],
    },
    {
      mnemonic,
      operands: [...target, byte],
      encode: (v) => [0xc6 | (alu << 3), v.at(-1) ?? 0],
    },
  ];
});

/** The rotates and shifts of the CB page, in the order of their code; SLL (6) is undocumented. */
const ROTATES = ["RLC", "RRC", "RL", "RR", "SLA", "SRA", undefined, "SRL"];
const rotateForms = ROTATES.flatMap((mnemonic, rot): Form[] =>
  mnemonic === undefined
    ? []
    : [
        {
          mnemonic,
          operands: [r],
          encode: ([s = 0]) => [0xcb, (rot << 3) | s],
        },
      ],
);

/** A bit number, 0 to 7. */
const bit: Operand = (text) => {
  const n = number(text);
  return n !== undefined && n <= 7 ? n : undefined;
};
const bitForms = (["BIT", "RES", "SET"] as const).map(
  (mnemonic, i): Form => ({
    mnemonic,
    operands: [bit, r],
    encode: ([b = 0, s = 0]) => [0xcb, ((i + 1) << 6) | (b << 3) | s],
  }),
);

/** The 8-bit registers that IN r,(C) and OUT (C),r accept: not (HL). */
const rIo = among(["B", "C", "D", "E", "H", "L", undefined, "A"]);

const ed = (mnemonic: string, opcode: number) => alone(mnemonic, 0xed, opcode);
const edForms: Form[] = [
  ed("NEG", 0x44),
  ed("RETN", 0x45),
  ed("RETI", 0x4d),
  ed("RRD", 0x67),
  ed("RLD", 0x6f),
  ...(
    [
      ["LDI", 0xa0],
      ["CPI", 0xa1],
      ["INI", 0xa2],
      ["OUTI", 0xa3],
      ["LDD", 0xa8],
      ["CPD", 0xa9],
      ["IND", 0xaa],
      ["OUTD", 0xab],
      ["LDIR", 0xb0],
      ["CPIR", 0xb1],
      ["INIR", 0xb2],
      ["OTIR", 0xb3],
      ["LDDR", 0xb8],
      ["CPDR", 0xb9],
      ["INDR", 0xba],
      ["OTDR", 0xbb],
    ] as const
  ).map(([mnemonic, opcode]) => ed(mnemonic, opcode)),
  {
    mnemonic: "IM",
    operands: [among(["0", undefined, "1", "2"])],
    encode: ([m = 0]) => [0xed, [0x46, 0, 0x56, 0x5e][m] ?? 0],
  },
  { mnemonic: "LD", operands: [is("I"), is("A")], encode: () => [0xed, 0x47] },
  { mnemonic: "LD", operands: [is("R"), is("A")], encode: () => [0xed, 0x4f] },
  { mnemonic: "LD", operands: [is("A"), is("I")], encode: () => [0xed, 0x57] },
  { mnemonic: "LD", operands: [is("A"), is("R")], encode: () => [0xed, 0x5f] },
  {
    mnemonic: "LD",
    operands: [memory, rp],
    encode: ([n = 0, p = 0]) => [0xed, 0x43 | (p << 4), ...word(n)],
  },
  {
    mnemonic: "LD",
    operands: [rp, memory],
    encode: ([p = 0, n = 0]) => [0xed, 0x4b | (p << 4), ...word(n)],
  },
  {
    mnemonic: "SBC",
    operands: [is("HL"), rp],
    encode: ([, p = 0]) => [0xed, 0x42 | (p << 4)],
  },
  {
    mnemonic: "ADC",
    operands: [is("HL"), rp],
    encode: ([, p = 0]) => [0xed, 0x4a | (p << 4)],
  },
  {
    mnemonic: "IN",
    operands: [rIo, is("(C)")],
    encode: ([d = 0]) => [0xed, 0x40 | (d << 3)],
  },
  {
    mnemonic: "OUT",
    operands: [is("(C)"), rIo],
    encode: ([, s = 0]) => [0xed, 0x41 | (s << 3)],
  },
];

const FORMS: readonly Form[] = [
  alone("NOP", 0x00),
  alone("RLCA", 0x07),
  alone("RRCA", 0x0f),
  alone("RLA", 0x17),
  alone("RRA", 0x1f),
  alone("DAA", 0x27),
  alone("CPL", 0x2f),
  alone("SCF", 0x37),
  alone("CCF", 0x3f),
  alone("HALT", 0x76),
  alone("RET", 0xc9),
  alone("EXX", 0xd9),
  alone("DI", 0xf3),
  alone("EI", 0xfb),
  { mnemonic: "EX", operands: [is("AF"), is("AF'")], encode: () => [0x08] },
  { mnemonic: "EX", operands: [is("(SP)"), is("HL")], encode: () => [0xe3] },
  { mnemonic: "EX", operands: [is("DE"), is("HL")], encode: () => [0xeb] },
  { mnemonic: "LD", operands: [is("(BC)"), is("A")], encode: () => [0x02] },
  { mnemonic: "LD", operands: [is("(DE)"), is("A")], encode: () => [0x12] },
  { mnemonic: "LD", operands: [is("A"), is("(BC)")], encode: () => [0x0a] },
  { mnemonic: "LD", operands: [is("A"), is("(DE)")], encode: () => [0x1a] },
  { mnemonic: "LD", operands: [is("SP"), is("HL")], encode: () => [0xf9] },
  {
    mnemonic: "LD",
    operands: [r, r],
    encode: ([d = 0, s = 0]) => [0x40 | (d << 3) | s],
  },
  {
    mnemonic: "LD",
    operands: [r, byte],
    encode: ([d = 0, n = 0]) => [0x06 | (d << 3), n],
  },
  {
    mnemonic: "LD",
    operands: [rp, word16],
    encode: ([p = 0, n = 0]) => [0x01 | (p << 4), ...word(n)],
  },
  {
    mnemonic: "LD",
    operands: [memory, is("HL")],
    encode: ([n = 0]) => [0x22, ...word(n)],
  },
  {
    mnemonic: "LD",
    operands: [is("HL"), memory],
    encode: ([, n = 0]) => [0x2a, ...word(n)],
  },
  {
    mnemonic: "LD",
    operands: [memory, is("A")],
    encode: ([n = 0]) => [0x32, ...word(n)],
  },
  {
    mnemonic: "LD",
    operands: [is("A"), memory],
    encode: ([, n = 0]) => [0x3a, ...word(n)],
  },
  { mnemonic: "INC", operands: [r], encode: ([d = 0]) => [0x04 | (d << 3)] },
  { mnemonic: "DEC", operands: [r], encode: ([d = 0]) => [0x05 | (d << 3)] },
  { mnemonic: "INC", operands: [rp], encode: ([p = 0]) => [0x03 | (p << 4)] },
  { mnemonic: "DEC", operands: [rp], encode: ([p = 0]) => [0x0b | (p << 4)] },
  {
    mnemonic: "ADD",
    operands: [is("HL"), rp],
    encode: ([, p = 0]) => [0x09 | (p << 4)],
  },
  ...aluForms,
  {
    mnemonic: "DJNZ",
    operands: [number],
    encode: ([t = 0], a) => relative(0x10, t, a),
  },
  {
    mnemonic: "JR",
    operands: [number],
    encode: ([t = 0], a) => relative(0x18, t, a),
  },
  {
    mnemonic: "JR",
    operands: [jrcc, number],
    encode: ([c = 0, t = 0], a) => relative(0x20 | (c << 3), t, a),
  },
  { mnemonic: "JP", operands: [is("(HL)")], encode: () => [0xe9] },
  {
    mnemonic: "JP",
    operands: [word16],
    encode: ([n = 0]) => [0xc3, ...word(n)],
  },
  {
    mnemonic: "JP",
    operands: [cc, word16],
    encode: ([c = 0, n = 0]) => [0xc2 | (c << 3), ...word(n)],
  },
  {
    mnemonic: "CALL",
    operands: [word16],
    encode: ([n = 0]) => [0xcd, ...word(n)],
  },
  {
    mnemonic: "CALL",
    operands: [cc, word16],
    encode: ([c = 0, n = 0]) => [0xc4 | (c << 3), ...word(n)],
  },
  { mnemonic: "RET", operands: [cc], encode: ([c = 0]) => [0xc0 | (c << 3)] },
  { mnemonic: "PUSH", operands: [rp2], encode: ([p = 0]) => [0xc5 | (p << 4)] },
  { mnemonic: "POP", operands: [rp2], encode: ([p = 0]) => [0xc1 | (p << 4)] },
  {
    mnemonic: "RST",
    operands: [
      (text) => {
        const n = number(text);
        return n !== undefined && n % 8 === 0 && n <= 0x38 ? n : undefined;
      },
    ],
    encode: ([n = 0]) => [0xc7 | n],
  },
  {
    mnemonic: "OUT",
    operands: [port, is("A")],
    encode: ([n = 0]) => [0xd3, n],
  },
  {
    mnemonic: "IN",
    operands: [is("A"), port],
    encode: ([, n = 0]) => [0xdb, n],
  },
  ...rotateForms,
  ...bitForms,
  ...edForms,
];

/**
 * The bytes of the first form that `mnemonic` and `operands` fit, at `address`,
 * or the problem of the first form that only a number or a jump out of range
 * stops.
 */
function encodeForm(
  mnemonic: string,
  operands: readonly string[],
  address: number,
): number[] | Problem {
  let problem = UNKNOWN;
  for (const form of FORMS) {
    if (form.mnemonic !== mnemonic || form.operands.length !== operands.length)
      continue;
    const values = form.operands.map((read, i) => read(operands[i] ?? ""));
    if (values.every((value) => typeof value === "number")) {
      const bytes = form.encode(values, address);
      if (Array.isArray(bytes)) return bytes;
      if (problem === UNKNOWN) problem = bytes;
    } else if (problem === UNKNOWN) {
      const tooBig = values.find((value) => typeof value === "object");
      if (tooBig && values.every((value) => value !== undefined))
        problem = tooBig;
    }
  }
  return problem;
}

const INDEX_PREFIX = { IX: 0xdd, IY: 0xfd } as const;
// `(IX+52)`, `(IY-16)`, `(IX)`; the displacement is a number of the source.
const DISPLACED = /^\((I[XY])(?:\s*([+-])\s*(.+))?\)$/;

/**
 * The bytes of one instruction at `address`, operands upper-cased and trimmed,
 * or why there are none. IX and IY reuse the forms of HL: the operand
 * is read as HL or (HL), then the prefix goes first and the displacement after
 * the opcode, which also puts it before the opcode of a CB instruction.
 */
export function encodeInstruction(
  mnemonic: string,
  operands: readonly string[],
  address: number,
): number[] | Problem {
  // One prefix per instruction: ADD IX,IY does not exist.
  const indexes = new Set(
    operands.map((operand) => /\bI[XY]\b/.exec(operand)?.[0]).filter(Boolean),
  );
  if (indexes.size > 1) return UNKNOWN;

  let prefix: number | undefined;
  let displacement: number | undefined;
  const asHl = operands.map((operand) => {
    if (operand === "IX" || operand === "IY") {
      prefix = INDEX_PREFIX[operand];
      return "HL";
    }
    const displaced = DISPLACED.exec(operand);
    if (displaced?.[1] === "IX" || displaced?.[1] === "IY") {
      prefix = INDEX_PREFIX[displaced[1]];
      // JP (IX) jumps to IX itself: no displacement.
      if (mnemonic === "JP") return "(HL)";
      const size = displaced[3] === undefined ? 0 : number(displaced[3].trim());
      if (size === undefined) return operand;
      displacement = displaced[2] === "-" ? -size : size;
      return "(HL)";
    }
    return operand;
  });
  if (prefix === undefined) return encodeForm(mnemonic, operands, address);

  // IX or IY cannot stand next to HL, H or L, unless the index is displaced:
  // LD H,(IX+5) exists, ADD IX,HL does not.
  const hlToo = operands.some((operand) => ["HL", "H", "L"].includes(operand));
  if (hlToo && displacement === undefined) return UNKNOWN;
  if (displacement !== undefined && (displacement < -128 || displacement > 127))
    return { kind: "displacement-out-of-range", displacement };
  const bytes = encodeForm(mnemonic, asHl, address);
  if (!Array.isArray(bytes)) return bytes;
  // ED instructions and EX DE,HL have no IX or IY form.
  if (bytes[0] === 0xed || bytes[0] === 0xeb) return UNKNOWN;
  const [opcode = 0, ...rest] = bytes;
  return displacement === undefined
    ? [prefix, opcode, ...rest]
    : [prefix, opcode, displacement & 0xff, ...rest];
}
