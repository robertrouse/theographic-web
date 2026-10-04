/**
 * The search box: one input with a typeahead listbox. Suggestions come
 * from the engine's `suggest` (2-char trigger, core layer only) on every
 * keystroke; the last recent queries show under an EMPTY box on focus.
 * Submitting is the parent's business — on the home page it is a
 * debounced search, in the header it is a navigation to `/?q=`.
 *
 * Keyboard: ↑/↓ move through suggestions, Enter chooses or submits,
 * Escape closes the list and, when it is already closed, clears the box.
 * ⌘K / Ctrl+K / `/` focus it from anywhere on the page.
 */
import type { TargetedKeyboardEvent } from 'preact';
import { useCallback, useEffect, useId, useRef, useState } from 'preact/hooks';
import type { Group, Suggestion } from '@theographic/core';
import { isAborted } from '@theographic/core';
import { SHOW_RECENT } from '../../search/recent';

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  suggest?: (prefix: string, recent: readonly string[]) => Promise<Suggestion[]>;
  recent: readonly string[];
  compact?: boolean;
  autoFocus?: boolean;
  /** Core layer still loading: show the progress bar. */
  loading?: boolean;
  placeholder?: string;
}

const TRIGGER = 2;

const KIND_LABEL: Record<Group, string> = {
  passages: 'Passage',
  verses: 'Verse',
  people: 'Person',
  places: 'Place',
  events: 'Event',
  groups: 'Group',
  topics: 'Topic',
};

function kindLabel(s: Suggestion): string {
  if (s.kind === 'recent') return 'Recent';
  if (s.kind === 'book') return 'Book';
  if (s.kind === 'reference') return 'Passage';
  return s.group ? KIND_LABEL[s.group] : '';
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  suggest,
  recent,
  compact = false,
  autoFocus = false,
  loading = false,
  placeholder,
}: SearchBoxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const focused = useRef(false);

  const showRecent = useCallback(() => {
    const list = recent.slice(0, SHOW_RECENT).map<Suggestion>((q) => ({
      kind: 'recent',
      label: q,
      query: q,
      score: 0,
    }));
    setItems(list);
    setOpen(list.length > 0);
    setActive(-1);
  }, [recent]);

  const refresh = useCallback(
    (v: string) => {
      const text = v.trim();
      if (!text) {
        if (focused.current) showRecent();
        else setOpen(false);
        return;
      }
      if (text.length < TRIGGER || !suggest) {
        setItems([]);
        setOpen(false);
        return;
      }
      suggest(text, recent).then(
        (list) => {
          if (!focused.current) return;
          setItems(list);
          setOpen(list.length > 0);
          setActive(-1);
        },
        (err: unknown) => {
          if (!isAborted(err)) setOpen(false);
        },
      );
    },
    [suggest, recent, showRecent],
  );

  const choose = (s: Suggestion): void => {
    onChange(s.query);
    setOpen(false);
    setActive(-1);
    onSubmit(s.query);
  };

  const onKeyDown = (e: TargetedKeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case 'ArrowDown':
        if (!open && items.length) setOpen(true);
        if (items.length) setActive((a) => (a + 1) % items.length);
        e.preventDefault();
        return;
      case 'ArrowUp':
        if (items.length) setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
        e.preventDefault();
        return;
      case 'Enter': {
        e.preventDefault();
        const s = open && active >= 0 ? items[active] : undefined;
        if (s) choose(s);
        else {
          setOpen(false);
          onSubmit(value.trim());
        }
        return;
      }
      case 'Escape':
        e.preventDefault();
        if (open) {
          setOpen(false);
          setActive(-1);
        } else if (value) {
          onChange('');
          onSubmit('');
        }
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
  };

  // ⌘K / Ctrl+K / "/" from anywhere that is not another field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const cmdK =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k';
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target);
      if (!cmdK && !slash) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <div class={`sb${compact ? ' sb--compact' : ''}`}>
      <form
        role="search"
        class="sb__form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value.trim());
        }}
      >
        <label for={id} class="visually-hidden">
          Search the Bible
        </label>
        <input
          ref={inputRef}
          id={id}
          class="sb__input"
          type="search"
          name="q"
          value={value}
          placeholder={placeholder ?? (compact ? 'Search' : 'Search the Bible')}
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          enterkeyhint="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          // Preact has no synthetic per-keystroke onChange (ADR-0002): `input` is the event.
          onInput={(e) => {
            const v = e.currentTarget.value;
            onChange(v);
            refresh(v);
          }}
          onFocus={() => {
            focused.current = true;
            refresh(value);
          }}
          onBlur={() => {
            focused.current = false;
            setOpen(false);
          }}
          onKeyDown={onKeyDown}
        />
        <div class="sb__progress" aria-hidden="true" hidden={!loading} />
      </form>
      <ul id={listId} role="listbox" aria-label="Suggestions" class="sb__list" hidden={!open}>
        {items.map((s, i) => (
          <li
            key={`${s.kind}:${s.id ?? s.query}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            class={`sb__item${i === active ? ' is-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(s)}
            onMouseEnter={() => setActive(i)}
          >
            <span class="sb__label">{s.label}</span>
            {s.sublabel && <span class="sb__sub">{s.sublabel}</span>}
            <span class="sb__kind">{kindLabel(s)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
