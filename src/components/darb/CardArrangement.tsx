import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { arrangementKey, moveCard, reconcileCardOrder } from '@/lib/card-arrangement';

type Entry = { id: string; group: string };
type Arrangement = {
  entries: Entry[];
  orders: Record<string, string[]>;
  register: (entry: Entry) => () => void;
  move: (group: string, active: string, over: string) => void;
};
const ArrangementContext = createContext<Arrangement | null>(null);

export function CardArrangement({ account, path, children }: { account: string; path: string; children: ReactNode }) {
  const key = arrangementKey(account, path);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const ready = useRef(false);
  useEffect(() => {
    ready.current = false;
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
      const safe: Record<string, string[]> = {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [group, value] of Object.entries(parsed)) {
          if (Array.isArray(value) && value.every(id => typeof id === 'string')) safe[group] = value;
        }
      }
      setOrders(safe);
    } catch { setOrders({}); }
    ready.current = true;
  }, [key]);
  const register = useCallback((entry: Entry) => {
    setEntries(previous => [...previous.filter(item => item.id !== entry.id), entry]);
    return () => setEntries(previous => previous.filter(item => item.id !== entry.id));
  }, []);
  const move = useCallback((group: string, active: string, over: string) => {
    setOrders(previous => {
      const current = entries.filter(item => item.group === group).map(item => item.id);
      const next = { ...previous, [group]: moveCard(reconcileCardOrder(previous[group] ?? [], current), active, over) };
      if (ready.current) {
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Layout remains usable when browser storage is unavailable. */ }
      }
      return next;
    });
  }, [entries, key]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));
  const end = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const source = entries.find(item => item.id === active.id);
    const destination = entries.find(item => item.id === over.id);
    if (source && destination && source.group === destination.group) move(source.group, source.id, destination.id);
  };
  const value = useMemo(() => ({ entries, orders, register, move }), [entries, orders, register, move]);
  return <ArrangementContext.Provider value={value}>
    <DndContext sensors={sensors} onDragEnd={end} collisionDetection={args => {
      const group = entries.find(item => item.id === args.active.id)?.group;
      return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(item => entries.some(entry => entry.id === item.id && entry.group === group)) });
    }}>{children}</DndContext>
  </ArrangementContext.Provider>;
}

function parentGroup(node: HTMLElement): string | null {
  const parent = node.parentElement;
  if (!parent || !['grid', 'flex'].includes(getComputedStyle(parent).display)) return null;
  const parts: number[] = [];
  let cursor: HTMLElement | null = parent;
  while (cursor && cursor.tagName !== 'MAIN') {
    const ancestor: HTMLElement | null = cursor.parentElement;
    if (!ancestor) return null;
    parts.unshift(Array.from(ancestor.children).indexOf(cursor));
    cursor = ancestor;
  }
  return cursor ? parts.join('.') || 'main' : null;
}

/** CSS order preserves React's DOM ownership and never mutates business records. */
export function useArrangedCard(label: string) {
  const context = useContext(ArrangementContext);
  const [entry, setEntry] = useState<Entry | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const id = entry?.id ?? `inactive:${label}`;
  const { attributes, listeners, setNodeRef: draggableRef, transform, isDragging } = useDraggable({ id, disabled: !entry });
  const { setNodeRef: droppableRef, isOver } = useDroppable({ id, disabled: !entry });
  const register = context?.register;
  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !register) return;
    const group = parentGroup(node);
    if (!group) return;
    const item = { group, id: `${group}:${label}:${Array.from(node.parentElement?.children ?? []).indexOf(node)}` };
    setEntry(item);
    return register(item);
  }, [label, register]);
  const ref = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
    draggableRef(node);
    droppableRef(node);
  }, [draggableRef, droppableRef]);
  const siblings = context?.entries.filter(item => item.group === entry?.group).map(item => item.id) ?? [];
  const order = reconcileCardOrder(context?.orders[entry?.group ?? ''] ?? [], siblings);
  const index = order.indexOf(id);
  const enabled = !!entry && siblings.length > 1;
  const handle = enabled ? <Button variant="ghost" size="icon" className="card-grip size-7 shrink-0 text-muted-foreground" title={`ترتيب بطاقة ${label}`} aria-label={`ترتيب بطاقة ${label}`} {...attributes} {...listeners}
    onKeyDown={event => {
      const delta = ['ArrowDown', 'ArrowLeft'].includes(event.key) ? 1 : ['ArrowUp', 'ArrowRight'].includes(event.key) ? -1 : 0;
      const target = order[index + delta];
      if (delta && target && context && entry) { event.preventDefault(); context.move(entry.group, id, target); }
    }}><GripVertical className="size-4" /></Button> : null;
  return { ref, handle, className: isDragging ? 'card-dragging' : isOver ? 'card-drop-target' : '', style: enabled ? { order: Math.max(0, index), transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, zIndex: isDragging ? 40 : undefined } : undefined };
}