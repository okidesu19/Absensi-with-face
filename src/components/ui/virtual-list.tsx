'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

/**
 * Virtual List Component for efficient rendering of large lists
 * Only renders items visible in the viewport plus overscan
 */
export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 3,
  className = '',
  onEndReached,
  endReachedThreshold = 5
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasCalledEndReached = useRef(false);

  // Calculate visible range
  const { startIndex, endIndex, visibleItems } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(
      items.length,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
      startIndex: start,
      endIndex: end,
      visibleItems: items.slice(start, end)
    };
  }, [scrollTop, itemHeight, containerHeight, items, overscan]);

  // Total height for scrollbar
  const totalHeight = items.length * itemHeight;

  // Offset for visible items
  const offsetY = startIndex * itemHeight;

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);

    // Check for end reached
    if (onEndReached && !hasCalledEndReached.current) {
      const { scrollHeight, scrollTop: st, clientHeight } = target;
      const isNearEnd = scrollHeight - st - clientHeight < endReachedThreshold * itemHeight;
      
      if (isNearEnd) {
        hasCalledEndReached.current = true;
        onEndReached();
      }
    }

    // Reset end reached flag when scrolling up
    if (hasCalledEndReached.current) {
      const { scrollHeight, scrollTop: st, clientHeight } = target;
      if (scrollHeight - st - clientHeight > endReachedThreshold * itemHeight * 2) {
        hasCalledEndReached.current = false;
      }
    }
  }, [onEndReached, itemHeight, endReachedThreshold]);

  // Reset when items change
  useEffect(() => {
    hasCalledEndReached.current = false;
  }, [items.length]);

  // Scroll to index
  const scrollToIndex = useCallback((index: number) => {
    if (containerRef.current) {
      const targetScrollTop = index * itemHeight;
      containerRef.current.scrollTop = targetScrollTop;
    }
  }, [itemHeight]);

  // Scroll to top
  const scrollToTop = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={`overflow-y-auto ${className}`}
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((item, i) => (
            <div
              key={startIndex + i}
              style={{ height: itemHeight }}
            >
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton Loader Component
 */
export function Skeleton({
  className = '',
  variant = 'text',
  width,
  height,
  animation = 'pulse'
}: {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}) {
  const baseClasses = 'bg-muted';
  const animationClasses = {
    pulse: 'animate-pulse',
    wave: 'animate-[shimmer_1.5s_infinite]',
    none: ''
  };
  
  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg'
  };

  const style: React.CSSProperties = {};
  if (width) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) style.height = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className={`${baseClasses} ${animationClasses[animation]} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
}

/**
 * Card Skeleton for loading states
 */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-card rounded-xl border p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" height={16} />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={`${100 - (i * 10)}%`} height={14} />
      ))}
    </div>
  );
}

/**
 * List Item Skeleton for attendance lists
 */
export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border-b">
      <Skeleton variant="circular" width={48} height={48} />
      <div className="flex-1 space-y-2">
        <Skeleton width="40%" height={16} />
        <Skeleton width="60%" height={12} />
      </div>
      <Skeleton width={80} height={32} variant="rectangular" />
    </div>
  );
}

/**
 * Table Skeleton for data tables
 */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-card rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-4 bg-muted/50 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} width={`${100 / columns}%`} height={16} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b last:border-b-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} width={`${100 / columns}%`} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Chart Skeleton for statistics
 */
export function ChartSkeleton() {
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <Skeleton width={150} height={20} />
        <Skeleton width={100} height={32} variant="rectangular" />
      </div>
      <div className="flex items-end gap-2 h-48">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex-1">
            <Skeleton
              variant="rectangular"
              width="100%"
              height={Math.max(20, Math.random() * 180)}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} width={30} height={12} />
        ))}
      </div>
    </div>
  );
}

/**
 * Camera View Skeleton
 */
export function CameraSkeleton() {
  return (
    <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
      <div className="text-center">
        <Skeleton variant="circular" width={64} height={64} className="mx-auto mb-4" />
        <Skeleton width={200} height={16} className="mx-auto" />
      </div>
    </div>
  );
}

/**
 * Full Page Loading Skeleton
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton width={200} height={24} />
          <Skeleton width={150} height={16} />
        </div>
        <Skeleton width={120} height={40} variant="rectangular" />
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} lines={1} />
        ))}
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CameraSkeleton />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ListItemSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
