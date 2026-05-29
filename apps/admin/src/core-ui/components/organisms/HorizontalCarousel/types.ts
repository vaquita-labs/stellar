import { ReactNode } from 'react';

export interface HorizontalCarouselProps<T> {
  title: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}
