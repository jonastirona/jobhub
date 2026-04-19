import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_META = {
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 1,
  availableStatuses: [],
  availableLocations: [],
  statusCounts: { interviewing: 0, offered: 0 },
};
const EMPTY_ARRAY = [];

// Keep currently-selected filter values visible in the facet list even when
// the server-side facet no longer includes them (e.g. the user selected
// 'rejected' and just deleted the last rejected job). This is pure UI
// continuity — all value canonicalization (trim/lowercase/alias/title-case/
// dedupe) happens on the backend in main.py, so the frontend can treat
// server facet values as already-normalized.
function unionPreservingServerOrder(serverValues = [], selectedValues = []) {
  return Array.from(new Set([...(serverValues || []), ...(selectedValues || [])]));
}

export function useJobs(accessToken, searchTerm = '', options = {}) {
  const statuses = options.statuses ?? EMPTY_ARRAY;
  const locations = options.locations ?? EMPTY_ARRAY;
  const deadlineStates = options.deadlineStates ?? EMPTY_ARRAY;
  const sortBy = options.sortBy ?? 'created_at';
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 10;
  const [jobs, setJobs] = useState([]);
  const [meta, setMeta] = useState(DEFAULT_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const pendingRef = useRef(null);
  const authContextRef = useRef(null);
  const hasLoadedForAuthContextRef = useRef(false);

  const fetchJobs = useCallback(async () => {
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '') || null;

    if (!accessToken || !backendBase) {
      pendingRef.current?.abort();
      pendingRef.current = null;
      authContextRef.current = null;
      hasLoadedForAuthContextRef.current = false;
      setJobs([]);
      setError(null);
      setLoading(false);
      return;
    }

    const authContext = `${backendBase}::${accessToken}`;
    const isNewAuthContext = authContextRef.current !== authContext;
    if (isNewAuthContext) {
      authContextRef.current = authContext;
      hasLoadedForAuthContextRef.current = false;
    }

    pendingRef.current?.abort();
    const controller = new AbortController();
    pendingRef.current = controller;
    const { signal } = controller;

    setLoading(!hasLoadedForAuthContextRef.current);
    setError(null);

    try {
      const query = searchTerm.trim();
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      params.set('sort_by', sortBy);
      statuses.forEach((status) => params.append('statuses', status));
      locations.forEach((location) => params.append('locations', location));
      deadlineStates.forEach((deadlineState) => params.append('deadline_states', deadlineState));
      const queryString = params.toString();
      const url = `${backendBase}/jobs${queryString ? `?${queryString}` : ''}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!res.ok) {
        throw new Error(`Failed to load jobs (${res.status})`);
      }
      const data = await res.json();
      if (signal.aborted) return;
      const items = Array.isArray(data) ? data : data.items || [];
      setJobs(items);
      setMeta((prev) => ({
        total: Array.isArray(data) ? items.length : (data.total ?? items.length),
        page: Array.isArray(data) ? 1 : (data.page ?? page),
        pageSize: Array.isArray(data) ? items.length || pageSize : (data.page_size ?? pageSize),
        totalPages: Array.isArray(data) ? 1 : (data.total_pages ?? 1),
        availableStatuses: Array.isArray(data)
          ? prev.availableStatuses
          : unionPreservingServerOrder(data.available_statuses || [], statuses),
        availableLocations: Array.isArray(data)
          ? prev.availableLocations
          : data.available_locations || [],
        statusCounts: Array.isArray(data)
          ? DEFAULT_META.statusCounts
          : data.status_counts || DEFAULT_META.statusCounts,
      }));
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!signal.aborted) {
        hasLoadedForAuthContextRef.current = true;
        setLoading(false);
      }
    }
  }, [accessToken, deadlineStates, locations, page, pageSize, searchTerm, sortBy, statuses]);

  useEffect(() => {
    fetchJobs();
    return () => pendingRef.current?.abort();
  }, [fetchJobs]);

  return { jobs, meta, loading, error, refetch: fetchJobs };
}
