import { CalcAngleMode } from '../types';

export type BinaryOp =
  | '+'
  | '−'
  | '×'
  | '÷'
  | 'mod'
  | 'pow'
  | 'yroot'
  | 'logbase';

export type CalcToken =
  | { type: 'num'; value: number; label: string }
  | { type: 'op'; op: BinaryOp }
  | { type: 'lparen' }
  | { type: 'rparen' };

export type EvalOutcome =
  | { ok: true; value: number }
  | { ok: false; error: string };

export const OP_PRECEDENCE: Record<BinaryOp, number> = {
  '+': 1,
  '−': 1,
  '×': 2,
  '÷': 2,
  mod: 2,
  pow: 3,
  yroot: 3,
  logbase: 3,
};

export const OP_DISPLAY_SYMBOL: Record<BinaryOp, string> = {
  '+': '+',
  '−': '−',
  '×': '×',
  '÷': '÷',
  mod: 'mod',
  pow: '^',
  yroot: 'yroot',
  logbase: 'log base',
};

// Lanczos approximation for Gamma function to compute factorials for non-integers like 0.5!
function gamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  const zm = z - 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) {
    x += p[i] / (zm + i);
  }
  const t = zm + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, zm + 0.5) * Math.exp(-t) * x;
}

export function cleanPrecision(val: number): number {
  if (!isFinite(val)) return val;
  if (Math.abs(val) < 1e-15) return 0;
  // Clean floating point noise like 0.30000000000000004 or 0.5000000000000001
  const rounded = parseFloat(val.toPrecision(15));
  return Math.abs(rounded) < 1e-15 ? 0 : rounded;
}

