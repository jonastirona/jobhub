import { useId } from 'react';
import './TagSelector.css';

/**
 * TagSelector component for selecting and managing document tags.
 * Allows users to select multiple tags from a predefined list.
 */
export default function TagSelector({
  selectedTags = [],
  availableTags = [],
  onTagsChange,
  disabled = false,
  label = 'Tags',
}) {
  const labelId = useId();

  const handleToggleTag = (tag) => {
    if (disabled) return;

    const updatedTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];

    onTagsChange(updatedTags);
  };

  const handleClearAll = () => {
    if (disabled) return;
    onTagsChange([]);
  };

  return (
    <div className="tag-selector">
      {label && (
        <div id={labelId} className="tag-selector-label">
          {label}
        </div>
      )}

      <div
        className="tag-selector-buttons"
        role="group"
        aria-labelledby={label ? labelId : undefined}
      >
        {availableTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`tag-selector-btn ${
              selectedTags.includes(tag) ? 'tag-selector-btn--selected' : ''
            }`}
            onClick={() => handleToggleTag(tag)}
            disabled={disabled}
            aria-pressed={selectedTags.includes(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      {selectedTags.length > 0 && (
        <div className="tag-selector-selected">
          <div className="tag-selector-selected-list">
            {selectedTags.map((tag) => (
              <span key={tag} className="tag-selector-selected-item">
                {tag}
                <button
                  type="button"
                  className="tag-selector-remove-btn"
                  onClick={() => handleToggleTag(tag)}
                  disabled={disabled}
                  aria-label={`Remove ${tag} tag`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {!disabled && (
            <button type="button" className="tag-selector-clear-btn" onClick={handleClearAll}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
