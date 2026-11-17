import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CornerDownLeft,
  Delete,
  Keyboard,
  Mic,
  Space,
  X,
} from 'lucide-react';

export type VirtualKeyAction =
  | { type: 'char'; value: string }
  | { type: 'backspace' }
  | { type: 'enter' }
  | { type: 'space' }
  | { type: 'move_cursor'; delta: -1 | 1 };

interface OnScreenKeyboardProps {
  onKeyAction: (action: VirtualKeyAction) => void;
  onClose: () => void;
  onSwitchToDictate?: () => void;
  headerTitle?: string;
}

const NUMBER_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const LETTER_ROW_1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
const LETTER_ROW_2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
const LETTER_ROW_3 = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

const SYMBOL_ROW_1 = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'];
const SYMBOL_ROW_2 = ['-', '_', '=', '+', '[', ']', '{', '}', ';', ':'];
const SYMBOL_ROW_3 = ["'", '"', '/', '\\', '<', '>', '?', '~', '|'];

export const OnScreenKeyboard: React.FC<OnScreenKeyboardProps> = ({
  onKeyAction,
  onClose,
  onSwitchToDictate,
  headerTitle,
}) => {
  const [shiftMode, setShiftMode] = useState<'off' | 'once' | 'caps'>('off');
  const [symbolPage, setSymbolPage] = useState<boolean>(false);
  const lastShiftTapRef = useRef<number>(0);
  const repeatTimeoutRef = useRef<number | null>(null);
  const repeatIntervalRef = useRef<number | null>(null);

  const stopKeyRepeat = () => {
    if (repeatTimeoutRef.current !== null) {
      window.clearTimeout(repeatTimeoutRef.current);
      repeatTimeoutRef.current = null;
    }
    if (repeatIntervalRef.current !== null) {
      window.clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopKeyRepeat();
  }, []);

  const handleShiftTap = () => {
    const now = Date.now();
    if (shiftMode === 'caps') {
      setShiftMode('off');
      lastShiftTapRef.current = 0;
      return;
    }
    if (now - lastShiftTapRef.current < 340) {
      setShiftMode('caps');
      lastShiftTapRef.current = 0;
      return;
    }
    lastShiftTapRef.current = now;
    setShiftMode((prev) => (prev === 'off' ? 'once' : 'off'));
  };

  const emitChar = (ch: string) => {
    const isUpper = !symbolPage && shiftMode !== 'off';
    const out = isUpper ? ch.toUpperCase() : ch;
    onKeyAction({ type: 'char', value: out });
    if (shiftMode === 'once') {
      setShiftMode('off');
    }
  };

  const startBackspaceRepeat = () => {
    stopKeyRepeat();
    onKeyAction({ type: 'backspace' });
    repeatTimeoutRef.current = window.setTimeout(() => {
      repeatIntervalRef.current = window.setInterval(() => {
        onKeyAction({ type: 'backspace' });
      }, 65);
    }, 360);
  };

  const preventBlur = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const keyBaseClass =
    'select-none touch-manipulation flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 active:bg-sky-100 dark:active:bg-sky-900/60 active:scale-[0.97] shadow-xs font-medium transition-all cursor-pointer';

  const utilKeyClass =
    'select-none touch-manipulation flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-200/85 dark:bg-slate-700/85 text-slate-800 dark:text-slate-100 hover:bg-slate-300/80 dark:hover:bg-slate-600 active:scale-[0.97] shadow-xs font-semibold transition-all cursor-pointer';

  return (
    <div
      role="region"
      aria-label="On-screen keyboard"
      data-testid="on-screen-keyboard"
      onMouseDown={preventBlur}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[10004] w-[min(780px,calc(100vw-16px))] rounded-2xl border border-slate-300 dark:border-slate-700 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl p-2.5 sm:p-3 select-none"
    >
      {/* Top Action Header */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
          <Keyboard className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
            {headerTitle || 'On-Screen Keyboard'}
          </span>
          <span className="hidden sm:inline text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline truncate text-slate-500 dark:text-slate-400">
            Physical keyboard typing is also active
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => onKeyAction({ type: 'move_cursor', delta: -1 })}
            title="Move cursor left"
            aria-label="Move cursor left"
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => onKeyAction({ type: 'move_cursor', delta: 1 })}
            title="Move cursor right"
            aria-label="Move cursor right"
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {onSwitchToDictate && (
            <button
              type="button"
              onMouseDown={preventBlur}
              onClick={onSwitchToDictate}
              title="Close keyboard and continue dictating with microphone"
              className="h-8 px-3 rounded-lg border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Dictate</span>
            </button>
          )}

          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={onClose}
            className="h-8 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shadow-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Done</span>
          </button>

          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={onClose}
            aria-label="Close on-screen keyboard"
            title="Close keyboard"
            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Keys Grid */}
      <div className="flex flex-col gap-1.5">
        {/* Row 1: Numbers */}
        <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
          {NUMBER_ROW.map((num) => (
            <button
              key={num}
              type="button"
              onMouseDown={preventBlur}
              onClick={() => onKeyAction({ type: 'char', value: num })}
              className={`${keyBaseClass} h-9 sm:h-10 text-sm font-mono`}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Row 2: Q..P or Symbols 1 */}
        <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
          {(symbolPage ? SYMBOL_ROW_1 : LETTER_ROW_1).map((keyChar) => {
            const label = !symbolPage && shiftMode !== 'off' ? keyChar.toUpperCase() : keyChar;
            return (
              <button
                key={keyChar}
                type="button"
                onMouseDown={preventBlur}
                onClick={() => emitChar(keyChar)}
                className={`${keyBaseClass} h-10 sm:h-11 text-base`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Row 3: A..L or Symbols 2 */}
        <div
          className={`grid gap-1 sm:gap-1.5 ${
            symbolPage ? 'grid-cols-10' : 'grid-cols-9 px-3 sm:px-6'
          }`}
        >
          {(symbolPage ? SYMBOL_ROW_2 : LETTER_ROW_2).map((keyChar) => {
            const label = !symbolPage && shiftMode !== 'off' ? keyChar.toUpperCase() : keyChar;
            return (
              <button
                key={keyChar}
                type="button"
                onMouseDown={preventBlur}
                onClick={() => emitChar(keyChar)}
                className={`${keyBaseClass} h-10 sm:h-11 text-base`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Row 4: Shift + Z..M + Backspace */}
        <div className="flex items-stretch gap-1 sm:gap-1.5">
          {!symbolPage ? (
            <button
              type="button"
              onMouseDown={preventBlur}
              onClick={handleShiftTap}
              title="Tap for Shift, double-tap for Caps Lock"
              aria-label="Shift"
              className={`flex-[1.45] h-10 sm:h-11 text-xs font-semibold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 select-none touch-manipulation ${
                shiftMode === 'caps'
                  ? 'bg-sky-600 text-white border-sky-700 shadow-xs'
                  : shiftMode === 'once'
                  ? 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-200 border-sky-400 dark:border-sky-600'
                  : 'bg-slate-200/85 dark:bg-slate-700/85 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-600 hover:bg-slate-300/80'
              }`}
            >
              <span>{shiftMode === 'caps' ? 'CAPS' : 'Shift'}</span>
            </button>
          ) : (
            <div className="flex-[0.6]" />
          )}

          {(symbolPage ? SYMBOL_ROW_3 : LETTER_ROW_3).map((keyChar) => {
            const label = !symbolPage && shiftMode !== 'off' ? keyChar.toUpperCase() : keyChar;
            return (
              <button
                key={keyChar}
                type="button"
                onMouseDown={preventBlur}
                onClick={() => emitChar(keyChar)}
                className={`${keyBaseClass} flex-1 h-10 sm:h-11 text-base`}
              >
                {label}
              </button>
            );
          })}

          <button
            type="button"
            onMouseDown={(e) => {
              preventBlur(e);
              startBackspaceRepeat();
            }}
            onMouseUp={stopKeyRepeat}
            onMouseLeave={stopKeyRepeat}
            onTouchStart={(e) => {
              e.stopPropagation();
              startBackspaceRepeat();
            }}
            onTouchEnd={stopKeyRepeat}
            onTouchCancel={stopKeyRepeat}
            aria-label="Backspace"
            title="Backspace"
            className={`${utilKeyClass} flex-[1.45] h-10 sm:h-11 px-2`}
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>

        {/* Row 5: ?123, Comma, Spacebar, Period, Return */}
        <div className="flex items-stretch gap-1 sm:gap-1.5">
          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => setSymbolPage((prev) => !prev)}
            className={`${utilKeyClass} flex-[1.3] h-10 sm:h-11 text-xs`}
          >
            {symbolPage ? 'ABC' : '?123'}
          </button>

          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => emitChar(',')}
            className={`${keyBaseClass} flex-[0.8] h-10 sm:h-11 text-base`}
          >
            ,
          </button>

          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => onKeyAction({ type: 'space' })}
            aria-label="Space"
            className={`${keyBaseClass} flex-[4.5] h-10 sm:h-11 text-xs text-slate-500 dark:text-slate-400 gap-1.5`}
          >
            <Space className="w-4 h-4" />
            <span>Space</span>
          </button>

          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => emitChar('.')}
            className={`${keyBaseClass} flex-[0.8] h-10 sm:h-11 text-base`}
          >
            .
          </button>

          <button
            type="button"
            onMouseDown={preventBlur}
            onClick={() => onKeyAction({ type: 'enter' })}
            aria-label="Return / New Line"
            title="New line"
            className={`${utilKeyClass} flex-[1.6] h-10 sm:h-11 text-xs gap-1`}
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
            <span>Return</span>
          </button>
        </div>
      </div>
    </div>
  );
};
