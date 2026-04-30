import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAIResearch } from '../../hooks/useAIResearch';
import { useJobResearch } from '../../hooks/useJobResearch';
import './AIResearchModal.css';

export default function AIResearchModal({ job, accessToken, onClose, onResearchSaved }) {
  const { research, researching, error, clearError } = useAIResearch(accessToken);
  const {
    saveResearch,
    saving: savingResearch,
    error: saveError,
    clearError: clearSaveError,
  } = useJobResearch(accessToken);
  const [context, setContext] = useState('');
  const [content, setContent] = useState(null);
  const [saved, setSaved] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose]
  );

  const handleResearch = async () => {
    if (!context.trim()) return;
    clearError();
    const result = await research(job.id, context.trim());
    if (result) setContent(result);
  };

  const handleResearchAgain = () => {
    setContent(null);
    setContext('');
    setSaved(false);
    clearError();
    clearSaveError();
  };

  const handleSave = async () => {
    if (!content) return;
    clearSaveError();
    const result = await saveResearch(job.id, content);
    if (result) {
      setSaved(true);
      onResearchSaved?.(result);
    }
  };

  const isInputStep = content === null;

  return (
    <div className="ai-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="air-title">
        <div className="ai-header">
          <div>
            <h2 className="ai-title" id="air-title">
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
            aria-label="Close company research modal"
          >
            ✕
          </button>
        </div>

        <div className="ai-body">
          {(error || saveError) && (
            <p className="ai-error" role="alert">
              {error || saveError}
            </p>
          )}

          {isInputStep ? (
            <div className="air-input-section">
              <label className="air-input-label" htmlFor="air-context">
                What would you like to know about {job.company}?
              </label>
              <textarea
                id="air-context"
                className="ai-rewrite-input air-context-textarea"
                placeholder={`e.g. What is the company culture like? What tech stack do they use? What are common interview questions for the ${job.title} role?`}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={5}
                disabled={researching}
              />
              {researching && (
                <div className="ai-generating">
                  <div className="ai-spinner" />
                  Researching {job.company}…
                </div>
              )}
            </div>
          ) : (
            <div className="air-content">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="ai-footer">
          {isInputStep ? (
            <>
              <button type="button" className="ai-btn ai-btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="ai-btn ai-btn--save"
                onClick={handleResearch}
                disabled={researching || !context.trim()}
              >
                {researching ? 'Researching…' : 'Research'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ai-btn ai-btn--ghost" onClick={handleResearchAgain}>
                Research Again
              </button>
              <button
                type="button"
                className="ai-btn ai-btn--save"
                onClick={handleSave}
                disabled={savingResearch || saved}
              >
                {saved ? 'Saved!' : savingResearch ? 'Saving…' : 'Save to Job'}
              </button>
              <button type="button" className="ai-btn ai-btn--ghost" onClick={onClose}>
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
