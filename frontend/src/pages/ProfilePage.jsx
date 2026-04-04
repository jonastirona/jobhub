import { useState } from 'react';
import AppShell from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../hooks/useProfile';
import './ProfilePage.css';

export default function ProfilePage() {
  const { session, user } = useAuth();
  const accessToken = session?.access_token;
  const { profile, loading, error, saving, saveError, saveProfile } = useProfile(accessToken);

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    headline: profile?.headline || '',
    location: profile?.location || '',
    phone: profile?.phone || '',
    website: profile?.website || '',
    linkedin_url: profile?.linkedin_url || '',
    github_url: profile?.github_url || '',
    summary: profile?.summary || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveProfile(formData);
  };

  if (loading) {
    return (
      <AppShell title="My Profile">
        <div className="profile-content">
          <p className="profile-state">Loading profile...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="My Profile">
      <div className="profile-content">
        {error && <div className="profile-state profile-state--error">{error}</div>}
        {saveError && <div className="profile-state profile-state--error">{saveError}</div>}

        <form className="profile-form" onSubmit={handleSubmit}>
          {/* Identity Section */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2 className="profile-card-title">Identity</h2>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="full_name" style={{ display: 'block', marginBottom: '4px' }}>
                  Full Name
                </label>
                <input
                  id="full_name"
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="headline" style={{ display: 'block', marginBottom: '4px' }}>
                  Headline
                </label>
                <input
                  id="headline"
                  type="text"
                  name="headline"
                  value={formData.headline}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="location" style={{ display: 'block', marginBottom: '4px' }}>
                  Location
                </label>
                <input
                  id="location"
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '0' }}>
                <label htmlFor="phone" style={{ display: 'block', marginBottom: '4px' }}>
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Professional Summary Section */}
          <div className="profile-card">
            <div className="profile-card-header">
              <h2 className="profile-card-title">Professional Summary</h2>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="website" style={{ display: 'block', marginBottom: '4px' }}>
                  Website
                </label>
                <input
                  id="website"
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="linkedin_url" style={{ display: 'block', marginBottom: '4px' }}>
                  LinkedIn URL
                </label>
                <input
                  id="linkedin_url"
                  type="url"
                  name="linkedin_url"
                  value={formData.linkedin_url}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="github_url" style={{ display: 'block', marginBottom: '4px' }}>
                  GitHub URL
                </label>
                <input
                  id="github_url"
                  type="url"
                  name="github_url"
                  value={formData.github_url}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>
              <div style={{ marginBottom: '0' }}>
                <label htmlFor="summary" style={{ display: 'block', marginBottom: '4px' }}>
                  Summary
                </label>
                <textarea
                  id="summary"
                  name="summary"
                  value={formData.summary}
                  onChange={handleChange}
                  rows="6"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '10px 20px',
              background: 'var(--orange-500)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
