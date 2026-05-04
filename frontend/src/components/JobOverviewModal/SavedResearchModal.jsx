import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useJobResearch } from '../../hooks/useJobResearch';
import AIResearchModal from '../AIResearchModal/AIResearchModal';
import './SavedResearchModal.css';

export default function SavedResearchModal({ job, accessToken, onClose, onResearchUpdated }) {
  const { saveResearch, saving, error, clearError } = useJobResearch(accessToken);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(job.research || '');
  const [showNewResearch, setShowNewResearch] = useState(false);
  const overlayRef = useRef(null);

  const hasResearch = Boolean(job.research?.trim());

  // Sync editedContent when job changes (e.g., after saving edits)
  useEffect(() => {
    setEditedContent(job.research || '');
  }, [job.research]);

  useEffect(() => {
    if (showNewResearch) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, showNewResearch]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current && !showNewResearch) onClose();
    },
    [onClose, showNewResearch]
  );

  const handleSaveEdit = async () => {
    clearError();
    const result = await saveResearch(job.id, editedContent);
    if (result) {
      setIsEditing(false);
      onResearchUpdated?.(result);
    }
  };

  const handleNewResearchSaved = (updatedJob) => {
    setShowNewResearch(false);
    onResearchUpdated?.(updatedJob);
  };

  if (showNewResearch) {
    return (
      <AIResearchModal
        job={job}
        accessToken={accessToken}
        onClose={() => setShowNewResearch(false)}
        onResearchSaved={handleNewResearchSaved}
      />
    );
  }

  return (
    <div className="ai-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div
        className="ai-modal srm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="srm-title"
      >
        <div className="ai-header">
          <div>
            <h2 className="ai-title" id="srm-title">
              Company Research
            </h2>
            <p className="ai-subtitle">
              {job.company} — {job.title}
            </p>
          </div>
          <button
            type="button"
            className="jf-close"
            onClick={onClose}
            aria-label="Close saved research modal"
          >
            ✕
          </button>
        </div>

        <div className="ai-body">
          {error && (
            <p className="ai-error" role="alert">
              {error}
            </p>
          )}

          {!hasResearch && !isEditing ? (
            <div className="srm-empty">
              <div className="srm-empty-icon">📚</div>
              <p className="srm-empty-text">No research saved for this job yet.</p>
              <button
                type="button"
                className="ai-btn ai-btn--save"
                onClick={() => setShowNewResearch(true)}
              >
                Generate Research
              </button>
            </div>
          ) : isEditing ? (
            <div className="srm-edit-section">
              <label className="srm-edit-label" htmlFor="srm-edit-textarea">
                Edit Research (Markdown supported)
              </label>
              <textarea
                id="srm-edit-textarea"
                className="ai-rewrite-input srm-edit-textarea"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={15}
                disabled={saving}
              />
            </div>
          ) : (
            <div className="air-content srm-content">
              <ReactMarkdown>{job.research}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="ai-footer">
          {isEditing ? (
            <>
              <button
                type="button"
                className="ai-btn ai-btn--ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditedContent(job.research || '');
                  clearError();
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ai-btn ai-btn--save"
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : hasResearch ? (
            <>
              <button type="button" className="ai-btn ai-btn--ghost" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="ai-btn ai-btn--secondary"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
              <button
                type="button"
                className="ai-btn ai-btn--save"
                onClick={() => setShowNewResearch(true)}
              >
                Generate New
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
