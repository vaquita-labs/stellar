import { Badge as HeroBadge, BadgeProps } from '@heroui/react';
import React, { PropsWithChildren, ReactNode } from 'react';

export const Badge = ({
  placement = 'bottom-right',
  content,
  children,
  type = 'primary',
  className,
  color,
}: PropsWithChildren<{
  placement?: BadgeProps['placement'];
  content: string | ReactNode;
  type?: 'primary' | 'void';
  isOneChar?: boolean;
  className?: string;
  color?: BadgeProps['color'];
}>) => {
  return (
    <HeroBadge
      placement={placement}
      color={color ?? (type === 'primary' ? 'warning' : undefined)}
    >
      <HeroBadge.Anchor>{children}</HeroBadge.Anchor>
      <HeroBadge.Label className={className}>{content}</HeroBadge.Label>
    </HeroBadge>
  );
};