export function formatCalcNumber(val: number, isFe: boolean = false): string {
  if (!isFinite(val)) {
    return isNaN(val) ? 'Invalid input' : 'Overflow';
  }
  const cleaned = cleanPrecision(val);
  if (cleaned === 0) {
    return isFe ? '0.e+0' : '0';
  }

  const abs = Math.abs(cleaned);
  if (isFe || abs >= 1e15 || (abs > 0 && abs < 1e-4)) {
    const expStr = cleaned.toExponential(10);
    // Trim redundant trailing zeros before 'e'
    return expStr.replace(/\.?0+(e[+-]\d+)$/, '$1');
  }

  // Format integer part with thousands separators while preserving decimals accurately
  const str = cleaned.toString();
  const dotIdx = str.indexOf('.');
  if (dotIdx === -1) {
    return Number(str).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  const intPart = str.slice(0, dotIdx);
  const decPart = str.slice(dotIdx);
  const sign = intPart.startsWith('-') ? '-' : '';
  const unsignedInt = sign ? intPart.slice(1) : intPart;
  const formattedInt = unsignedInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${formattedInt}${decPart}`;
}

export function formatEntryForDisplay(entry: string): string {
  if (!entry) return '0';
  // If scientific exponent builder like "5.e+0" or "5e-12"
  if (/e/i.test(entry)) {
    return entry;
  }
  const sign = entry.startsWith('-') ? '-' : '';
  const body = sign ? entry.slice(1) : entry;
  const dotIdx = body.indexOf('.');
  if (dotIdx === -1) {
    const formattedInt = body.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}${formattedInt}`;
  }
  const intPart = body.slice(0, dotIdx);
  const decPart = body.slice(dotIdx);
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${formattedInt}${decPart}`;
}

export function parseNumericValue(displayOrEntry: string): number {
  const cleaned = displayOrEntry.replace(/,/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

export function toRadians(x: number, mode: CalcAngleMode): number {
  if (mode === 'RAD') return x;
  if (mode === 'DEG') return (x * Math.PI) / 180;
  return (x * Math.PI) / 200; // GRAD: 400 gradians = 2π rad
}

export function fromRadians(rad: number, mode: CalcAngleMode): number {
  if (mode === 'RAD') return rad;
  if (mode === 'DEG') return (rad * 180) / Math.PI;
  return (rad * 200) / Math.PI; // GRAD
}

// Compute trig accurately at cardinal multiples (90 deg, 180 deg, 100 grad, 200 grad, etc.)
function trigSinCos(x: number, mode: CalcAngleMode): { sin: number; cos: number } {
  if (mode === 'DEG') {
    const norm = ((x % 360) + 360) % 360;
    if (norm === 0) return { sin: 0, cos: 1 };
    if (norm === 90) return { sin: 1, cos: 0 };
    if (norm === 180) return { sin: 0, cos: -1 };
    if (norm === 270) return { sin: -1, cos: 0 };
    const rad = (norm * Math.PI) / 180;
    return { sin: cleanPrecision(Math.sin(rad)), cos: cleanPrecision(Math.cos(rad)) };
  }
  if (mode === 'GRAD') {
    const norm = ((x % 400) + 400) % 400;
    if (norm === 0) return { sin: 0, cos: 1 };
    if (norm === 100) return { sin: 1, cos: 0 };
    if (norm === 200) return { sin: 0, cos: -1 };
    if (norm === 300) return { sin: -1, cos: 0 };
    const rad = (norm * Math.PI) / 200;
    return { sin: cleanPrecision(Math.sin(rad)), cos: cleanPrecision(Math.cos(rad)) };
  }
  return { sin: cleanPrecision(Math.sin(x)), cos: cleanPrecision(Math.cos(x)) };
}

// Decimal degrees to DMS encoding DD.MMSSsss (Windows format)
export function decimalToDms(deg: number): number {
  const sign = deg < 0 ? -1 : 1;
  const ax = Math.abs(deg);
  let d = Math.floor(ax + 1e-12);
  const remM = (ax - d) * 60;
  let m = Math.floor(Math.max(0, remM) + 1e-10);
  let s = Math.max(0, (remM - m) * 60);
  if (s >= 59.9999999) {
    s = 0;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  return cleanPrecision(sign * (d + m / 100 + s / 10000));
}

// DMS DD.MMSSsss to Decimal degrees
export function dmsToDecimal(dms: number): number {
  const sign = dms < 0 ? -1 : 1;
  const ax = Math.abs(dms);
  const d = Math.floor(ax + 1e-12);
  const fracScaled = Math.max(0, (ax - d) * 100);
  const m = Math.floor(fracScaled + 1e-9);
  const s = Math.max(0, (fracScaled - m) * 100);
  return cleanPrecision(sign * (d + m / 60 + s / 3600));
}

export type UnaryOpId =
  | 'sqr'
  | 'cube'
  | 'sqrt'
  | 'cbrt'
  | 'inv'
  | 'abs'
  | 'tenPow'
  | 'twoPow'
  | 'expPow'
  | 'log10'
  | 'ln'
  | 'fact'
  | 'negate'
  | 'floor'
  | 'ceil'
  | 'dms'
  | 'deg'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'csc'
  | 'sec'
  | 'cot'
  | 'asin'
  | 'acos'
  | 'atan'
  | 'acsc'
  | 'asec'
  | 'acot'
  | 'sinh'
  | 'cosh'
  | 'tanh'
  | 'csch'
  | 'sech'
  | 'coth'
  | 'asinh'
  | 'acosh'
  | 'atanh'
  | 'acsch'
  | 'asech'
  | 'acoth';

export const UNARY_LABEL_PREFIX: Record<UnaryOpId, string> = {
  sqr: 'sqr',
  cube: 'cube',
  sqrt: '√',
  cbrt: 'cuberoot',
  inv: '1/',
  abs: 'abs',
  tenPow: '10^',
  twoPow: '2^',
  expPow: 'e^',
  log10: 'log',
  ln: 'ln',
  fact: 'fact',
  negate: 'negate',
  floor: 'floor',
  ceil: 'ceil',
  dms: 'dms',
  deg: 'deg',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  csc: 'csc',
  sec: 'sec',
  cot: 'cot',
  asin: 'sin⁻¹',
  acos: 'cos⁻¹',
  atan: 'tan⁻¹',
  acsc: 'csc⁻¹',
  asec: 'sec⁻¹',
  acot: 'cot⁻¹',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  csch: 'csch',
  sech: 'sech',
  coth: 'coth',
  asinh: 'sinh⁻¹',
  acosh: 'cosh⁻¹',
  atanh: 'tanh⁻¹',
  acsch: 'csch⁻¹',
  asech: 'sech⁻¹',
  acoth: 'coth⁻¹',
};

export function formatUnaryLabel(op: UnaryOpId, innerLabel: string): string {
  const modeSuffix = ''; // Clean display label like Windows: sin(30), sqr(5), 1/(4)
  if (op === 'tenPow' || op === 'twoPow' || op === 'expPow' || op === 'inv') {
    return `${UNARY_LABEL_PREFIX[op]}(${innerLabel})`;
  }
  return `${UNARY_LABEL_PREFIX[op]}${modeSuffix}(${innerLabel})`;
}

export function applyUnaryOp(
  op: UnaryOpId,
  x: number,
  angleMode: CalcAngleMode
): EvalOutcome {
  let out: number;
  switch (op) {
    case 'sqr':
      out = x * x;
      break;
    case 'cube':
      out = x * x * x;
      break;
    case 'sqrt':
      if (x < 0) return { ok: false, error: 'Invalid input' };
      out = Math.sqrt(x);
      break;
    case 'cbrt':
      out = Math.cbrt(x);
      break;
    case 'inv':
      if (x === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = 1 / x;
      break;
    case 'abs':
      out = Math.abs(x);
      break;
    case 'tenPow':
      out = Math.pow(10, x);
      break;
    case 'twoPow':
      out = Math.pow(2, x);
      break;
    case 'expPow':
      out = Math.exp(x);
      break;
    case 'log10':
      if (x <= 0) return { ok: false, error: 'Invalid input' };
      out = Math.log10(x);
      break;
    case 'ln':
      if (x <= 0) return { ok: false, error: 'Invalid input' };
      out = Math.log(x);
      break;
    case 'fact':
      if (x > 170) return { ok: false, error: 'Overflow' };
      if (x < 0 && Number.isInteger(x)) return { ok: false, error: 'Invalid input' };
      if (Number.isInteger(x) && x >= 0) {
        let f = 1;
        for (let i = 2; i <= x; i++) f *= i;
        out = f;
      } else {
        out = gamma(x + 1);
      }
      break;
    case 'negate':
      out = x === 0 ? 0 : -x;
      break;
    case 'floor':
      out = Math.floor(x);
      break;
    case 'ceil':
      out = Math.ceil(x);
      break;
    case 'dms':
      out = decimalToDms(x);
      break;
    case 'deg':
      out = dmsToDecimal(x);
      break;
    // Standard trig
    case 'sin': {
      out = trigSinCos(x, angleMode).sin;
      break;
    }
    case 'cos': {
      out = trigSinCos(x, angleMode).cos;
      break;
    }
    case 'tan': {
      const { sin, cos } = trigSinCos(x, angleMode);
      if (cos === 0) return { ok: false, error: 'Invalid input' };
      out = sin / cos;
      break;
    }
    case 'csc': {
      const { sin } = trigSinCos(x, angleMode);
      if (sin === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = 1 / sin;
      break;
    }
    case 'sec': {
      const { cos } = trigSinCos(x, angleMode);
      if (cos === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = 1 / cos;
      break;
    }
    case 'cot': {
      const { sin, cos } = trigSinCos(x, angleMode);
      if (sin === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = cos / sin;
      break;
    }
    // Inverse / Arc trig
    case 'asin':
      if (x < -1 || x > 1) return { ok: false, error: 'Invalid input' };
      out = fromRadians(Math.asin(x), angleMode);
      break;
    case 'acos':
      if (x < -1 || x > 1) return { ok: false, error: 'Invalid input' };
      out = fromRadians(Math.acos(x), angleMode);
      break;
    case 'atan':
      out = fromRadians(Math.atan(x), angleMode);
      break;
    case 'acsc':
      if (Math.abs(x) < 1) return { ok: false, error: 'Invalid input' };
      out = fromRadians(Math.asin(1 / x), angleMode);
      break;
    case 'asec':
      if (Math.abs(x) < 1) return { ok: false, error: 'Invalid input' };
      out = fromRadians(Math.acos(1 / x), angleMode);
      break;
    case 'acot':
      out = fromRadians(Math.PI / 2 - Math.atan(x), angleMode);
      break;
    // Hyperbolic trig (angle unit independent, standard math definitions)
    case 'sinh':
      out = Math.sinh(x);
      break;
    case 'cosh':
      out = Math.cosh(x);
      break;
    case 'tanh':
      out = Math.tanh(x);
      break;
    case 'csch':
      if (x === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = 1 / Math.sinh(x);
      break;
    case 'sech':
      out = 1 / Math.cosh(x);
      break;
    case 'coth':
      if (x === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = Math.cosh(x) / Math.sinh(x);
      break;
    // Inverse hyperbolic trig
    case 'asinh':
      out = Math.asinh(x);
      break;
    case 'acosh':
      if (x < 1) return { ok: false, error: 'Invalid input' };
      out = Math.acosh(x);
      break;
    case 'atanh':
      if (Math.abs(x) >= 1) return { ok: false, error: 'Invalid input' };
      out = Math.atanh(x);
      break;
    case 'acsch':
      if (x === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = Math.asinh(1 / x);
      break;
    case 'asech':
      if (x <= 0 || x > 1) return { ok: false, error: 'Invalid input' };
      out = Math.acosh(1 / x);
      break;
    case 'acoth':
      if (Math.abs(x) <= 1) return { ok: false, error: 'Invalid input' };
      out = Math.atanh(1 / x);
      break;
  }

  if (!isFinite(out)) {
    return { ok: false, error: isNaN(out) ? 'Invalid input' : 'Overflow' };
  }
  return { ok: true, value: cleanPrecision(out) };
}

export function applyBinaryOp(op: BinaryOp, a: number, b: number): EvalOutcome {
  let out: number;
  switch (op) {
    case '+':
      out = a + b;
      break;
    case '−':
      out = a - b;
      break;
    case '×':
      out = a * b;
      break;
    case '÷':
      if (b === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = a / b;
      break;
    case 'mod':
      if (b === 0) return { ok: false, error: 'Cannot divide by zero' };
      out = a % b;
      break;
    case 'pow':
      if (a === 0 && b < 0) return { ok: false, error: 'Cannot divide by zero' };
      if (a < 0 && !Number.isInteger(b)) return { ok: false, error: 'Invalid input' };
      out = Math.pow(a, b);
      break;
    case 'yroot':
      if (b === 0) return { ok: false, error: 'Cannot divide by zero' };
      if (a < 0) {
        // Support odd integer roots of negative numbers, e.g., (-8) yroot 3 = -2
        if (Number.isInteger(b) && Math.abs(b % 2) === 1) {
          out = -Math.pow(Math.abs(a), 1 / b);
        } else {
          return { ok: false, error: 'Invalid input' };
        }
      } else {
        out = Math.pow(a, 1 / b);
      }
      break;
    case 'logbase':
      // Windows log_y(x): user enters x, presses log_y x, enters base y -> ln(x) / ln(y)
      if (a <= 0 || b <= 0 || b === 1) return { ok: false, error: 'Invalid input' };
      out = Math.log(a) / Math.log(b);
      break;
  }

  if (!isFinite(out)) {
    return { ok: false, error: isNaN(out) ? 'Invalid input' : 'Overflow' };
  }
  return { ok: true, value: cleanPrecision(out) };
}

export function evaluateTokens(tokens: CalcToken[]): EvalOutcome {
  const values: number[] = [];
  const ops: Array<{ type: 'op'; op: BinaryOp } | { type: 'lparen' }> = [];

  const popAndEval = (): string | null => {
    const topOp = ops.pop();
    if (!topOp || topOp.type !== 'op') return null;
    if (values.length < 2) return 'Invalid input';
    const b = values.pop()!;
    const a = values.pop()!;
    const res = applyBinaryOp(topOp.op, a, b);
    if (!res.ok) return res.error;
    values.push(res.value);
    return null;
  };

  for (const tok of tokens) {
    if (tok.type === 'num') {
      values.push(tok.value);
    } else if (tok.type === 'lparen') {
      ops.push({ type: 'lparen' });
    } else if (tok.type === 'rparen') {
      while (ops.length > 0 && ops[ops.length - 1].type !== 'lparen') {
        const err = popAndEval();
        if (err) return { ok: false, error: err };
      }
      if (ops.length > 0 && ops[ops.length - 1].type === 'lparen') {
        ops.pop();
      }
    } else if (tok.type === 'op') {
      while (ops.length > 0) {
        const peek = ops[ops.length - 1];
        if (peek.type === 'lparen') break;
        if (OP_PRECEDENCE[peek.op] >= OP_PRECEDENCE[tok.op]) {
          const err = popAndEval();
          if (err) return { ok: false, error: err };
        } else {
          break;
        }
      }
      ops.push({ type: 'op', op: tok.op });
    }
  }

  while (ops.length > 0) {
    const peek = ops[ops.length - 1];
    if (peek.type === 'lparen') {
      ops.pop();
      continue;
    }
    const err = popAndEval();
    if (err) return { ok: false, error: err };
  }

  if (values.length === 0) return { ok: true, value: 0 };
  return { ok: true, value: cleanPrecision(values[values.length - 1]) };
}

export function tokensToExpressionString(tokens: CalcToken[]): string {
  return tokens
    .map((t) => {
      if (t.type === 'num') return t.label;
      if (t.type === 'op') return ` ${OP_DISPLAY_SYMBOL[t.op]} `;
      if (t.type === 'lparen') return '(';
      return ')';
    })
    .join('');
}
