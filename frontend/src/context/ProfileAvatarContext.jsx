import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

const ProfileAvatarContext = createContext(null);

export function ProfileAvatarProvider({ children }) {
  const { session } = useAuth();
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState(null);

  useEffect(() => {
    if (!session) {
      setAvatarPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [session]);

  const setAvatarFromFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setAvatarPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const value = useMemo(
    () => ({ avatarPreviewUrl, setAvatarFromFile }),
    [avatarPreviewUrl, setAvatarFromFile]
  );

  return <ProfileAvatarContext.Provider value={value}>{children}</ProfileAvatarContext.Provider>;
}

export function useProfileAvatar() {
  const ctx = useContext(ProfileAvatarContext);
  if (!ctx) {
    throw new Error('useProfileAvatar must be used within ProfileAvatarProvider');
  }
  return ctx;
}
