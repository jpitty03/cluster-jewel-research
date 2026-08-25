import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

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

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setHighlightedIndex(-1);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(-1);
  }, []);

  const handleSelectMod = useCallback(
    (modId: string) => {
      onChange(modId);
      handleClose();
    },
    [onChange, handleClose]
  );

  const handleClearSelection = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setQuery('');
    },
    [onChange]
  );

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      // Small tick to ensure element is rendered
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
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
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev + 1;
        return next >= flatVisibleMods.length ? 0 : next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? flatVisibleMods.length - 1 : next;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < flatVisibleMods.length) {
        const targetMod = flatVisibleMods[highlightedIndex];
        if (targetMod && !disabledModIds.includes(targetMod.modId)) {
          handleSelectMod(targetMod.modId);
        }
      } else if (flatVisibleMods.length === 1) {
        const targetMod = flatVisibleMods[0];
        if (targetMod && !disabledModIds.includes(targetMod.modId)) {
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

  return (
    <div
      className={`searchable-modifier-select ${isOpen ? 'open' : ''} ${className}`}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {/* Dropdown Trigger & Inline Search Bar */}
      <div
        role="combobox"
        tabIndex={isOpen ? -1 : 0}
        className={`searchable-select-trigger ${isOpen ? 'open' : ''} ${
          selectedMod && !isOpen ? 'has-selection' : 'placeholder'
        } ${selectedMod?.isNotable && !isOpen ? 'is-notable' : ''}`}
        onClick={() => {
          if (!isOpen) handleOpen();
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
      >
        {isOpen ? (
          <div className="active-search-box" onClick={(e) => e.stopPropagation()}>
            <span className="search-icon">🔍</span>
            <input
              ref={searchInputRef}
              type="text"
              className="dropdown-search-input"
              value={query}
              placeholder="Search modifiers (name, stat, tier, ilvl)..."
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(0);
              }}
            />
            {query && (
              <span
                role="button"
                tabIndex={-1}
                className="search-clear-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
                title="Clear search"
              >
                ✕
              </span>
            )}
          </div>
        ) : (
          <span className="trigger-content">
            {selectedMod ? (
              <span className="selected-mod-preview">
                <span className={`mod-display-name ${selectedMod.isNotable ? 'notable-name' : ''}`}>
                  {selectedMod.displayName}
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
            <span
              className="clear-selection-btn"
              onClick={handleClearSelection}
              title="Clear modifier"
              role="button"
              tabIndex={-1}
            >
              ✕
            </span>
          )}
          <span
            className={`trigger-chevron ${isOpen ? 'rotated' : ''}`}
            onClick={(e) => {
              if (isOpen) {
                e.stopPropagation();
                handleClose();
              }
            }}
          >
            ▾
          </span>
        </span>
      </div>

      {/* Connected Dropdown Popup */}
      {isOpen && (
        <div className="searchable-dropdown-popup" role="listbox" aria-label={ariaLabel}>
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
                      const isDisabled = disabledModIds.includes(mod.modId);
                      const isHighlighted = itemIndex === highlightedIndex;

                      return (
                        <div
                          key={mod.modId}
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
                          onMouseEnter={() => setHighlightedIndex(itemIndex)}
                          role="option"
                          aria-selected={isSelected}
                          aria-disabled={isDisabled}
                        >
                          <div className="option-primary">
                            <span className="option-name">
                              {mod.displayName}
                            </span>
                            {isSelected && <span className="selected-indicator">✓</span>}
                          </div>

                          <div className="option-meta">
                            {mod.technicalName && mod.technicalName !== mod.displayName && (
                              <span className="technical-name">{mod.technicalName}</span>
                            )}
                            <div className="meta-badges">
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
      )}
    </div>
  );
}
