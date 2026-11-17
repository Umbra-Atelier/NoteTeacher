import React, { useState, useRef, useEffect } from 'react';
import {
  Move,
  Trash2,
  History,
  Delete,
  Maximize2,
  Minimize2,
  ChevronDown,
  Triangle,
} from 'lucide-react';
import { CalcAngleMode, CalculatorBox } from '../types';
import {
  BinaryOp,
  CalcToken,
  UnaryOpId,
  applyUnaryOp,
  evaluateTokens,
  formatCalcNumber,
  formatEntryForDisplay,
  formatUnaryLabel,
  parseNumericValue,
  tokensToExpressionString,
} from '../utils/windowsCalcEngine';
import { registerLiveCalculator } from '../utils/widgetSnapshotCache';

interface ScientificCalculatorBoxProps {
  box: CalculatorBox;
  isActive: boolean;
  zoomScale?: number;
  disableTwoFingerPinch?: boolean;
  allowFingerControls?: boolean;
  isReadOnly?: boolean;
  hideChrome?: boolean;
  onSelect: () => void;
  onUpdate: (updated: Partial<CalculatorBox>) => void;
  onDelete: () => void;
}

export const CALC_BASE_WIDTH = 336;
export const CALC_BASE_HEIGHT = 496;
const MIN_SCALE = 0.2;
const MAX_SCALE = 2.8;

