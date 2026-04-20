import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useDocuments } from '../../hooks/useDocuments';
import { useAIDraft } from '../../hooks/useAIDraft';
import { contentToPdfBlob } from '../../utils/pdfGenerator';
import '../AIDraftModal/AIDraftModal.css';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function AIRewriteModal({ doc, accessToken, onClose, onSaved }) {
  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  const { rewrite, rewriting, error: aiError, clearError } = useAIDraft(accessToken);
  const { createDocument, saving, saveError, clearSaveError } = useDocuments(accessToken, false);

  const [content, setContent] = useState(doc.content || '');
  const [previousContent, setPreviousContent] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [showComparison, setShowComparison] = useState(false);
  const [saved, setSaved] = useState(false);

  const originalContent = doc.content || '';

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      if (window.document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (window.document.activeElement === last) {
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
    const pdfBlob = contentToPdfBlob(content);
    const baseName = doc.name.replace(/^Rewrite – /, '');
    const filename = `Rewrite – ${baseName}.pdf`;
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });
    const result = await createDocument({
      name: `Rewrite – ${baseName}`,
      doc_type: doc.doc_type || 'Draft',
      job_id: doc.job_id || undefined,
      content,
      file,
    });
    if (result) {
      setSaved(true);
      if (onSaved) onSaved(result);
    }
  };

  const linkedJob = doc.jobs ? `${doc.jobs.title} at ${doc.jobs.company}` : null;
  const displayError = aiError || saveError;

  return (
    <div
      className="ai-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        className="ai-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-rewrite-title"
        onKeyDown={handleModalKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ai-header">
          <div>
            <h2 className="ai-title" id="ai-rewrite-title">
              Rewrite with AI
            </h2>
            <p className="ai-subtitle">
              {doc.name}
              {linkedJob && <> &mdash; {linkedJob}</>}
            </p>
          </div>
          <button
            type="button"
            className="jf-close"
            onClick={onClose}
            aria-label="Close rewrite modal"
          >
            ✕
          </button>
        </div>

        <div className="ai-body">
          {displayError && (
            <p className="ai-error" role="alert">
              {displayError}
            </p>
          )}

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
              <label className="ai-rewrite-label" htmlFor="ai-rewrite-instructions">
                Rewrite instructions
              </label>
              <textarea
                id="ai-rewrite-instructions"
                className="ai-rewrite-input"
                placeholder="e.g. Make it more concise, add a stronger opening, emphasize leadership experience…"
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
        </div>

        <div className="ai-footer">
          {!showComparison && (
            saved ? (
              <span className="ai-saved-msg">Saved as new document!</span>
            ) : (
              <button
                type="button"
                className="ai-btn ai-btn--save"
                onClick={handleSave}
                disabled={saving || content === originalContent}
                title={content === originalContent ? 'Rewrite the document first' : undefined}
              >
                {saving ? 'Saving…' : 'Save as new PDF'}
              </button>
            )
          )}
          <button type="button" className="ai-btn ai-btn--ghost" onClick={onClose}>
            {saved ? 'Done' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
