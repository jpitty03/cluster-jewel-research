import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { CraftingCatalogMod } from '../crafting-engine/src/service/craftingCatalog.ts';

export interface SearchableModifierSelectProps {
  value: string;
  onChange: (nextModId: string) => void;
  eligibleMods: CraftingCatalogMod[];
  disabledModIds?: string[];
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

interface CategoryBucket {
  id: 'prefix' | 'prefix_notable' | 'suffix' | 'suffix_notable';
  label: string;
  mods: CraftingCatalogMod[];
}

interface PopupGeometry {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  opensUpward: boolean;
}

const POPUP_VIEWPORT_MARGIN = 8;
const PREFERRED_POPUP_HEIGHT = 252;

const CATEGORY_CONFIGS = [
  { id: 'prefix', label: 'Prefix', match: (mod: CraftingCatalogMod) => mod.genType === 'Prefix' && !mod.isNotable },
  { id: 'prefix_notable', label: 'Prefix Notables', match: (mod: CraftingCatalogMod) => mod.genType === 'Prefix' && mod.isNotable },
  { id: 'suffix', label: 'Suffix', match: (mod: CraftingCatalogMod) => mod.genType === 'Suffix' && !mod.isNotable },
  { id: 'suffix_notable', label: 'Suffix Notables', match: (mod: CraftingCatalogMod) => mod.genType === 'Suffix' && mod.isNotable },
] as const;

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[—–−-]/g, '-')
    .replace(/[+()%,:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildModSearchIndex(mod: CraftingCatalogMod): string {
  const parts: string[] = [
    mod.displayName,
    mod.statText,
    mod.technicalName,
    mod.name,
    mod.modId,
    mod.modGroup,
    mod.genType,
    mod.isNotable ? 'notable prefix notable suffix notable' : 'ordinary affix',
    `t${mod.tier}`,
    `tier ${mod.tier}`,
    `tier${mod.tier}`,
    `ilvl ${mod.requiredItemLevel}`,
    `ilvl${mod.requiredItemLevel}`,
    `lvl ${mod.requiredItemLevel}`,
    `lvl${mod.requiredItemLevel}`,
    `level ${mod.requiredItemLevel}`,
    String(mod.requiredItemLevel),
    ...(mod.searchAliases ?? []),
  ];

  const raw = parts.join(' ').toLowerCase();
  const extraAliases: string[] = [];
  if (raw.includes('intelligence')) extraAliases.push('int');
  if (raw.includes('dexterity')) extraAliases.push('dex');
  if (raw.includes('strength')) extraAliases.push('str');
  if (raw.includes('energy shield')) extraAliases.push('es');
  if (raw.includes('attack speed')) extraAliases.push('as', 'ias');
  if (raw.includes('cast speed')) extraAliases.push('cs', 'ics');
  if (raw.includes('movement speed')) extraAliases.push('ms');
  if (raw.includes('maximum life') || raw.includes('to life')) extraAliases.push('life', 'hp');
  if (raw.includes('maximum mana') || raw.includes('to mana')) extraAliases.push('mana', 'mp');
  if (raw.includes('all elemental resistances') || raw.includes('to all resistances')) extraAliases.push('all res', 'allres');
  if (raw.includes('fire resistance')) extraAliases.push('fire res', 'fireres');
  if (raw.includes('cold resistance')) extraAliases.push('cold res', 'coldres');
  if (raw.includes('lightning resistance')) extraAliases.push('lightning res', 'light res', 'lightres');
  if (raw.includes('chaos resistance')) extraAliases.push('chaos res', 'chaosres');
  if (raw.includes('increased effect')) extraAliases.push('effect', 'inc effect', '35%');

  return normalizeSearchText(parts.concat(extraAliases).join(' '));
}

export function SearchableModifierSelect({
  value,
  onChange,
  eligibleMods,
  disabledModIds = [],
  ariaLabel = 'Select modifier',
  placeholder = 'Select an eligible modifier…',
  className = '',
}: SearchableModifierSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [popupGeometry, setPopupGeometry] = useState<PopupGeometry | null>(null);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const generatedId = useId();
  const listboxId = `modifier-listbox-${generatedId.replace(/:/g, '')}`;

  const selectedMod = useMemo(
    () => eligibleMods.find((mod) => mod.modId === value),
    [eligibleMods, value]
  );

  // Group and sort alphabetically within each category
  const categories = useMemo((): CategoryBucket[] => {
    const normalizedQuery = normalizeSearchText(query);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    const matchesSearch = (mod: CraftingCatalogMod): boolean => {
      if (tokens.length === 0) return true;
      const modIndex = buildModSearchIndex(mod);
      return tokens.every((token) => modIndex.includes(token));
    };

    const sortAlphabetical = (left: CraftingCatalogMod, right: CraftingCatalogMod) => {
      const cmp = left.displayName.localeCompare(right.displayName, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (cmp !== 0) return cmp;
      return (left.tier ?? 0) - (right.tier ?? 0) || left.modId.localeCompare(right.modId);
    };

    const result: CategoryBucket[] = [];

    for (const config of CATEGORY_CONFIGS) {
      const matchingMods = eligibleMods
        .filter((mod) => config.match(mod) && matchesSearch(mod))
        .sort(sortAlphabetical);

      if (matchingMods.length > 0) {
        result.push({
          id: config.id,
          label: config.label,
          mods: matchingMods,
        });
      }
    }

    return result;
  }, [eligibleMods, query]);

  // Flat list of all currently visible mods for arrow key navigation
  const flatVisibleMods = useMemo(
    () => categories.flatMap((cat) => cat.mods),
    [categories]
  );

  const totalMatchingCount = flatVisibleMods.length;
  const disabledModIdSet = useMemo(() => new Set(disabledModIds), [disabledModIds]);
  const enabledIndices = useMemo(
    () => flatVisibleMods.flatMap((mod, index) =>
      disabledModIdSet.has(mod.modId) ? [] : [index]
    ),
    [disabledModIdSet, flatVisibleMods]
  );
  const activeDescendantId = highlightedIndex >= 0 &&
      !disabledModIdSet.has(flatVisibleMods[highlightedIndex]?.modId ?? '')
    ? `${listboxId}-option-${highlightedIndex}`
    : undefined;

  const measurePopup = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportWidth = visualViewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight = visualViewport?.height ?? document.documentElement.clientHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const triggerOutsideViewport =
      triggerRect.bottom <= viewportTop + POPUP_VIEWPORT_MARGIN ||
      triggerRect.top >= viewportBottom - POPUP_VIEWPORT_MARGIN ||
      triggerRect.right <= viewportLeft + POPUP_VIEWPORT_MARGIN ||
      triggerRect.left >= viewportRight - POPUP_VIEWPORT_MARGIN;
    if (triggerOutsideViewport) {
      setIsOpen(false);
      setPopupGeometry(null);
      setQuery('');
      setHighlightedIndex(-1);
      return;
    }
    const maximumWidth = Math.max(0, viewportWidth - POPUP_VIEWPORT_MARGIN * 2);
    const width = Math.min(triggerRect.width, maximumWidth);
    const left = Math.min(
      Math.max(triggerRect.left, viewportLeft + POPUP_VIEWPORT_MARGIN),
      Math.max(viewportLeft + POPUP_VIEWPORT_MARGIN, viewportRight - POPUP_VIEWPORT_MARGIN - width),
    );
    const measuredHeight = popupRef.current?.getBoundingClientRect().height ?? 0;
    const desiredHeight = Math.min(
      PREFERRED_POPUP_HEIGHT,
      measuredHeight > 0 ? measuredHeight : PREFERRED_POPUP_HEIGHT,
    );
    const spaceBelow = Math.max(0, viewportBottom - POPUP_VIEWPORT_MARGIN - triggerRect.bottom);
    const spaceAbove = Math.max(0, triggerRect.top - viewportTop - POPUP_VIEWPORT_MARGIN);
    const opensUpward = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableHeight = opensUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(0, Math.min(PREFERRED_POPUP_HEIGHT, availableHeight));
    const renderedHeight = Math.min(desiredHeight, maxHeight);
    const top = opensUpward
      ? Math.max(viewportTop + POPUP_VIEWPORT_MARGIN, triggerRect.top - renderedHeight)
      : Math.min(triggerRect.bottom, viewportBottom - POPUP_VIEWPORT_MARGIN - renderedHeight);

    setPopupGeometry((current) => {
      const next = { left, top, width, maxHeight, opensUpward };
      return current && Object.keys(next).every((key) =>
        current[key as keyof PopupGeometry] === next[key as keyof PopupGeometry]
      ) ? current : next;
    });
  }, []);

  const handleOpen = useCallback(() => {
    measurePopup();
    setIsOpen(true);
    setHighlightedIndex(enabledIndices[0] ?? -1);
  }, [enabledIndices, measurePopup]);

  const handleClose = useCallback((returnFocus = false) => {
    setIsOpen(false);
    setPopupGeometry(null);
    setQuery('');
    setHighlightedIndex(-1);
    if (returnFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, []);

  const handleSelectMod = useCallback(
    (modId: string) => {
      onChange(modId);
      handleClose(true);
    },
    [onChange, handleClose]
  );

  const handleClearSelection = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onChange('');
      setQuery('');
    },
    [onChange]
  );

  // Focus and position before the open surface can paint in a stale location.
  useLayoutEffect(() => {
    if (isOpen) {
      measurePopup();
      searchInputRef.current?.focus();
    }
  }, [isOpen, measurePopup]);

  // Keep the portaled surface attached during viewport, ancestor-scroll, and content-size changes.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(measurePopup);
    let resizeFrame = 0;
    let settledLayoutFrame = 0;
    const measureAfterResponsiveLayout = () => {
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(settledLayoutFrame);
      resizeFrame = requestAnimationFrame(() => {
        measurePopup();
        settledLayoutFrame = requestAnimationFrame(measurePopup);
      });
    };
    window.addEventListener('resize', measureAfterResponsiveLayout);
    window.addEventListener('scroll', measurePopup, true);
    window.visualViewport?.addEventListener('resize', measureAfterResponsiveLayout);
    window.visualViewport?.addEventListener('scroll', measurePopup);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(measureAfterResponsiveLayout);
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    if (popupRef.current) resizeObserver?.observe(popupRef.current);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(resizeFrame);
      cancelAnimationFrame(settledLayoutFrame);
      window.removeEventListener('resize', measureAfterResponsiveLayout);
      window.removeEventListener('scroll', measurePopup, true);
      window.visualViewport?.removeEventListener('resize', measureAfterResponsiveLayout);
      window.visualViewport?.removeEventListener('scroll', measurePopup);
      resizeObserver?.disconnect();
    };
  }, [isOpen, measurePopup]);

  useEffect(() => {
    if (!isOpen) return;
    if (!enabledIndices.includes(highlightedIndex)) {
      setHighlightedIndex(enabledIndices[0] ?? -1);
    }
  }, [enabledIndices, highlightedIndex, isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        !containerRef.current?.contains(event.target as Node) &&
        !popupRef.current?.contains(event.target as Node)
      ) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleClose]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleOpen();
        if (e.key === 'ArrowUp') setHighlightedIndex(enabledIndices.at(-1) ?? -1);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const position = enabledIndices.indexOf(prev);
        return enabledIndices[position < 0 || position === enabledIndices.length - 1
          ? 0
          : position + 1] ?? -1;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const position = enabledIndices.indexOf(prev);
        return enabledIndices[position <= 0
          ? enabledIndices.length - 1
          : position - 1] ?? -1;
      });
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIndex(enabledIndices[0] ?? -1);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIndex(enabledIndices.at(-1) ?? -1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < flatVisibleMods.length) {
        const targetMod = flatVisibleMods[highlightedIndex];
        if (targetMod && !disabledModIdSet.has(targetMod.modId)) {
          handleSelectMod(targetMod.modId);
        }
      } else if (enabledIndices.length === 1) {
        const targetMod = flatVisibleMods[enabledIndices[0]];
        if (targetMod) {
          handleSelectMod(targetMod.modId);
        }
      }
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.querySelector<HTMLElement>(
        `[data-index="${highlightedIndex}"]`
      );
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  let globalIndexCounter = 0;

  return (<>
    <div
      className={`searchable-modifier-select ${isOpen ? 'open' : ''} ${popupGeometry?.opensUpward ? 'open-upward' : ''} ${className}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {/* Dropdown Trigger & Inline Search Bar */}
      <div
        ref={triggerRef}
        role={isOpen ? undefined : 'combobox'}
        tabIndex={isOpen ? -1 : 0}
        className={`searchable-select-trigger ${isOpen ? 'open' : ''} ${
          selectedMod && !isOpen ? 'has-selection' : 'placeholder'
        } ${selectedMod?.isNotable && !isOpen ? 'is-notable' : ''}`}
        onClick={() => {
          if (!isOpen) handleOpen();
        }}
        aria-haspopup={isOpen ? undefined : 'listbox'}
        aria-expanded={isOpen ? undefined : false}
        aria-controls={listboxId}
        aria-label={isOpen ? undefined : ariaLabel}
      >
        {isOpen ? (
          <div className="active-search-box" onClick={(e) => e.stopPropagation()}>
            <span className="search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              role="combobox"
              aria-label={`${ariaLabel} search`}
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeDescendantId}
              className="dropdown-search-input"
              value={query}
              placeholder="Search modifiers (name, stat, tier, ilvl)..."
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(-1);
              }}
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuery('');
                  setHighlightedIndex(-1);
                  searchInputRef.current?.focus();
                }}
                onKeyDown={(e) => e.stopPropagation()}
                aria-label="Clear modifier search"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <span className="trigger-content">
            {selectedMod ? (
              <span className="selected-mod-preview">
                <span className={`mod-display-name ${selectedMod.isNotable ? 'notable-name' : ''}`}>
                  {selectedMod.selectionLabel}
                </span>
                <span className="mod-badges">
                  {selectedMod.tierCount > 1 && (
                    <span className="badge tier-badge">T{selectedMod.tier}</span>
                  )}
                  <span className="badge type-badge">{selectedMod.genType}</span>
                  <span className="badge ilvl-badge">ilvl {selectedMod.requiredItemLevel}</span>
                </span>
              </span>
            ) : (
              <span className="trigger-placeholder">{placeholder}</span>
            )}
          </span>
        )}

        <span className="trigger-actions">
          {!isOpen && selectedMod && (
            <button
              type="button"
              className="clear-selection-btn"
              onClick={handleClearSelection}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={`Clear ${selectedMod.displayName}`}
            >
              ✕
            </button>
          )}
          <button
            type="button"
            className={`trigger-chevron ${isOpen ? 'rotated' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isOpen) {
                handleClose(true);
              } else {
                handleOpen();
              }
            }}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label={isOpen ? 'Close modifier list' : 'Open modifier list'}
          >
            ▾
          </button>
        </span>
      </div>

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isOpen
          ? `${totalMatchingCount} ${totalMatchingCount === 1 ? 'modifier' : 'modifiers'} available${query ? ' for this search' : ''}.`
          : ''}
      </span>

      {/* Portaled dropdown popup */}
      {isOpen && popupGeometry && createPortal((
        <div
          ref={popupRef}
          id={listboxId}
          className={`searchable-dropdown-popup ${popupGeometry.opensUpward ? 'open-upward' : 'open-downward'}`}
          role="listbox"
          aria-label={ariaLabel}
          data-searchable-modifier-portal="body"
          data-popup-placement={popupGeometry.opensUpward ? 'upward' : 'downward'}
          style={{
            left: popupGeometry.left,
            top: popupGeometry.top,
            width: popupGeometry.width,
            maxHeight: popupGeometry.maxHeight,
          }}
        >
          <div className="search-stats-bar">
            <span className="match-count">
              {totalMatchingCount} {totalMatchingCount === 1 ? 'modifier' : 'modifiers'}
            </span>
            {query && <span className="filtering-tag">filtered</span>}
          </div>

          {/* Categorized Options List */}
          <div className="dropdown-options-list" ref={listRef}>
            {categories.length === 0 ? (
              <div className="no-options-message">
                <p>No modifiers match "{query}"</p>
                <span className="no-options-tip">Try searching by stat text, notable name, or tier</span>
              </div>
            ) : (
              categories.map((category) => (
                <div className="category-group" key={category.id}>
                  <div className="category-header">
                    <span className="category-title">{category.label}</span>
                    <span className="category-count">{category.mods.length}</span>
                  </div>

                  <div className="category-items">
                    {category.mods.map((mod) => {
                      const itemIndex = globalIndexCounter++;
                      const isSelected = mod.modId === value;
                      const isDisabled = disabledModIdSet.has(mod.modId);
                      const isHighlighted = itemIndex === highlightedIndex;

                      return (
                        <div
                          key={mod.modId}
                          id={`${listboxId}-option-${itemIndex}`}
                          data-index={itemIndex}
                          data-mod-id={mod.modId}
                          className={`dropdown-option-item ${isSelected ? 'selected' : ''} ${
                            isDisabled ? 'disabled' : ''
                          } ${isHighlighted ? 'highlighted' : ''} ${
                            mod.isNotable ? 'is-notable' : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDisabled) {
                              handleSelectMod(mod.modId);
                            }
                          }}
                          onMouseEnter={() => {
                            if (!isDisabled) setHighlightedIndex(itemIndex);
                          }}
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={isDisabled}
                        >
                          <div className="option-primary">
                            <span className="option-name">
                              {mod.selectionLabel}
                            </span>
                            {isSelected && <span className="selected-indicator">✓</span>}
                          </div>

                          <div className="option-meta">
                            <div className="meta-badges">
                              <span className="type-tag">{mod.genType}</span>
                              {mod.tierCount > 1 && (
                                <span className="tier-tag">T{mod.tier}</span>
                              )}
                              <span className="ilvl-tag">ilvl {mod.requiredItemLevel}</span>
                              {isDisabled && !isSelected && (
                                <span className="already-selected-tag">Already added</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  </>);
}
