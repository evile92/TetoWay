import type { ResolvedLabel } from '../i18n';
import { getContrastTextColor } from '../utils/transitGeo';

interface BidiTextProps {
  label: ResolvedLabel;
  className?: string;
}

export function BidiText({ label, className }: BidiTextProps) {
  return (
    <bdi dir={label.dir} className={className}>
      {label.text}
    </bdi>
  );
}

interface LineBadgeProps {
  number: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LineBadge({ number, color, size = 'md' }: LineBadgeProps) {
  const sizeClasses =
    size === 'sm'
      ? 'h-5 min-w-[1.85rem] px-1.5 text-[11px] rounded'
      : size === 'lg'
        ? 'h-8 min-w-[2.5rem] px-2 text-sm rounded-md'
        : 'h-6 min-w-[2.15rem] px-1.5 text-xs rounded-[5px]';

  return (
    <span
      dir="ltr"
      className={`inline-flex items-center justify-center font-bold tracking-tight tabular-nums shrink-0 ${sizeClasses}`}
      style={{
        backgroundColor: color,
        color: getContrastTextColor(color),
      }}
    >
      {number}
    </span>
  );
}
