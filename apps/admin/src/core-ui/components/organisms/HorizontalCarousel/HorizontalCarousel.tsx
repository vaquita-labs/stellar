'use client';

import { Button, Card, CardBody, CardHeader, ScrollShadow } from '@heroui/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { HorizontalCarouselProps } from './types';

export function HorizontalCarousel<T>({ title, items, renderItem }: HorizontalCarouselProps<T>) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0); // 0..1
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // Drag state (kept in refs to avoid re-renders while dragging)
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  const updateStates = useCallback(() => {
    if (!container) return;
    const max = container.scrollWidth - container.clientWidth;
    const x = container.scrollLeft;
    setProgress(max > 0 ? x / max : 0);
    setAtStart(x <= 0);
    setAtEnd(x >= max - 1);
  }, [container]);

  useEffect(() => {
    if (!container) return;
    const onScroll = () => updateStates();
    const onWheel = () => updateStates();

    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', onWheel, { passive: true });
    updateStates();
    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', onWheel);
    };
  }, [container, updateStates]);

  // Pointer drag handlers (mouse/touch/pen)
  useEffect(() => {
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      // Only react to primary button / primary pointer
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startScrollLeftRef.current = container.scrollLeft;
      container.setPointerCapture(e.pointerId);
      // visual feedback
      container.classList.add('grabbing');
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      container.scrollLeft = startScrollLeftRef.current - dx;
      // prevent text/image selection while dragging
      e.preventDefault();
    };

    const endDrag = (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {}
      container.classList.remove('grabbing');
      updateStates();
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove, { passive: false });
    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointercancel', endDrag);
    container.addEventListener('pointerleave', endDrag);

    // Avoid native image drag “ghost”
    const onDragStart = (e: DragEvent) => e.preventDefault();
    container.addEventListener('dragstart', onDragStart);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', endDrag);
      container.removeEventListener('pointercancel', endDrag);
      container.removeEventListener('pointerleave', endDrag);
      container.removeEventListener('dragstart', onDragStart);
    };
  }, [container, updateStates]);

  const scroll = (dir: 'left' | 'right') => {
    if (!container) return;
    const amount = Math.max(240, Math.floor(container.clientWidth * 0.9));
    container.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  const progressPct = useMemo(() => `${Math.round(progress * 100)}%`, [progress]);

  return (
    <Card shadow="sm" className="bg-white">
      <CardHeader className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="flex gap-2">
          <Button
            aria-label="Scroll left"
            isIconOnly
            variant="light"
            radius="full"
            onPress={() => scroll('left')}
            isDisabled={atStart}
          >
            <FiChevronLeft />
          </Button>
          <Button
            aria-label="Scroll right"
            isIconOnly
            variant="light"
            radius="full"
            onPress={() => scroll('right')}
            isDisabled={atEnd} // fixed: disable when at end
          >
            <FiChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        {/* Fade edges + smooth scroll */}
        <ScrollShadow orientation="horizontal" size={24} className="rounded-xl">
          <div
            ref={setContainer}
            className="no-scrollbar flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 pb-2 select-none cursor-grab"
            style={{ touchAction: 'pan-x' }}
          >
            {items.map((it, idx) => (
              <div key={idx} className="snap-start">
                {renderItem(it)}
              </div>
            ))}
          </div>
        </ScrollShadow>

        {/* Primary scroll indicator */}
        <div className="mt-2 h-1 w-full rounded-full bg-default-200 overflow-hidden">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: progressPct }} />
        </div>
      </CardBody>

      {/* Hide native scrollbars + drag cursors */}
      <style jsx>{`
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .cursor-grab {
          cursor: grab;
        }
        .grabbing {
          cursor: grabbing;
        }
      `}</style>
    </Card>
  );
}