export const ScientificCalculatorBox: React.FC<ScientificCalculatorBoxProps> = ({
  box,
  isActive,
  zoomScale = 1,
  disableTwoFingerPinch = false,
  allowFingerControls = true,
  isReadOnly = false,
  hideChrome = false,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const [showHistory, setShowHistory] = useState(false);
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);
  const [showTrigMenu, setShowTrigMenu] = useState(false);
  const [showFuncMenu, setShowFuncMenu] = useState(false);

  const [is2nd, setIs2nd] = useState(false);
  const [isHyp, setIsHyp] = useState(false);

  // Full Windows expression / operand state machine
  const [tokens, setTokens] = useState<CalcToken[]>([]);
  const [entry, setEntry] = useState<string | null>(null);
  const [lastUnary, setLastUnary] = useState<{ value: number; label: string } | null>(null);
  const [numericValue, setNumericValue] = useState<number>(() =>
    box.result ? parseNumericValue(box.result) : 0
  );
  const [completedExprLine, setCompletedExprLine] = useState<string>(box.expression || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [repeatOp, setRepeatOp] = useState<{ op: BinaryOp; rhsVal: number; rhsLabel: string } | null>(
    null
  );

  // Drag / resize state
  const [isDragging, setIsDragging] = useState(false);
  const [isRepositioningActive, setIsRepositioningActive] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, boxX: 0, boxY: 0 });
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef<number>(box.scale || 1);
  const containerRef = useRef<HTMLDivElement>(null);
  const logicalStageRef = useRef<HTMLDivElement>(null);
  const lastPointerTypeRef = useRef<string>('mouse');
  const boxRef = useRef(box);
  boxRef.current = box;
  const lastSyncedRef = useRef<{ expr: string; res: string }>({
    expr: box.expression || '',
    res: box.result || '0',
  });

  // Register live calculator DOM handle for high-res As-Shown & Clean snapshots
  useEffect(() => {
    return registerLiveCalculator(box.id, {
      getStage: () => logicalStageRef.current,
      getBox: () => boxRef.current,
    });
  }, [box.id]);

  // Sync external updates (e.g., Undo / Redo restoring previous calculator state)
  useEffect(() => {
    const extExpr = box.expression || '';
    const extRes = box.result || '0';
    if (extExpr !== lastSyncedRef.current.expr || extRes !== lastSyncedRef.current.res) {
      lastSyncedRef.current = { expr: extExpr, res: extRes };
      setTokens([]);
      setEntry(null);
      setLastUnary(null);
      setErrorMsg(null);
      setRepeatOp(null);
      setCompletedExprLine(extExpr);
      setNumericValue(parseNumericValue(extRes));
    }
  }, [box.expression, box.result]);

  const angleMode: CalcAngleMode = box.angleMode ?? (box.isRad ? 'RAD' : 'DEG');
  const isFeMode: boolean = !!box.isFeMode;
  const memoryStack: number[] = box.memoryStack || [];

  const currentScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, box.scale || 1));
  const currentWidth = CALC_BASE_WIDTH * currentScale;
  const currentHeight = CALC_BASE_HEIGHT * currentScale;

  // Compute displayed strings directly from local machine state OR fallback to synced box prop when read-only
  const localMainDisplay = isReadOnly
    ? box.result || '0'
    : errorMsg
    ? errorMsg
    : entry !== null
    ? formatEntryForDisplay(entry)
    : formatCalcNumber(numericValue, isFeMode);

  const liveBreadcrumb = isReadOnly
    ? box.expression || ''
    : tokens.length > 0 || lastUnary
    ? `${tokensToExpressionString(tokens)}${lastUnary ? lastUnary.label : ''}`
    : completedExprLine;

  // Keep parent `box.expression` & `box.result` synced so Audience View & History stay current
  const syncBoxState = (
    nextExpr: string,
    nextResult: string,
    extra: Partial<CalculatorBox> = {}
  ) => {
    lastSyncedRef.current = { expr: nextExpr, res: nextResult };
    onUpdate({
      expression: nextExpr,
      result: nextResult,
      ...extra,
    });
  };

  // Close menus if clicking inside main keypad body
  const closeMenus = () => {
    setShowTrigMenu(false);
    setShowFuncMenu(false);
  };

  // Smooth rAF Drag Moving via Top-Left Move handle
  const handlePointerDownMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && !allowFingerControls) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    setDragStart({ x: e.clientX, y: e.clientY, boxX: box.x, boxY: box.y });
    setIsRepositioningActive(true);
    setIsDragging(true);
  };

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const boxScaleRef = useRef(box.scale || 1);
  boxScaleRef.current = box.scale || 1;

  useEffect(() => {
    if (!isDragging) return;

    let rafId: number | null = null;
    let latestX = dragStart.x;
    let latestY = dragStart.y;

    const commitMove = () => {
      const scale = zoomScale || 1;
      const dx = (latestX - dragStart.x) / scale;
      const dy = (latestY - dragStart.y) / scale;
      onUpdateRef.current({
        x: Math.max(0, dragStart.boxX + dx),
        y: Math.max(0, dragStart.boxY + dy),
      });
      rafId = null;
    };

    const scheduleMove = (clientX: number, clientY: number) => {
      latestX = clientX;
      latestY = clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(commitMove);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      scheduleMove(e.clientX, e.clientY);
    };
    const handleUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setIsDragging(false);
      setIsRepositioningActive(false);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isDragging, dragStart, zoomScale]);

  // Two-finger Pinch to scale preserving proportions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (disableTwoFingerPinch || !allowFingerControls) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartDistRef.current = dist;
        pinchStartScaleRef.current = boxScaleRef.current || 1;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (disableTwoFingerPinch || !allowFingerControls) return;
      if (e.touches.length === 2 && pinchStartDistRef.current) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = dist / pinchStartDistRef.current;
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScaleRef.current * factor));
        onUpdateRef.current({ scale: newScale });
      }
    };

    const handleTouchEnd = () => {
      pinchStartDistRef.current = null;
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disableTwoFingerPinch, allowFingerControls]);

  // Top-Right L-Grab Drag
  const startResizeTR = (startX: number, startY: number) => {
    const startScale = box.scale || 1;
    const startBoxY = box.y;
    const startHeight = CALC_BASE_HEIGHT * startScale;
    const zScale = zoomScale || 1;

    let rafId: number | null = null;
    let latestX = startX;
    let latestY = startY;

    const commitResize = () => {
      const dx = (latestX - startX) / zScale;
      const dy = (startY - latestY) / zScale;
      const delta = (dx + dy) / 2;
      const newWidth = Math.max(
        CALC_BASE_WIDTH * MIN_SCALE,
        Math.min(CALC_BASE_WIDTH * MAX_SCALE, CALC_BASE_WIDTH * startScale + delta)
      );
      const newScale = newWidth / CALC_BASE_WIDTH;
      const newHeight = CALC_BASE_HEIGHT * newScale;
      const newY = startBoxY - (newHeight - startHeight);

      onUpdate({
        scale: newScale,
        y: Math.max(0, newY),
      });
      rafId = null;
    };

    const scheduleResize = (clientX: number, clientY: number) => {
      latestX = clientX;
      latestY = clientY;
      if (!rafId) rafId = requestAnimationFrame(commitResize);
    };

    const handlePointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      scheduleResize(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Bottom-Left L-Grab Drag
  const startResizeBL = (startX: number, startY: number) => {
    const startScale = box.scale || 1;
    const startBoxX = box.x;
    const startWidth = CALC_BASE_WIDTH * startScale;
    const zScale = zoomScale || 1;

    let rafId: number | null = null;
    let latestX = startX;
    let latestY = startY;

    const commitResize = () => {
      const dx = (startX - latestX) / zScale;
      const dy = (latestY - startY) / zScale;
      const delta = (dx + dy) / 2;
      const newWidth = Math.max(
        CALC_BASE_WIDTH * MIN_SCALE,
        Math.min(CALC_BASE_WIDTH * MAX_SCALE, startWidth + delta)
      );
      const newScale = newWidth / CALC_BASE_WIDTH;
      const newX = startBoxX - (newWidth - startWidth);

      onUpdate({
        scale: newScale,
        x: Math.max(0, newX),
      });
      rafId = null;
    };

    const scheduleResize = (clientX: number, clientY: number) => {
      latestX = clientX;
      latestY = clientY;
      if (!rafId) rafId = requestAnimationFrame(commitResize);
    };

    const handlePointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      scheduleResize(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // =========================================================================
  // WINDOWS CALCULATOR INTERACTION HANDLERS
  // =========================================================================
  const openParensCount = tokens.filter((t) => t.type === 'lparen').length -
    tokens.filter((t) => t.type === 'rparen').length;

  const getCurrentOperand = (): { value: number; label: string } => {
    if (lastUnary) return lastUnary;
    if (entry !== null) {
      const val = parseNumericValue(entry);
      return { value: val, label: entry.endsWith('.') ? entry.slice(0, -1) : entry };
    }
    return { value: numericValue, label: formatCalcNumber(numericValue, false).replace(/,/g, '') };
  };

  const resetOnErrorIfNeeded = () => {
    if (errorMsg) {
      setErrorMsg(null);
      setTokens([]);
      setEntry(null);
      setLastUnary(null);
      setCompletedExprLine('');
      setRepeatOp(null);
      return true;
    }
    return false;
  };

  const handleDigit = (d: string) => {
    closeMenus();
    const hadErr = resetOnErrorIfNeeded();
    if (hadErr) {
      const next = d === '.' ? '0.' : d;
      setEntry(next);
      setNumericValue(parseNumericValue(next));
      syncBoxState('', formatEntryForDisplay(next));
      return;
    }

    // Fresh calculation if user just hit '='
    let nextTokens = tokens;
    let nextCompleted = completedExprLine;
    if (tokens.length === 0 && lastUnary === null && entry === null && completedExprLine) {
      nextCompleted = '';
      setCompletedExprLine('');
    }
    if (lastUnary) {
      // Typing a digit replaces previous unary result for this slot
      setLastUnary(null);
    }

    let nextEntry: string;
    if (entry === null) {
      nextEntry = d === '.' ? '0.' : d;
    } else if (/e[+-]/i.test(entry)) {
      if (d === '.') return;
      const [mantissa, expPart] = entry.split(/e/i);
      const sign = expPart[0] === '-' ? '-' : '+';
      const digits = expPart.slice(1);
      const newExp = digits === '0' ? d : digits.length < 3 ? digits + d : digits;
      nextEntry = `${mantissa}e${sign}${newExp}`;
    } else if (d === '.') {
      nextEntry = entry.includes('.') ? entry : `${entry}.`;
    } else if (entry === '0') {
      nextEntry = d;
    } else if (entry === '-0') {
      nextEntry = `-${d}`;
    } else {
      if (entry.replace(/[-.]/g, '').length >= 16) return;
      nextEntry = `${entry}${d}`;
    }

    setEntry(nextEntry);
    setNumericValue(parseNumericValue(nextEntry));
    const nextExpr =
      nextTokens.length > 0 ? tokensToExpressionString(nextTokens) : nextCompleted;
    syncBoxState(nextExpr, formatEntryForDisplay(nextEntry));
  };

  const handleExpButton = () => {
    closeMenus();
    if (errorMsg) return;
    if (lastUnary) {
      const valStr = String(lastUnary.value);
      const next = valStr.includes('.') ? `${valStr}e+0` : `${valStr}.e+0`;
      setLastUnary(null);
      setEntry(next);
      setNumericValue(lastUnary.value);
      syncBoxState(tokensToExpressionString(tokens), next);
      return;
    }
    const base =
      entry !== null
        ? entry
        : Number.isFinite(numericValue)
        ? String(numericValue)
        : '0';
    if (/e/i.test(base)) return;
    const next = base.includes('.') ? `${base}e+0` : `${base}.e+0`;
    setEntry(next);
    syncBoxState(tokensToExpressionString(tokens), next);
  };

  const handleConstant = (val: number) => {
    closeMenus();
    resetOnErrorIfNeeded();
    const formatted = formatCalcNumber(val, isFeMode);
    const label = formatCalcNumber(val, false).replace(/,/g, '');
    setEntry(null);
    setNumericValue(val);
    setLastUnary({ value: val, label });
    const expr = tokens.length > 0 ? `${tokensToExpressionString(tokens)}${label}` : '';
    if (tokens.length === 0) setCompletedExprLine('');
    syncBoxState(expr, formatted);
  };

  const handleRandom = () => {
    closeMenus();
    resetOnErrorIfNeeded();
    const val = Number(Math.random().toFixed(15));
    const formatted = formatCalcNumber(val, isFeMode);
    const label = formatCalcNumber(val, false).replace(/,/g, '');
    setEntry(null);
    setNumericValue(val);
    setLastUnary({ value: val, label });
    const expr = tokens.length > 0 ? `${tokensToExpressionString(tokens)}${label}` : '';
    if (tokens.length === 0) setCompletedExprLine('');
    syncBoxState(expr, formatted);
  };

  const handleBackspace = () => {
    closeMenus();
    if (errorMsg) {
      handleClearAll();
      return;
    }
    if (entry === null) return;
    let next: string;
    if (/e[+-]/i.test(entry)) {
      const [mantissa, expPart] = entry.split(/e/i);
      const sign = expPart[0] === '-' ? '-' : '+';
      const digits = expPart.slice(1);
      if (digits.length > 1) {
        next = `${mantissa}e${sign}${digits.slice(0, -1)}`;
      } else if (digits !== '0') {
        next = `${mantissa}e${sign}0`;
      } else {
        next = mantissa;
      }
    } else if (entry.length <= 1 || (entry.startsWith('-') && entry.length === 2)) {
      next = '0';
    } else {
      next = entry.slice(0, -1);
    }
    setEntry(next);
    setNumericValue(parseNumericValue(next));
    syncBoxState(tokensToExpressionString(tokens), formatEntryForDisplay(next));
  };

  const handleClearEntryOrAll = () => {
    closeMenus();
    if (errorMsg || (entry === null && lastUnary === null)) {
      handleClearAll();
      return;
    }
    // CE: clear just current operand entry
    setEntry('0');
    setLastUnary(null);
    setNumericValue(0);
    syncBoxState(tokensToExpressionString(tokens), '0');
  };

  const handleClearAll = () => {
    closeMenus();
    setTokens([]);
    setEntry(null);
    setLastUnary(null);
    setNumericValue(0);
    setCompletedExprLine('');
    setErrorMsg(null);
    setRepeatOp(null);
    syncBoxState('', '0');
  };

  const handleNegate = () => {
    closeMenus();
    if (errorMsg) return;
    if (entry !== null) {
      let next: string;
      if (/e[+-]/i.test(entry)) {
        next = entry.includes('e+')
          ? entry.replace('e+', 'e-')
          : entry.replace('e-', 'e+');
      } else if (entry === '0' || entry === '0.') {
        return;
      } else if (entry.startsWith('-')) {
        next = entry.slice(1);
      } else {
        next = `-${entry}`;
      }
      setEntry(next);
      setNumericValue(parseNumericValue(next));
      syncBoxState(tokensToExpressionString(tokens), formatEntryForDisplay(next));
      return;
    }

    // Negate computed value / unary
    const base = getCurrentOperand();
    const res = applyUnaryOp('negate', base.value, angleMode);
    if (!res.ok) return;
    const nextLabel = lastUnary || tokens.length > 0 ? formatUnaryLabel('negate', base.label) : '';
    setNumericValue(res.value);
    if (nextLabel) {
      setLastUnary({ value: res.value, label: nextLabel });
      const expr = `${tokensToExpressionString(tokens)}${nextLabel}`;
      syncBoxState(expr, formatCalcNumber(res.value, isFeMode));
    } else {
      setCompletedExprLine('');
      syncBoxState('', formatCalcNumber(res.value, isFeMode));
    }
  };

  const handleUnary = (op: UnaryOpId) => {
    closeMenus();
    if (errorMsg) return;
    const base = getCurrentOperand();
    const res = applyUnaryOp(op, base.value, angleMode);
    if (!res.ok) {
      setErrorMsg(res.error);
      const errExpr = `${tokensToExpressionString(tokens)}${formatUnaryLabel(op, base.label)}`;
      syncBoxState(errExpr, res.error);
      return;
    }
    const label = formatUnaryLabel(op, base.label);
    const formatted = formatCalcNumber(res.value, isFeMode);
    setEntry(null);
    setNumericValue(res.value);
    setLastUnary({ value: res.value, label });
    setRepeatOp(null);
    const nextExpr = `${tokensToExpressionString(tokens)}${label}`;
    setCompletedExprLine('');
    syncBoxState(nextExpr, formatted);
  };

  const handleBinaryOp = (op: BinaryOp) => {
    closeMenus();
    if (errorMsg) return;

    // If previous action was also a binary operator and user didn't enter anything new yet, replace it!
    if (
      tokens.length > 0 &&
      tokens[tokens.length - 1].type === 'op' &&
      entry === null &&
      lastUnary === null
    ) {
      const updatedTokens: CalcToken[] = [...tokens.slice(0, -1), { type: 'op', op }];
      setTokens(updatedTokens);
      setCompletedExprLine('');
      syncBoxState(tokensToExpressionString(updatedTokens), localMainDisplay);
      return;
    }

    const operand = getCurrentOperand();
    const nextTokens: CalcToken[] = [
      ...tokens,
      { type: 'num', value: operand.value, label: operand.label },
      { type: 'op', op },
    ];

    setTokens(nextTokens);
    setEntry(null);
    setLastUnary(null);
    setCompletedExprLine('');
    setRepeatOp(null);

    // Partial preview inside current paren group when pressing lower/equal precedence ops
    const lastParenIdx = nextTokens.map((t) => t.type).lastIndexOf('lparen');
    const slice = lastParenIdx >= 0 ? nextTokens.slice(lastParenIdx + 1, -1) : nextTokens.slice(0, -1);
    const partial = evaluateTokens(slice);
    const displayVal = partial.ok ? partial.value : operand.value;
    setNumericValue(displayVal);

    syncBoxState(
      tokensToExpressionString(nextTokens),
      formatCalcNumber(displayVal, isFeMode)
    );
  };

  const handleOpenParen = () => {
    closeMenus();
    resetOnErrorIfNeeded();
    let baseTokens = tokens;
    if (tokens.length === 0 && completedExprLine) {
      setCompletedExprLine('');
    }
    // If user typed a number/unary right before '(', insert implicit multiplication like 2(3+4)
    if (entry !== null || lastUnary !== null) {
      const op = getCurrentOperand();
      baseTokens = [
        ...tokens,
        { type: 'num', value: op.value, label: op.label },
        { type: 'op', op: '×' },
      ];
      setEntry(null);
      setLastUnary(null);
    }
    const nextTokens: CalcToken[] = [...baseTokens, { type: 'lparen' }];
    setTokens(nextTokens);
    setNumericValue(0);
    syncBoxState(tokensToExpressionString(nextTokens), '0');
  };

  const handleCloseParen = () => {
    closeMenus();
    if (errorMsg || openParensCount <= 0) return;

    const lastParenIdx = tokens.map((t) => t.type).lastIndexOf('lparen');
    if (lastParenIdx === -1) return;

    const operand = getCurrentOperand();
    const innerTokens: CalcToken[] = [
      ...tokens.slice(lastParenIdx + 1),
      { type: 'num', value: operand.value, label: operand.label },
    ];

    const res = evaluateTokens(innerTokens);
    if (!res.ok) {
      setErrorMsg(res.error);
      syncBoxState(`${tokensToExpressionString(tokens)}${operand.label})`, res.error);
      return;
    }

    const groupLabel = `(${tokensToExpressionString(innerTokens)})`;
    const prefixTokens = tokens.slice(0, lastParenIdx);
    const formatted = formatCalcNumber(res.value, isFeMode);

    setTokens(prefixTokens);
    setEntry(null);
    setNumericValue(res.value);
    setLastUnary({ value: res.value, label: groupLabel });
    syncBoxState(`${tokensToExpressionString(prefixTokens)}${groupLabel}`, formatted);
  };

  const handleEquals = () => {
    closeMenus();
    if (errorMsg) {
      handleClearAll();
      return;
    }

    // Case 1: Repeated '=' presses after previous equation (e.g., 5 + 3 = = =)
    if (tokens.length === 0 && lastUnary === null && entry === null && repeatOp) {
      const prevLabel = formatCalcNumber(numericValue, false).replace(/,/g, '');
      const repTokens: CalcToken[] = [
        { type: 'num', value: numericValue, label: prevLabel },
        { type: 'op', op: repeatOp.op },
        { type: 'num', value: repeatOp.rhsVal, label: repeatOp.rhsLabel },
      ];
      const res = evaluateTokens(repTokens);
      if (!res.ok) {
        setErrorMsg(res.error);
        syncBoxState(`${tokensToExpressionString(repTokens)} =`, res.error);
        return;
      }
      const eqExpr = `${tokensToExpressionString(repTokens)} =`;
      const formatted = formatCalcNumber(res.value, isFeMode);
      setNumericValue(res.value);
      setCompletedExprLine(eqExpr);
      syncBoxState(eqExpr, formatted, {
        history: [
          { expr: tokensToExpressionString(repTokens), res: formatted },
          ...(box.history || []).slice(0, 24),
        ],
      });
      return;
    }

    // Case 2: Simple single number or unary expression '='
    if (tokens.length === 0) {
      const operand = getCurrentOperand();
      const formatted = formatCalcNumber(operand.value, isFeMode);
      const eqExpr = `${operand.label} =`;
      setEntry(null);
      setLastUnary(null);
      setNumericValue(operand.value);
      setCompletedExprLine(eqExpr);
      syncBoxState(eqExpr, formatted, {
        history: [
          { expr: operand.label, res: formatted },
          ...(box.history || []).slice(0, 24),
        ],
      });
      return;
    }

    // Case 3: Full binary expression with optional auto-closing parens
    const operand = getCurrentOperand();
    const evalList: CalcToken[] = [
      ...tokens,
      { type: 'num', value: operand.value, label: operand.label },
    ];
    for (let i = 0; i < openParensCount; i++) {
      evalList.push({ type: 'rparen' });
    }

    const res = evaluateTokens(evalList);
    if (!res.ok) {
      setErrorMsg(res.error);
      syncBoxState(`${tokensToExpressionString(evalList)} =`, res.error);
      return;
    }

    // Record last binary op for repeated '=' presses
    let nextRepeatOp: { op: BinaryOp; rhsVal: number; rhsLabel: string } | null = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const tok = tokens[i];
      if (tok.type === 'op') {
        nextRepeatOp = { op: tok.op, rhsVal: operand.value, rhsLabel: operand.label };
        break;
      }
    }

    const exprStr = tokensToExpressionString(evalList);
    const eqExpr = `${exprStr} =`;
    const formatted = formatCalcNumber(res.value, isFeMode);

    setTokens([]);
    setEntry(null);
    setLastUnary(null);
    setNumericValue(res.value);
    setCompletedExprLine(eqExpr);
    setRepeatOp(nextRepeatOp);

    syncBoxState(eqExpr, formatted, {
      history: [{ expr: exprStr, res: formatted }, ...(box.history || []).slice(0, 24)],
    });
  };

  // Cycle DEG -> RAD -> GRAD -> DEG
  const handleCycleAngleMode = () => {
    const order: CalcAngleMode[] = ['DEG', 'RAD', 'GRAD'];
    const nextMode = order[(order.indexOf(angleMode) + 1) % order.length];
    onUpdate({
      angleMode: nextMode,
      isRad: nextMode === 'RAD',
    });
  };

  // Toggle F-E Scientific Notation formatting on current number
  const handleToggleFe = () => {
    const nextFe = !isFeMode;
    const nextDisplay = errorMsg
      ? errorMsg
      : entry !== null
      ? formatEntryForDisplay(entry)
      : formatCalcNumber(numericValue, nextFe);
    lastSyncedRef.current.res = nextDisplay;
    onUpdate({
      isFeMode: nextFe,
      result: nextDisplay,
    });
  };

  // Memory Operations (MC, MR, M+, M-, MS, M▾)
  const handleMemoryClear = () => {
    setShowMemoryDrawer(false);
    onUpdate({ memoryStack: [] });
  };

  const handleMemoryRecall = () => {
    if (memoryStack.length === 0) return;
    closeMenus();
    resetOnErrorIfNeeded();
    const val = memoryStack[0];
    setEntry(null);
    setNumericValue(val);
    setLastUnary(null);
    const formatted = formatCalcNumber(val, isFeMode);
    if (tokens.length === 0) setCompletedExprLine('');
    syncBoxState(tokensToExpressionString(tokens), formatted);
  };

  const handleMemoryStore = () => {
    if (errorMsg) return;
    const val = getCurrentOperand().value;
    setEntry(null);
    onUpdate({ memoryStack: [val, ...memoryStack.slice(0, 19)] });
  };

  const handleMemoryAdd = (deltaSign: 1 | -1, index: number = 0) => {
    if (errorMsg) return;
    const val = getCurrentOperand().value * deltaSign;
    setEntry(null);
    if (memoryStack.length === 0) {
      onUpdate({ memoryStack: [val] });
      return;
    }
    const copy = [...memoryStack];
    copy[index] = (copy[index] || 0) + val;
    onUpdate({ memoryStack: copy });
  };

  const keyHandlersRef = useRef({
    handleDigit,
    handleBinaryOp,
    handleOpenParen,
    handleCloseParen,
    handleEquals,
    handleBackspace,
    handleClearAll,
  });
  keyHandlersRef.current = {
    handleDigit,
    handleBinaryOp,
    handleOpenParen,
    handleCloseParen,
    handleEquals,
    handleBackspace,
    handleClearAll,
  };

  // Physical keyboard support when calculator is active
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.closest('.dcg-container')
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const h = keyHandlersRef.current;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        h.handleDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        h.handleDigit('.');
      } else if (e.key === '+') {
        e.preventDefault();
        h.handleBinaryOp('+');
      } else if (e.key === '-') {
        e.preventDefault();
        h.handleBinaryOp('−');
      } else if (e.key === '*') {
        e.preventDefault();
        h.handleBinaryOp('×');
      } else if (e.key === '/') {
        e.preventDefault();
        h.handleBinaryOp('÷');
      } else if (e.key === '%') {
        e.preventDefault();
        h.handleBinaryOp('mod');
      } else if (e.key === '^') {
        e.preventDefault();
        h.handleBinaryOp('pow');
      } else if (e.key === '(') {
        e.preventDefault();
        h.handleOpenParen();
      } else if (e.key === ')') {
        e.preventDefault();
        h.handleCloseParen();
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        h.handleEquals();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        h.handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        h.handleClearAll();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive]);

  // Dynamic font size so long Windows results & errors always fit cleanly
  const displayStr = localMainDisplay;
  const displayFontSizeClass = errorMsg
    ? 'text-base'
    : displayStr.length > 16
    ? 'text-lg'
    : displayStr.length > 11
    ? 'text-xl'
    : 'text-2xl';

  // Labels for the 6 trig items under (is2nd, isHyp)
  const trigButtons: Array<{ label: string; op: UnaryOpId }> = isHyp
    ? is2nd
      ? [
          { label: 'sinh⁻¹', op: 'asinh' },
          { label: 'cosh⁻¹', op: 'acosh' },
          { label: 'tanh⁻¹', op: 'atanh' },
          { label: 'sech⁻¹', op: 'asech' },
          { label: 'csch⁻¹', op: 'acsch' },
          { label: 'coth⁻¹', op: 'acoth' },
        ]
      : [
          { label: 'sinh', op: 'sinh' },
          { label: 'cosh', op: 'cosh' },
          { label: 'tanh', op: 'tanh' },
          { label: 'sech', op: 'sech' },
          { label: 'csch', op: 'csch' },
          { label: 'coth', op: 'coth' },
        ]
    : is2nd
    ? [
        { label: 'sin⁻¹', op: 'asin' },
        { label: 'cos⁻¹', op: 'acos' },
        { label: 'tan⁻¹', op: 'atan' },
        { label: 'sec⁻¹', op: 'asec' },
        { label: 'csc⁻¹', op: 'acsc' },
        { label: 'cot⁻¹', op: 'acot' },
      ]
    : [
        { label: 'sin', op: 'sin' },
        { label: 'cos', op: 'cos' },
        { label: 'tan', op: 'tan' },
        { label: 'sec', op: 'sec' },
        { label: 'csc', op: 'csc' },
        { label: 'cot', op: 'cot' },
      ];

  const hasPendingOperand = entry !== null || lastUnary !== null;

  return (
    <div
      ref={containerRef}
      data-calc-box-id={box.id}
      data-active={isActive ? 'true' : 'false'}
      onClick={(e) => {
        if (!allowFingerControls && lastPointerTypeRef.current === 'touch') return;
        e.stopPropagation();
        onSelect();
      }}
      onPointerDown={(e) => {
        lastPointerTypeRef.current = e.pointerType;
        if (e.pointerType === 'touch' && !allowFingerControls) return;
        e.stopPropagation();
      }}
      className={`calculator-box absolute select-none shadow-2xl rounded-2xl border transition-shadow ${
        isActive
          ? 'ring-2 ring-emerald-500 border-emerald-400 z-40'
          : 'border-slate-300 dark:border-slate-700 hover:border-emerald-400 z-30'
      } ${isRepositioningActive ? 'ring-4 ring-emerald-400 shadow-2xl' : ''} ${
        isReadOnly ? 'pointer-events-none' : ''
      } bg-slate-900 text-slate-100`}
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${currentWidth}px`,
        height: `${currentHeight}px`,
        overflow: 'visible',
        transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      {/* TOP-RIGHT L-GRAB RESIZE HANDLE */}
      {!hideChrome && (
        <div
          data-export-hide-clean="true"
          onPointerDown={(e) => {
            if (e.pointerType === 'touch' && !allowFingerControls) return;
            e.preventDefault();
            e.stopPropagation();
            onSelect();
            startResizeTR(e.clientX, e.clientY);
          }}
          title="Drag L-handle to scale calculator & keys"
          style={{ touchAction: 'none' }}
          className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
        >
          <div className="w-5 h-5 border-t-3 border-r-3 border-emerald-400 rounded-tr-md bg-slate-900/95 shadow-md flex items-center justify-center group-hover:border-emerald-300">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
          </div>
        </div>
      )}

      {/* BOTTOM-LEFT L-GRAB RESIZE HANDLE */}
      {!hideChrome && (
        <div
          data-export-hide-clean="true"
          onPointerDown={(e) => {
            if (e.pointerType === 'touch' && !allowFingerControls) return;
            e.preventDefault();
            e.stopPropagation();
            onSelect();
            startResizeBL(e.clientX, e.clientY);
          }}
          title="Drag L-handle to scale calculator & keys"
          style={{ touchAction: 'none' }}
          className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize hover:scale-125 transition-transform z-50 group pointer-events-auto touch-none"
        >
          <div className="w-5 h-5 border-b-3 border-l-3 border-emerald-400 rounded-bl-md bg-slate-900/95 shadow-md flex items-center justify-center group-hover:border-emerald-300">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SCALED INNER WINDOWS SCIENTIFIC CALCULATOR UI                  */}
      {/* ============================================================== */}
      <div
        ref={logicalStageRef}
        style={{
          width: `${CALC_BASE_WIDTH}px`,
          height: `${CALC_BASE_HEIGHT}px`,
          transform: `scale(${currentScale})`,
          transformOrigin: 'top left',
        }}
        className="calc-logical-stage relative flex flex-col rounded-2xl overflow-hidden bg-[#1b1f27] text-slate-100"
      >
        {/* 1. Top Header Bar */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-800 bg-[#14171d] rounded-t-2xl shrink-0">
          <div className="flex items-center gap-1.5">
            {!hideChrome && (
              <div
                data-export-hide-clean="true"
                onPointerDown={handlePointerDownMove}
                style={{ touchAction: 'none' }}
                title="Drag to reposition calculator"
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold cursor-grab active:cursor-grabbing select-none shadow-xs touch-none ${
                  isRepositioningActive
                    ? 'bg-emerald-600 text-white ring-2 ring-emerald-300 border-emerald-400'
                    : 'bg-emerald-950/80 border-emerald-600/70 text-emerald-300 hover:bg-emerald-900/80 hover:text-white'
                }`}
              >
                <Move className="w-3 h-3 stroke-[2.5]" />
                <span className="text-[10px] tracking-wider uppercase">
                  {isRepositioningActive ? 'Moving' : 'Move'}
                </span>
              </div>
            )}
            <span className="text-xs font-semibold tracking-wide text-slate-200">
              Scientific
            </span>
            {!hideChrome && (
              <span
                data-export-hide-clean="true"
                className="text-[10px] text-slate-500 font-mono"
              >
                {Math.round(currentScale * 100)}%
              </span>
            )}
          </div>

          {!hideChrome && (
            <div data-export-hide-clean="true" className="flex items-center gap-1">
              <button
                type="button"
                title="Calculation History"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMemoryDrawer(false);
                  closeMenus();
                  setShowHistory(!showHistory);
                }}
                className={`p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors ${
                  showHistory ? 'text-emerald-400 bg-slate-800' : ''
                }`}
              >
                <History className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                title="Toggle Normal / Compact Size"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate({ scale: currentScale > 1 ? 1 : 1.25 });
                }}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                {currentScale > 1 ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                title="Close Calculator"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-1 rounded text-rose-400 hover:bg-rose-950/50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* 2. Two-Line Display Area */}
        <div
          onClick={closeMenus}
          className="px-3 pt-2 pb-1.5 bg-[#1b1f27] shrink-0 flex flex-col justify-end min-h-[68px]"
        >
          <div className="text-right font-mono text-[11px] text-slate-400 truncate min-h-[16px]">
            {liveBreadcrumb}
          </div>
          <div
            className={`text-right font-semibold tracking-tight text-white truncate min-h-[36px] flex items-center justify-end leading-none ${displayFontSizeClass}`}
          >
            {displayStr}
          </div>
        </div>

        {/* 3. DEG / RAD / GRAD + F-E Row */}
        <div className="flex items-center justify-between px-2.5 py-0.5 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCycleAngleMode}
              title="Click to cycle angle unit: DEG → RAD → GRAD"
              className="px-2 py-0.5 rounded font-semibold tracking-wide text-slate-100 hover:bg-slate-700/70 transition-colors cursor-pointer"
            >
              {angleMode}
            </button>
            <button
              type="button"
              onClick={handleToggleFe}
              title="Toggle Fixed-decimal / Scientific Exponential (F-E) notation"
              className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                isFeMode
                  ? 'bg-emerald-600/80 text-white'
                  : 'text-slate-300 hover:bg-slate-700/70'
              }`}
            >
              F-E
            </button>
          </div>

          <div className="flex items-center gap-1">
            {is2nd && (
              <span className="px-1.5 py-0.5 rounded bg-sky-600/80 text-[9px] font-bold text-white">
                2nd
              </span>
            )}
            {isHyp && (
              <span className="px-1.5 py-0.5 rounded bg-amber-600/80 text-[9px] font-bold text-white">
                HYP
              </span>
            )}
          </div>
        </div>

        {/* 4. Memory Buttons Row: MC, MR, M+, M-, MS, M▾ */}
        <div className="grid grid-cols-6 gap-1 px-2 py-0.5 text-[11px] shrink-0">
          <button
            type="button"
            disabled={memoryStack.length === 0}
            onClick={handleMemoryClear}
            title="Memory Clear"
            className={`py-1 rounded font-medium transition-colors ${
              memoryStack.length === 0
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-200 hover:bg-slate-700/70 cursor-pointer'
            }`}
          >
            MC
          </button>
          <button
            type="button"
            disabled={memoryStack.length === 0}
            onClick={handleMemoryRecall}
            title="Memory Recall"
            className={`py-1 rounded font-medium transition-colors ${
              memoryStack.length === 0
                ? 'text-slate-600 cursor-not-allowed'
                : 'text-slate-200 hover:bg-slate-700/70 cursor-pointer'
            }`}
          >
            MR
          </button>
          <button
            type="button"
            onClick={() => handleMemoryAdd(1)}
            title="Memory Add"
            className="py-1 rounded font-medium text-slate-200 hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            M+
          </button>
          <button
            type="button"
            onClick={() => handleMemoryAdd(-1)}
            title="Memory Subtract"
            className="py-1 rounded font-medium text-slate-200 hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            M-
          </button>
          <button
            type="button"
            onClick={handleMemoryStore}
            title="Memory Store"
            className="py-1 rounded font-medium text-slate-200 hover:bg-slate-700/70 transition-colors cursor-pointer"
          >
            MS
          </button>
          <button
            type="button"
            disabled={memoryStack.length === 0}
            data-calc-menu-open={showMemoryDrawer ? 'true' : undefined}
            onClick={() => {
              closeMenus();
              setShowHistory(false);
              setShowMemoryDrawer(!showMemoryDrawer);
            }}
            title="View Stored Memory"
            className={`py-1 rounded font-medium flex items-center justify-center gap-0.5 transition-colors ${
              memoryStack.length === 0
                ? 'text-slate-600 cursor-not-allowed'
                : showMemoryDrawer
                ? 'bg-slate-700 text-emerald-300 cursor-pointer'
                : 'text-slate-200 hover:bg-slate-700/70 cursor-pointer'
            }`}
          >
            <span>M</span>
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* 5. Windows Flyout Toolbar: Trigonometry ▾ & Function ▾ */}
        <div className="relative flex items-center gap-2 px-2 py-1 border-b border-slate-800/80 text-[11px] shrink-0">
          <button
            type="button"
            data-calc-menu-open={showTrigMenu ? 'true' : undefined}
            onClick={() => {
              setShowFuncMenu(false);
              setShowTrigMenu(!showTrigMenu);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              showTrigMenu
                ? 'bg-slate-700 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Triangle className="w-3 h-3 text-slate-400" />
            <span>Trigonometry</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          <button
            type="button"
            data-calc-menu-open={showFuncMenu ? 'true' : undefined}
            onClick={() => {
              setShowTrigMenu(false);
              setShowFuncMenu(!showFuncMenu);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              showFuncMenu
                ? 'bg-slate-700 text-white'
                : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span className="italic font-serif text-slate-400 text-xs">f</span>
            <span>Function</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* Trigonometry Popover Menu (Exact Windows Layout: 2nd, hyp, sin/cos/tan/sec/csc/cot & inverses) */}
          {showTrigMenu && (
            <div
              data-export-hide-clean="true"
              onClick={(e) => e.stopPropagation()}
              className="absolute left-2 top-full mt-1 w-64 bg-[#262b36] border border-slate-600/80 rounded-xl shadow-2xl p-2 z-50"
            >
              <div className="grid grid-cols-4 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setIs2nd(!is2nd)}
                  className={`py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                    is2nd
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-700/70 hover:bg-slate-600 text-slate-200'
                  }`}
                >
                  2ⁿᵈ
                </button>
                {trigButtons.slice(0, 3).map((tb) => (
                  <button
                    key={tb.op}
                    type="button"
                    onClick={() => handleUnary(tb.op)}
                    className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                  >
                    {tb.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setIsHyp(!isHyp)}
                  className={`py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
                    isHyp
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-700/70 hover:bg-slate-600 text-slate-200'
                  }`}
                >
                  hyp
                </button>
                {trigButtons.slice(3, 6).map((tb) => (
                  <button
                    key={tb.op}
                    type="button"
                    onClick={() => handleUnary(tb.op)}
                    className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                  >
                    {tb.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Function Popover Menu (Exact Windows Layout: |x|, ⌊x⌋, ⌈x⌉, rand, →dms, →deg) */}
          {showFuncMenu && (
            <div
              data-export-hide-clean="true"
              onClick={(e) => e.stopPropagation()}
              className="absolute left-24 top-full mt-1 w-56 bg-[#262b36] border border-slate-600/80 rounded-xl shadow-2xl p-2 z-50"
            >
              <div className="grid grid-cols-3 gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => handleUnary('abs')}
                  className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                >
                  |x|
                </button>
                <button
                  type="button"
                  onClick={() => handleUnary('floor')}
                  className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                >
                  ⌊x⌋
                </button>
                <button
                  type="button"
                  onClick={() => handleUnary('ceil')}
                  className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                >
                  ⌈x⌉
                </button>
                <button
                  type="button"
                  onClick={handleRandom}
                  className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                >
                  rand
                </button>
                <button
                  type="button"
                  onClick={() => handleUnary('dms')}
                  className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                >
                  →dms
                </button>
                <button
                  type="button"
                  onClick={() => handleUnary('deg')}
                  className="py-2 rounded-lg bg-[#323846] hover:bg-slate-600 text-white font-medium active:scale-95 transition-transform cursor-pointer"
                >
                  →deg
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 6. Windows 5×7 Scientific Keypad Grid */}
        <div className="p-2 flex-1 grid grid-cols-5 grid-rows-7 gap-1 text-xs select-none">
          {/* Row 1: 2nd, π, e, CE/C, ⌫ */}
          <button
            type="button"
            onClick={() => {
              closeMenus();
              setIs2nd(!is2nd);
            }}
            className={`rounded-md font-semibold active:scale-95 transition-all cursor-pointer ${
              is2nd
                ? 'bg-sky-500 text-white shadow-xs'
                : 'bg-[#2a303d] hover:bg-[#363d4d] text-slate-200'
            }`}
          >
            2ⁿᵈ
          </button>
          <button
            type="button"
            onClick={() => handleConstant(Math.PI)}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-serif text-sm active:scale-95 transition-transform cursor-pointer"
          >
            π
          </button>
          <button
            type="button"
            onClick={() => handleConstant(Math.E)}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-serif text-sm active:scale-95 transition-transform cursor-pointer"
          >
            e
          </button>
          <button
            type="button"
            onClick={handleClearEntryOrAll}
            title={hasPendingOperand ? 'Clear Entry (click again to Clear All)' : 'Clear All'}
            className="rounded-md bg-[#2a303d] hover:bg-rose-900/60 text-slate-200 hover:text-rose-200 font-semibold active:scale-95 transition-transform cursor-pointer"
          >
            {hasPendingOperand ? 'CE' : 'C'}
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            title="Backspace"
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          >
            <Delete className="w-3.5 h-3.5" />
          </button>

          {/* Row 2: x²/x³, 1/x, |x|, exp, mod */}
          <button
            type="button"
            onClick={() => handleUnary(is2nd ? 'cube' : 'sqr')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            {is2nd ? 'x³' : 'x²'}
          </button>
          <button
            type="button"
            onClick={() => handleUnary('inv')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            ¹/x
          </button>
          <button
            type="button"
            onClick={() => handleUnary('abs')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            |x|
          </button>
          <button
            type="button"
            onClick={handleExpButton}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            exp
          </button>
          <button
            type="button"
            onClick={() => handleBinaryOp('mod')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            mod
          </button>

          {/* Row 3: ²√x / ³√x, (, ), n!, ÷ */}
          <button
            type="button"
            onClick={() => handleUnary(is2nd ? 'cbrt' : 'sqrt')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            {is2nd ? '³√x' : '²√x'}
          </button>
          <button
            type="button"
            onClick={handleOpenParen}
            className="relative rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            <span>(</span>
            {openParensCount > 0 && (
              <span className="absolute bottom-0.5 right-1 text-[9px] text-sky-400 font-mono font-bold">
                {openParensCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleCloseParen}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            )
          </button>
          <button
            type="button"
            onClick={() => handleUnary('fact')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            n!
          </button>
          <button
            type="button"
            onClick={() => handleBinaryOp('÷')}
            className="rounded-md bg-[#2a303d] hover:bg-blue-600/80 text-slate-100 text-base font-medium active:scale-95 transition-transform cursor-pointer"
          >
            ÷
          </button>

          {/* Row 4: xʸ / ʸ√x, 7, 8, 9, × */}
          <button
            type="button"
            onClick={() => handleBinaryOp(is2nd ? 'yroot' : 'pow')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            {is2nd ? 'ʸ√x' : 'xʸ'}
          </button>
          <button
            type="button"
            onClick={() => handleDigit('7')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleDigit('8')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleDigit('9')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            9
          </button>
          <button
            type="button"
            onClick={() => handleBinaryOp('×')}
            className="rounded-md bg-[#2a303d] hover:bg-blue-600/80 text-slate-100 text-base font-medium active:scale-95 transition-transform cursor-pointer"
          >
            ×
          </button>

          {/* Row 5: 10ˣ / 2ˣ, 4, 5, 6, − */}
          <button
            type="button"
            onClick={() => handleUnary(is2nd ? 'twoPow' : 'tenPow')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            {is2nd ? '2ˣ' : '10ˣ'}
          </button>
          <button
            type="button"
            onClick={() => handleDigit('4')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleDigit('5')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleDigit('6')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            6
          </button>
          <button
            type="button"
            onClick={() => handleBinaryOp('−')}
            className="rounded-md bg-[#2a303d] hover:bg-blue-600/80 text-slate-100 text-base font-medium active:scale-95 transition-transform cursor-pointer"
          >
            −
          </button>

          {/* Row 6: log / logᵧx, 1, 2, 3, + */}
          <button
            type="button"
            onClick={() => (is2nd ? handleBinaryOp('logbase') : handleUnary('log10'))}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            {is2nd ? 'logᵧx' : 'log'}
          </button>
          <button
            type="button"
            onClick={() => handleDigit('1')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleDigit('2')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleDigit('3')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            3
          </button>
          <button
            type="button"
            onClick={() => handleBinaryOp('+')}
            className="rounded-md bg-[#2a303d] hover:bg-blue-600/80 text-slate-100 text-base font-medium active:scale-95 transition-transform cursor-pointer"
          >
            +
          </button>

          {/* Row 7: ln / eˣ, +/−, 0, ., = */}
          <button
            type="button"
            onClick={() => handleUnary(is2nd ? 'expPow' : 'ln')}
            className="rounded-md bg-[#2a303d] hover:bg-[#363d4d] text-slate-200 font-medium active:scale-95 transition-transform cursor-pointer"
          >
            {is2nd ? 'eˣ' : 'ln'}
          </button>
          <button
            type="button"
            onClick={handleNegate}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-xs active:scale-95 transition-transform cursor-pointer"
          >
            ⁺⁄₋
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-sm active:scale-95 transition-transform cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleDigit('.')}
            className="rounded-md bg-[#343b4a] hover:bg-[#41495c] text-white font-semibold text-base active:scale-95 transition-transform cursor-pointer"
          >
            .
          </button>
          <button
            type="button"
            onClick={handleEquals}
            className="rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-base shadow-md active:scale-95 transition-transform cursor-pointer"
          >
            =
          </button>
        </div>

        {/* Memory Stack Drawer Overlay */}
        {showMemoryDrawer && (
          <div
            data-export-hide-clean="true"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-[#1b1f27]/98 rounded-2xl p-3 flex flex-col z-40"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-200">Memory</span>
              <button
                type="button"
                onClick={() => setShowMemoryDrawer(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 py-2">
              {memoryStack.map((val, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    resetOnErrorIfNeeded();
                    setEntry(null);
                    setNumericValue(val);
                    setLastUnary(null);
                    const formatted = formatCalcNumber(val, isFeMode);
                    syncBoxState(tokensToExpressionString(tokens), formatted);
                    setShowMemoryDrawer(false);
                  }}
                  className="p-2 rounded-lg bg-slate-800/70 hover:bg-slate-800 cursor-pointer flex flex-col gap-1"
                >
                  <div className="text-right font-mono text-sm font-bold text-white">
                    {formatCalcNumber(val, isFeMode)}
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center justify-end gap-1 text-[10px]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const copy = memoryStack.filter((_, i) => i !== idx);
                        onUpdate({ memoryStack: copy });
                      }}
                      className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-rose-700 text-slate-200 cursor-pointer"
                    >
                      MC
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMemoryAdd(1, idx)}
                      className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                    >
                      M+
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMemoryAdd(-1, idx)}
                      className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 cursor-pointer"
                    >
                      M-
                    </button>
                  </div>
                </div>
              ))}
              {memoryStack.length === 0 && (
                <div className="text-center text-xs text-slate-500 py-8">
                  There&apos;s nothing saved in memory
                </div>
              )}
            </div>
            {memoryStack.length > 0 && (
              <button
                type="button"
                onClick={handleMemoryClear}
                className="w-full py-1.5 text-xs text-slate-400 hover:text-rose-400 border-t border-slate-800 cursor-pointer"
              >
                Clear all memory
              </button>
            )}
          </div>
        )}

        {/* History Drawer Overlay */}
        {showHistory && (
          <div
            data-export-hide-clean="true"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 bg-[#1b1f27]/98 rounded-2xl p-3 flex flex-col z-40"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-200">History</span>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {(box.history || []).map((h, i) => (
                <div
                  key={i}
                  onClick={() => {
                    const v = parseNumericValue(h.res);
                    setErrorMsg(null);
                    setTokens([]);
                    setEntry(null);
                    setLastUnary(null);
                    setNumericValue(v);
                    setCompletedExprLine(`${h.expr} =`);
                    syncBoxState(`${h.expr} =`, h.res);
                    setShowHistory(false);
                  }}
                  className="p-2 rounded bg-slate-800/60 hover:bg-slate-800 cursor-pointer text-xs"
                >
                  <div className="text-slate-400 text-[11px] font-mono text-right">{h.expr} =</div>
                  <div className="text-white font-mono font-bold text-right text-sm">{h.res}</div>
                </div>
              ))}
              {(!box.history || box.history.length === 0) && (
                <div className="text-center text-xs text-slate-500 py-8">
                  There&apos;s no history yet
                </div>
              )}
            </div>
            {(box.history || []).length > 0 && (
              <button
                type="button"
                onClick={() => onUpdate({ history: [] })}
                className="w-full py-1.5 text-xs text-slate-400 hover:text-rose-400 border-t border-slate-800 cursor-pointer"
              >
                Clear History
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
