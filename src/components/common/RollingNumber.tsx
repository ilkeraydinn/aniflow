import React, { useState, useEffect, useRef } from 'react';

interface RollingNumberProps {
  value: number;
  className?: string;
  style?: React.CSSProperties;
}

export const RollingNumber: React.FC<RollingNumberProps> = ({
  value,
  className = '',
  style
}) => {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const prevTargetRef = useRef<number>(value);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (prevTargetRef.current !== value) {
      const oldVal = prevTargetRef.current;
      prevTargetRef.current = value;

      setPrevValue(oldVal);
      setDisplayValue(value);
      setIsAnimating(true);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        setIsAnimating(false);
        setPrevValue(null);
        timerRef.current = null;
      }, 350);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!isAnimating || prevValue === null) {
    return (
      <span className={className} style={{ display: 'inline-block', ...style }}>
        {displayValue}
      </span>
    );
  }

  const isIncrement = displayValue > prevValue;

  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        position: 'relative',
        overflow: 'hidden',
        height: '1.15em',
        lineHeight: 1.15,
        verticalAlign: 'baseline',
        minWidth: `${String(displayValue).length * 0.65}em`,
        textAlign: 'center',
        ...style
      }}
    >
      {/* Exiting number */}
      <span
        key={`out-${prevValue}`}
        style={{
          display: 'block',
          animation: isIncrement
            ? 'rollOutUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            : 'rollOutDown 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        {prevValue}
      </span>

      {/* Entering number */}
      <span
        key={`in-${displayValue}`}
        style={{
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          animation: isIncrement
            ? 'rollInUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            : 'rollInDown 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        {displayValue}
      </span>
    </span>
  );
};
