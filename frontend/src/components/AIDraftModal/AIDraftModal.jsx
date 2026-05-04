import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useDocuments } from '../../hooks/useDocuments';
import { useAIDraft } from '../../hooks/useAIDraft';
import { contentToPdfBlob } from '../../utils/pdfGenerator';
import './AIDraftModal.css';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AIDraftModal({ type, job, accessToken, onClose, onSaved }) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const hasGeneratedRef = useRef(false);

  const {
    generate,
    rewrite,
    generating,
    rewriting,
    error: aiError,
    clearError,
  } = useAIDraft(accessToken);
  const { createDocument, saving, saveError, clearSaveError } = useDocuments(accessToken, false);

  const [content, setContent] = useState('');
  const [previousContent, setPreviousContent] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [showComparison, setShowComparison] = useState(false);
  const [saved, setSaved] = useState(false);

  const typeLabel = type === 'resume' ? 'Resume' : 'Cover Letter';
  const docType = type === 'resume' ? 'Resume' : 'Cover Letter';

  useEffect(() => {
    if (hasGeneratedRef.current) return;
    hasGeneratedRef.current = true;
    generate(type, job.id).then((result) => {
      if (result) setContent(result);
    });
  }, [generate, type, job.id]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
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

  const handleModalKeyDown = useCallback((e) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusable = Array.from(modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const handleRewrite = async () => {
    if (!instructions.trim() || !content) return;
    clearError();
    clearSaveError();
    const result = await rewrite(content, instructions.trim());
    if (result) {
      setPreviousContent(content);
      setContent(result);
      setShowComparison(true);
      setInstructions('');
    }
  };

  const handleKeepOriginal = () => {
    setContent(previousContent);
    setPreviousContent(null);
    setShowComparison(false);
  };

  const handleKeepRewrite = () => {
    setPreviousContent(null);
    setShowComparison(false);
  };

  const handleSave = async () => {
    clearSaveError();
    clearError();
    const pdfBlob = contentToPdfBlob(content, { singlePage: type === 'resume' });
    const filename = `${typeLabel} - ${job.company} - ${job.title}.pdf`;
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    const result = await createDocument({
      name: `${typeLabel} – ${job.title} at ${job.company}`,
      doc_type: docType,
      job_id: job.id,
      content,
      file,
    });
    if (result) {
      setSaved(true);
      if (onSaved) onSaved(result);
    }
  };

  const displayError = aiError || saveError;
  const isLoading = generating;
  const hasContent = !isLoading && content;

  return (
    <div className="ai-overlay" ref={overlayRef} onClick={handleOverlayClick} role="presentation">
      <div
        className="ai-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-draft-title"
        onKeyDown={handleModalKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ai-header">
          <div>
            <h2 className="ai-title" id="ai-draft-title">
              AI {typeLabel} Draft
            </h2>
            <p className="ai-subtitle">
              {job.title} at {job.company}
            </p>
          </div>
          <button
            type="button"
            className="jf-close"
            onClick={onClose}
            aria-label="Close AI draft modal"
          >
            ✕
          </button>
        </div>

        <div className="ai-body">
          {isLoading && (
            <div className="ai-generating">
              <span className="ai-spinner" aria-hidden="true" />
              Generating your {typeLabel.toLowerCase()} draft…
            </div>
          )}

          {displayError && (
            <p className="ai-error" role="alert">
              {displayError}
            </p>
          )}

          {hasContent && (
            <>
              {showComparison ? (
                <div className="ai-comparison">
                  <div className="ai-comparison-col">
                    <div className="ai-comparison-label">Previous version</div>
                    <div className="ai-content ai-content--muted">
                      <ReactMarkdown>{previousContent}</ReactMarkdown>
                    </div>
                  </div>
                  <div className="ai-comparison-col">
                    <div className="ai-comparison-label">Rewritten version</div>
                    <div className="ai-content">
                      <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ai-content">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              )}

              {showComparison && (
                <div className="ai-comparison-actions">
                  <button
                    type="button"
                    className="ai-btn ai-btn--ghost"
                    onClick={handleKeepOriginal}
                  >
                    ← Keep previous
                  </button>
                  <button
                    type="button"
                    className="ai-btn ai-btn--primary"
                    onClick={handleKeepRewrite}
                  >
                    Keep rewrite ✓
                  </button>
                </div>
              )}

              {!showComparison && (
                <div className="ai-rewrite-section">
                  <label className="ai-rewrite-label" htmlFor="ai-instructions">
                    Improve or rewrite
                  </label>
                  <textarea
                    id="ai-instructions"
                    className="ai-rewrite-input"
                    placeholder="e.g. Make it more concise, emphasize leadership experience, add a stronger opening…"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={3}
                    disabled={rewriting}
                  />
                  <button
                    type="button"
                    className="ai-btn ai-btn--secondary"
                    onClick={handleRewrite}
                    disabled={rewriting || !instructions.trim()}
                  >
                    {rewriting ? 'Rewriting…' : 'Rewrite'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="ai-footer">
          {hasContent &&
            !showComparison &&
            (saved ? (
              <span className="ai-saved-msg">Saved to document library!</span>
            ) : (
              <button
                type="button"
                className="ai-btn ai-btn--save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save as PDF'}
              </button>
            ))}
          <button type="button" className="ai-btn ai-btn--ghost" onClick={onClose}>
            {saved ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
