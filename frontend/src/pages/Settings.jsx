import { useEffect, useRef, useState } from 'react';
import { useProfileAvatar } from '../context/ProfileAvatarContext';
import AppShell from '../components/layout/AppShell';
import './ShellPages.css';
import '../styles/Settings.css';

export default function Settings() {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const avatarInputRef = useRef(null);
  const { avatarPreviewUrl, setAvatarFromFile } = useProfileAvatar();

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (file) setAvatarFromFile(file);
  }

  useEffect(() => {
    if (!deleteModalOpen) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') setDeleteModalOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteModalOpen]);

  return (
    <AppShell title="Settings" notificationCount={0}>
      <div className="dashboard-content settings-page">
        <p className="settings-lead">
          Manage your account details. Saving and account actions are not wired up yet — this is a
          UI baseline only.
        </p>

        <section className="settings-card" aria-labelledby="settings-update-name-heading">
          <h2 id="settings-update-name-heading" className="settings-section-title">
            Update name
          </h2>
          <p className="settings-section-desc">
            This name appears in the app header and on your profile.
          </p>
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <div className="settings-field-row">
              <div className="settings-field">
                <label htmlFor="settings-first-name">First name</label>
                <input
                  id="settings-first-name"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  placeholder="First name"
                  defaultValue=""
                />
              </div>
              <div className="settings-field">
                <label htmlFor="settings-last-name">Last name</label>
                <input
                  id="settings-last-name"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  placeholder="Last name"
                  defaultValue=""
                />
              </div>
            </div>
            <div className="settings-form-actions">
              <button type="button" className="settings-btn settings-btn--secondary">
                Cancel
              </button>
              <button type="submit" className="settings-btn settings-btn--primary">
                Save
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card" aria-labelledby="settings-password-heading">
          <h2 id="settings-password-heading" className="settings-section-title">
            Password
          </h2>
          <p className="settings-section-desc">Update your password to keep your account secure.</p>
          <form
            className="settings-form"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <div className="settings-field">
              <label htmlFor="settings-current-password">Current password</label>
              <input
                id="settings-current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
              />
            </div>
            <div className="settings-field">
              <label htmlFor="settings-new-password">New password</label>
              <input
                id="settings-new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
              />
            </div>
            <div className="settings-field">
              <label htmlFor="settings-confirm-password">Confirm new password</label>
              <input
                id="settings-confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
              />
            </div>
            <div className="settings-form-actions">
              <button type="button" className="settings-btn settings-btn--secondary">
                Cancel
              </button>
              <button type="submit" className="settings-btn settings-btn--primary">
                Update password
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card" aria-labelledby="settings-avatar-heading">
          <h2 id="settings-avatar-heading" className="settings-section-title">
            Profile picture
          </h2>
          <p className="settings-section-desc">
            Upload a photo. Recommended square image, at least 256×256px.
          </p>
          <div className="settings-avatar-row">
            <div
              className="settings-avatar-preview"
              aria-label={avatarPreviewUrl ? 'Profile preview' : 'No profile image selected'}
            >
              {avatarPreviewUrl ? (
                <img src={avatarPreviewUrl} alt="" className="settings-avatar-preview-img" />
              ) : (
                <span className="settings-avatar-placeholder">?</span>
              )}
            </div>
            <div className="settings-avatar-actions">
              <input
                ref={avatarInputRef}
                id="settings-avatar-file"
                name="avatar"
                type="file"
                accept="image/*"
                className="settings-file-input"
                onChange={handleAvatarChange}
              />
              <label
                htmlFor="settings-avatar-file"
                className="settings-btn settings-btn--secondary"
              >
                Choose image
              </label>
              <button
                type="button"
                className="settings-btn settings-btn--primary"
                onClick={() => avatarInputRef.current?.click()}
              >
                Upload
              </button>
            </div>
          </div>
        </section>

        <section
          className="settings-card settings-card--danger"
          aria-labelledby="settings-delete-heading"
        >
          <h2 id="settings-delete-heading" className="settings-section-title">
            Delete account
          </h2>
          <p className="settings-section-desc">
            Permanently delete your account and associated data. This cannot be undone.
          </p>
          <button
            type="button"
            className="settings-btn settings-btn--destructive"
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete account
          </button>
        </section>
      </div>

      {deleteModalOpen && (
        <div
          className="settings-modal-backdrop"
          role="presentation"
          onClick={() => setDeleteModalOpen(false)}
        >
          <div
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="settings-modal-close"
              aria-label="Close dialog"
              onClick={() => setDeleteModalOpen(false)}
            >
              ×
            </button>
            <h2 id="delete-account-dialog-title" className="settings-modal-title">
              Delete your account?
            </h2>
            <p className="settings-modal-body">
              Your jobs and documents will be removed. This action is permanent. (Baseline UI only —
              no deletion is performed.)
            </p>
            <div className="settings-modal-actions">
              <button
                type="button"
                className="settings-btn settings-btn--ghost"
                onClick={() => setDeleteModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="settings-btn settings-btn--destructive"
                onClick={() => setDeleteModalOpen(false)}
              >
                Delete account
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
