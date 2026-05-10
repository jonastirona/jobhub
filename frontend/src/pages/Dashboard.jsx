import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Sentry from '@sentry/react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../hooks/useDocuments';
import { useJobs } from '../hooks/useJobs';
import AppShell from '../components/layout/AppShell';
import StatCard from '../components/common/StatCard';
import StatusBadge from '../components/common/StatusBadge';
import JobAnalyticsCard from '../components/JobAnalyticsCard/JobAnalyticsCard';
import JobForm from '../components/JobForm/JobForm';
import JobHistory from '../components/JobHistory/JobHistory';
import JobOverviewModal from '../components/JobOverviewModal/JobOverviewModal';
import SavedResearchModal from '../components/JobOverviewModal/SavedResearchModal';
import { jobMatchesSearchQuery } from '../utils/jobSearch';
import '../styles/Dashboard.css';

const COMPANY_GRADIENTS = {
  Stripe: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  Amazon: 'linear-gradient(135deg, #f97316, #c2410c)',
  Google: 'linear-gradient(135deg, #22c55e, #15803d)',
  Meta: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  Netflix: 'linear-gradient(135deg, #ec4899, #be185d)',
  Datadog: 'linear-gradient(135deg, #14b8a6, #0f766e)',
  Figma: 'linear-gradient(135deg, #f59e0b, #b45309)',
  Vercel: 'linear-gradient(135deg, #6366f1, #4338ca)',
};

function getCompanyGradient(companyName) {
  return (
    COMPANY_GRADIENTS[companyName] ??
    'linear-gradient(135deg, var(--orange-500), var(--orange-600))'
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = isDateOnly ? new Date(`${dateStr}T00:00:00`) : new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateTableNote(text, maxLen = 56) {
  if (!text?.trim()) return '—';
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

const STAT_BARS = {
  orange: [
    { height: 14, color: 'var(--orange-200)' },
    { height: 20, color: 'var(--orange-200)' },
    { height: 16, color: 'var(--orange-200)' },
    { height: 28, color: 'var(--orange-300)' },
    { height: 22, color: 'var(--orange-300)' },
    { height: 32, color: 'var(--orange-400)' },
    { height: 36, color: 'var(--orange-500)' },
  ],
  blue: [
    { height: 10, color: 'var(--blue-bg)' },
    { height: 18, color: 'var(--blue-bg)' },
    { height: 24, color: '#93c5fd' },
    { height: 14, color: '#93c5fd' },
    { height: 30, color: '#60a5fa' },
    { height: 20, color: '#60a5fa' },
    { height: 36, color: 'var(--blue)' },
  ],
  green: [
    { height: 8, color: 'var(--green-bg)' },
    { height: 12, color: 'var(--green-bg)' },
    { height: 8, color: '#86efac' },
    { height: 16, color: '#86efac' },
    { height: 10, color: '#4ade80' },
    { height: 24, color: '#22c55e' },
    { height: 36, color: 'var(--green)' },
  ],
};

const DEADLINE_STATE_OPTIONS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'due_today', label: 'Due Today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'no_deadline', label: 'No deadline set' },
];
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const SORT_OPTIONS = [
  { value: 'last_activity', label: 'Last Activity' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'created_at', label: 'Created Date' },
  { value: 'company', label: 'Company' },
];

function toggleFilterValue(currentValues, value) {
  return currentValues.includes(value)
    ? currentValues.filter((item) => item !== value)
    : [...currentValues, value];
}

function getDropdownLabel(label, selectedCount) {
  if (selectedCount === 0) return label;
  return `${label} (${selectedCount})`;
}

function getVisiblePageNumbers(currentPage, totalPages, maxButtons = 5) {
  if (totalPages <= maxButtons) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, currentPage - half);
  let end = start + maxButtons - 1;
  if (end > totalPages) {
    end = totalPages;
    start = end - maxButtons + 1;
  }
  return Array.from({ length: maxButtons }, (_, index) => start + index);
}

export default function Dashboard() {
  const { session } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [selectedDeadlineStates, setSelectedDeadlineStates] = useState([]);
  const [isStageOpen, setIsStageOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isDeadlineOpen, setIsDeadlineOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedSortBy, setSelectedSortBy] = useState('created_at');
  const [showArchivedJobs, setShowArchivedJobs] = useState(false);
  const [updatingArchiveJobId, setUpdatingArchiveJobId] = useState(null);
  const [jobsDataVersion, setJobsDataVersion] = useState(0);
  const bumpJobsDataVersion = useCallback(() => setJobsDataVersion((v) => v + 1), []);
  const { jobs, meta, loading, error, refetch } = useJobs(session?.access_token, searchTerm, {
    statuses: selectedStatuses,
    locations: selectedLocations,
    deadlineStates: selectedDeadlineStates,
    includeArchived: showArchivedJobs,
    sortBy: selectedSortBy,
    page: currentPage,
    pageSize,
  });
  const {
    documents,
    loading: documentsLoading,
    error: documentsError,
    refetch: refetchDocuments,
    viewDocument,
    createDocument,
    clearSaveError,
    saving: savingDraft,
    saveError: draftSaveError,
    linkDocument,
    linkingIds,
    linkError,
    clearLinkError,
  } = useDocuments(session?.access_token, false);
  const [formState, setFormState] = useState(null); // null | { mode: 'create' } | { mode: 'edit', job }
  const [historyJob, setHistoryJob] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingJobId, setDeletingJobId] = useState(null);
  const [jobPendingDelete, setJobPendingDelete] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  const [draftJob, setDraftJob] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState('Cover Letter');
  const [draftFile, setDraftFile] = useState(null);
  const [draftValidationError, setDraftValidationError] = useState('');
  const deleteOverlayRef = useRef(null);
  const deleteModalRef = useRef(null);
  const deleteCancelButtonRef = useRef(null);
  const draftModalRef = useRef(null);
  const draftCancelButtonRef = useRef(null);
  const filterControlsRef = useRef(null);
  const [viewJob, setViewJob] = useState(null);
  const viewedJobId = viewJob?.id;
  const [researchJob, setResearchJob] = useState(null);
  const [jobWithResearch, setJobWithResearch] = useState(null);
  // Memoized so client-side filtering is not recomputed when unrelated state changes (search still refilters when searchTerm or jobs change).
  const filteredJobs = useMemo(
    () => jobs.filter((job) => jobMatchesSearchQuery(job, searchTerm)),
    [jobs, searchTerm]
  );
  const totalApplications = meta.total;
  const interviews = meta.statusCounts?.interviewing ?? 0;
  const offers = meta.statusCounts?.offered ?? 0;
  const pageNumbers = useMemo(
    () => getVisiblePageNumbers(meta.page, meta.totalPages),
    [meta.page, meta.totalPages]
  );

  const statCards = useMemo(
    () => [
      {
        icon: '📁',
        label: 'Total Applications',
        value: String(totalApplications),
        trend: 'all time',
        trendDirection: 'up',
        accentClass: 'orange',
        bars: STAT_BARS.orange,
      },
      {
        icon: '💬',
        label: 'Interviews',
        value: String(interviews),
        trend: 'in progress',
        trendDirection: 'up',
        accentClass: 'blue',
        bars: STAT_BARS.blue,
      },
      {
        icon: '🎯',
        label: 'Offers',
        value: String(offers),
        trend: 'received',
        trendDirection: 'up',
        accentClass: 'green',
        bars: STAT_BARS.green,
      },
    ],
    [totalApplications, interviews, offers]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedStatuses,
    selectedLocations,
    selectedDeadlineStates,
    showArchivedJobs,
    pageSize,
    selectedSortBy,
  ]);

  // Clamp currentPage back into range after the visible dataset shrinks
  // (e.g. the last item on the last page is deleted). Without this, the user
  // would be stranded on an empty page with the Next button disabled.
  useEffect(() => {
    if (meta.totalPages > 0 && currentPage > meta.totalPages) {
      setCurrentPage(meta.totalPages);
    }
  }, [meta.totalPages, currentPage]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (filterControlsRef.current && !filterControlsRef.current.contains(event.target)) {
        setIsStageOpen(false);
        setIsLocationOpen(false);
        setIsDeadlineOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function openCreate() {
    setViewJob(null);
    setHistoryJob(null);
    setFormState({ mode: 'create' });
  }

  function openEdit(job) {
    setViewJob(null);
    setHistoryJob(null);
    setFormState({ mode: 'edit', job });
  }

  function openView(job) {
    setFormState(null);
    setHistoryJob(null);
    setViewJob(job);
  }

  useEffect(() => {
    if (!viewedJobId) return;
    refetchDocuments();
  }, [viewedJobId, refetchDocuments]);

  function openHistory(job) {
    setFormState(null);
    setViewJob(null);
    setHistoryJob(job);
  }

  function openResearch(job) {
    setResearchJob(job);
    setJobWithResearch(null);
  }

  function closeForm() {
    setFormState(null);
  }

  function closeView() {
    setViewJob(null);
  }

  function openDraft(job) {
    clearSaveError();
    setDraftJob(job);
    setDraftName('');
    setDraftType('Cover Letter');
    setDraftFile(null);
    setDraftValidationError('');
  }

  const closeDraft = useCallback(() => {
    if (savingDraft) return;
    clearSaveError();
    setDraftJob(null);
    setDraftFile(null);
    setDraftValidationError('');
  }, [clearSaveError, savingDraft]);

  async function saveDraftFromJob() {
    if (!draftJob || savingDraft) return;
    const trimmedName = draftName.trim();

    if (!trimmedName) {
      setDraftValidationError('Document name is required.');
      return;
    }
    if (!draftFile) {
      setDraftValidationError('A document file is required.');
      return;
    }

    setDraftValidationError('');
    const created = await createDocument({
      name: trimmedName,
      doc_type: draftType.trim() || 'Draft',
      job_id: draftJob.id,
      file: draftFile,
    });

    if (created) {
      setDraftJob(null);
    }
  }

  function handleSaved() {
    refetch();
    bumpJobsDataVersion();
  }

  const handleOpenDocument = useCallback(
    async (documentId) => {
      const url = await viewDocument(documentId);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
    [viewDocument]
  );

  const handleDownloadDocument = useCallback(
    async (documentRecord) => {
      setDownloadError('');
      if (!documentRecord?.id) return;
      try {
        const url = await viewDocument(documentRecord.id);
        if (!url) {
          setDownloadError('Unable to retrieve document URL');
          return;
        }

        const response = await fetch(url);
        if (!response.ok) {
          setDownloadError(
            `Failed to download document: ${
              response.status === 401 ? 'link expired or unauthorized' : response.status
            }`
          );
          return;
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        try {
          link.href = objectUrl;
          link.rel = 'noopener noreferrer';
          link.download = `${documentRecord.name || 'document'}.pdf`;
          document.body.appendChild(link);
          link.click();
        } finally {
          link.remove();
          URL.revokeObjectURL(objectUrl);
        }
      } catch (err) {
        Sentry.captureException(err);
        setDownloadError(err instanceof Error ? err.message : 'Failed to download document');
      }
    },
    [viewDocument]
  );

  function requestDelete(job) {
    setDeleteError('');
    setJobPendingDelete(job);
  }

  const cancelDelete = useCallback(() => {
    if (deletingJobId) return;
    setJobPendingDelete(null);
  }, [deletingJobId]);

  const handleDeleteModalKeyDown = useCallback(
    (e) => {
      const modal = deleteModalRef.current;
      if (e.key !== 'Tab' || !modal) return;

      const focusable = Array.from(
        modal.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );

      if (focusable.length === 0) {
        e.preventDefault();
        if (!modal.hasAttribute('tabindex')) {
          modal.setAttribute('tabindex', '-1');
        }
        modal.focus();
        return;
      }
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
    },
    [deleteModalRef]
  );

  const handleDraftModalKeyDown = useCallback(
    (e) => {
      const modal = draftModalRef.current;
      if (e.key !== 'Tab' || !modal) return;

      const focusable = Array.from(
        modal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusable.length === 0) {
        e.preventDefault();
        if (!modal.hasAttribute('tabindex')) {
          modal.setAttribute('tabindex', '-1');
        }
        modal.focus();
        return;
      }

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
    },
    [draftModalRef]
  );

  function handleDeleteOverlayClick(e) {
    if (e.target === deleteOverlayRef.current) {
      cancelDelete();
    }
  }

  useEffect(() => {
    if (!jobPendingDelete) return undefined;
    deleteCancelButtonRef.current?.focus();
    function handleEscape(e) {
      if (e.key === 'Escape') {
        cancelDelete();
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [jobPendingDelete, cancelDelete]);

  useEffect(() => {
    if (jobPendingDelete && deletingJobId) {
      deleteModalRef.current?.focus();
    }
  }, [jobPendingDelete, deletingJobId]);

  useEffect(() => {
    if (!draftJob) return undefined;
    draftCancelButtonRef.current?.focus();
    function handleEscape(e) {
      if (e.key === 'Escape') {
        closeDraft();
      }
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [draftJob, closeDraft]);

  useEffect(() => {
    if (draftJob && savingDraft) {
      draftModalRef.current?.focus();
    }
  }, [draftJob, savingDraft]);

  async function confirmDelete() {
    if (!jobPendingDelete || deletingJobId) return;
    const jobId = jobPendingDelete.id;
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
    if (!backendBase || !session?.access_token) {
      setDeleteError('Unable to delete application right now. Please refresh and try again.');
      return;
    }

    setDeleteError('');
    setDeletingJobId(jobId);

    try {
      const res = await fetch(`${backendBase}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to delete application (${res.status})`);
      }
      await refetch();
      bumpJobsDataVersion();
      setJobPendingDelete(null);
    } catch (err) {
      Sentry.captureException(err);
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete application.');
    } finally {
      setDeletingJobId(null);
    }
  }

  async function updateArchiveState(job, isArchivedNext) {
    if (!job?.id || updatingArchiveJobId || deletingJobId) return;
    const backendBase = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/+$/, '');
    if (!backendBase || !session?.access_token) {
      setDeleteError('Unable to update archive state right now. Please refresh and try again.');
      return;
    }

    setDeleteError('');
    setUpdatingArchiveJobId(job.id);
    try {
      const res = await fetch(`${backendBase}/jobs/${job.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ is_archived: isArchivedNext }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update archive state (${res.status})`);
      }
      await refetch();
      bumpJobsDataVersion();
    } catch (err) {
      Sentry.captureException(err);
      setDeleteError(err instanceof Error ? err.message : 'Failed to update archive state.');
    } finally {
      setUpdatingArchiveJobId(null);
    }
  }

  return (
    <AppShell title="My Dashboard" notificationCount={0}>
      <div className="dashboard-content">
        <div className="stats-row">
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        <JobAnalyticsCard accessToken={session?.access_token} jobsDataVersion={jobsDataVersion} />

        <div className="table-section">
          <div className="table-header">
            <div className="table-title">Job Applications</div>
            <button type="button" className="btn-add" onClick={openCreate}>
              + Add Job
            </button>
          </div>
          <div className="table-search-row">
            <div className="dashboard-search-box">
              <span className="dashboard-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search title, company, status, description, notes, recruiter, dates (month, year, day)..."
                aria-label="Search job applications"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="dashboard-table-controls">
              <div className="dashboard-filter-controls" ref={filterControlsRef}>
                <div className="dashboard-filter-dropdown">
                  <button
                    type="button"
                    className="dashboard-filter-trigger"
                    aria-haspopup="true"
                    aria-expanded={isStageOpen}
                    onClick={() => {
                      setIsStageOpen((prev) => !prev);
                      setIsLocationOpen(false);
                      setIsDeadlineOpen(false);
                    }}
                  >
                    {getDropdownLabel('Stage', selectedStatuses.length)}
                  </button>
                  {isStageOpen && (
                    <div
                      className="dashboard-filter-panel"
                      role="group"
                      aria-label="Filter by stage"
                    >
                      {meta.availableStatuses.map((status) => (
                        <label key={status} className="dashboard-filter-option">
                          <input
                            type="checkbox"
                            checked={selectedStatuses.includes(status)}
                            onChange={() =>
                              setSelectedStatuses((prev) => toggleFilterValue(prev, status))
                            }
                          />
                          <span>{status}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="dashboard-filter-dropdown">
                  <button
                    type="button"
                    className="dashboard-filter-trigger"
                    aria-haspopup="true"
                    aria-expanded={isLocationOpen}
                    onClick={() => {
                      setIsLocationOpen((prev) => !prev);
                      setIsStageOpen(false);
                      setIsDeadlineOpen(false);
                    }}
                  >
                    {getDropdownLabel('Location', selectedLocations.length)}
                  </button>
                  {isLocationOpen && (
                    <div
                      className="dashboard-filter-panel"
                      role="group"
                      aria-label="Filter by location"
                    >
                      {meta.availableLocations.map((location) => (
                        <label key={location} className="dashboard-filter-option">
                          <input
                            type="checkbox"
                            checked={selectedLocations.includes(location)}
                            onChange={() =>
                              setSelectedLocations((prev) => toggleFilterValue(prev, location))
                            }
                          />
                          <span>{location}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="dashboard-filter-dropdown">
                  <button
                    type="button"
                    className="dashboard-filter-trigger"
                    aria-haspopup="true"
                    aria-expanded={isDeadlineOpen}
                    onClick={() => {
                      setIsDeadlineOpen((prev) => !prev);
                      setIsStageOpen(false);
                      setIsLocationOpen(false);
                    }}
                  >
                    {getDropdownLabel('Deadline', selectedDeadlineStates.length)}
                  </button>
                  {isDeadlineOpen && (
                    <div
                      className="dashboard-filter-panel"
                      role="group"
                      aria-label="Filter by deadline state"
                    >
                      {DEADLINE_STATE_OPTIONS.map((state) => (
                        <label key={state.value} className="dashboard-filter-option">
                          <input
                            type="checkbox"
                            checked={selectedDeadlineStates.includes(state.value)}
                            onChange={() =>
                              setSelectedDeadlineStates((prev) =>
                                toggleFilterValue(prev, state.value)
                              )
                            }
                          />
                          <span>{state.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <label className="dashboard-sort-control" htmlFor="jobs-sort-by">
                <span className="dashboard-sort-label">Sort by</span>
                <select
                  id="jobs-sort-by"
                  aria-label="Sort jobs by"
                  value={selectedSortBy}
                  onChange={(event) => setSelectedSortBy(event.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dashboard-sort-control" htmlFor="show-archived-jobs">
                <span className="dashboard-sort-label">View</span>
                <span>
                  <input
                    id="show-archived-jobs"
                    type="checkbox"
                    checked={showArchivedJobs}
                    onChange={(event) => setShowArchivedJobs(event.target.checked)}
                  />{' '}
                  Show archived jobs
                </span>
              </label>
            </div>
          </div>

          {loading && (
            <p className="table-state" role="status" aria-live="polite" aria-busy="true">
              Loading jobs...
            </p>
          )}
          {error && (
            <p className="table-state table-state--error" role="alert">
              {error}
            </p>
          )}
          {!error && deleteError && !jobPendingDelete && (
            <p className="table-state table-state--error" role="alert">
              {deleteError}
            </p>
          )}

          {!loading && !error && (
            <table className="jobs-table">
              <caption className="visually-hidden">
                Job applications; columns include title, company, dates, recruiter notes, status,
                and row actions.
              </caption>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Job Title</th>
                  <th>Company</th>
                  <th>Applied</th>
                  <th>Deadline</th>
                  <th>Recruiter</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-empty">
                      {jobs.length === 0
                        ? 'No applications yet. Add your first job!'
                        : 'No matches found. Try another keyword.'}
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((job, index) => (
                    <tr key={job.id}>
                      <td className="row-number">{(meta.page - 1) * meta.pageSize + index + 1}</td>
                      <td>
                        <div className="job-title-cell">
                          <span className="job-title-text">{job.title}</span>
                        </div>
                      </td>
                      <td>
                        <div className="company-cell">
                          <div
                            className="company-logo"
                            style={{ background: getCompanyGradient(job.company) }}
                            aria-hidden="true"
                          >
                            {job.company?.[0]}
                          </div>
                          {job.company}
                        </div>
                      </td>
                      <td>
                        <span className="date-text">{formatDate(job.applied_date)}</span>
                      </td>
                      <td>
                        <span className="date-text date-text--deadline">
                          {formatDate(job.deadline)}
                        </span>
                      </td>
                      <td>
                        <span
                          className="table-recruiter-cell"
                          title={
                            job.recruiter_notes && String(job.recruiter_notes).trim()
                              ? String(job.recruiter_notes).trim()
                              : undefined
                          }
                        >
                          {truncateTableNote(job.recruiter_notes)}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button
                            type="button"
                            className="action-btn"
                            aria-label="View application"
                            onClick={() => openView(job)}
                            disabled={deletingJobId === job.id}
                          >
                            👁
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label="View stage history"
                            onClick={() => openHistory(job)}
                          >
                            📜
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label="Edit application"
                            onClick={() => openEdit(job)}
                            disabled={deletingJobId === job.id}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label={`Save draft for ${job.title}`}
                            onClick={() => openDraft(job)}
                            disabled={deletingJobId === job.id}
                          >
                            📝
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label={
                              job.is_archived
                                ? `Restore application ${job.title}`
                                : `Archive application ${job.title}`
                            }
                            onClick={() => updateArchiveState(job, !job.is_archived)}
                            disabled={deletingJobId === job.id || updatingArchiveJobId === job.id}
                          >
                            {updatingArchiveJobId === job.id ? '…' : job.is_archived ? '↩️' : '📦'}
                          </button>
                          <button
                            type="button"
                            className="action-btn"
                            aria-label={`Delete application ${job.title}`}
                            onClick={() => requestDelete(job)}
                            disabled={deletingJobId === job.id || updatingArchiveJobId === job.id}
                          >
                            {deletingJobId === job.id ? '…' : '🗑'}
                          </button>
                          <button
                            type="button"
                            className={`action-btn ${
                              job.research?.trim() ? 'action-btn--active' : ''
                            }`}
                            aria-label={
                              job.research?.trim() ? 'View saved research' : 'No research saved'
                            }
                            onClick={() => openResearch(job)}
                            disabled={deletingJobId === job.id}
                          >
                            📚
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          <div className="table-footer">
            <div className="rows-select">
              Show
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              entries
            </div>

            <div className="pagination" role="navigation" aria-label="Pagination">
              <button
                type="button"
                className="page-btn nav-arrow"
                aria-label="Previous page"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={meta.page <= 1}
              >
                ‹
              </button>
              {pageNumbers.map((page) => (
                <button
                  key={page}
                  type="button"
                  className={`page-btn${page === meta.page ? ' active' : ''}`}
                  aria-label={`Page ${page}`}
                  aria-current={page === meta.page ? 'page' : undefined}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                className="page-btn nav-arrow"
                aria-label="Next page"
                onClick={() => setCurrentPage((prev) => Math.min(meta.totalPages, prev + 1))}
                disabled={meta.page >= meta.totalPages}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewJob && (
        <JobOverviewModal
          job={viewJob}
          onClose={closeView}
          accessToken={session?.access_token}
          documents={documents}
          documentsLoading={documentsLoading}
          documentsError={documentsError}
          onRefreshDocuments={refetchDocuments}
          onOpenDocument={handleOpenDocument}
          onDownloadDocument={handleDownloadDocument}
          downloadError={downloadError}
          clearDownloadError={() => setDownloadError('')}
          onDocumentSaved={refetchDocuments}
          onJobUpdated={refetch}
          onLinkDocument={linkDocument}
          linkingIds={linkingIds}
          linkError={linkError}
          clearLinkError={clearLinkError}
        />
      )}

      {formState && (
        <JobForm
          key={formState.mode === 'edit' ? formState.job?.id : 'create'}
          mode={formState.mode}
          job={formState.job}
          accessToken={session?.access_token}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      )}

      {historyJob && (
        <JobHistory
          job={historyJob}
          accessToken={session?.access_token}
          onClose={() => setHistoryJob(null)}
          onSaved={handleSaved}
        />
      )}

      {jobPendingDelete && (
        <div
          className="delete-modal-overlay"
          role="presentation"
          ref={deleteOverlayRef}
          onClick={handleDeleteOverlayClick}
          data-testid="delete-modal-overlay"
        >
          <div
            className="delete-modal"
            ref={deleteModalRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleDeleteModalKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            aria-describedby="delete-modal-text"
            aria-busy={Boolean(deletingJobId)}
            tabIndex={-1}
          >
            <h2 className="delete-modal-title" id="delete-modal-title">
              Delete application?
            </h2>
            <p className="delete-modal-text" id="delete-modal-text">
              You are about to delete <strong>{jobPendingDelete.title}</strong> at{' '}
              <strong>{jobPendingDelete.company}</strong>. This action cannot be undone.
            </p>
            {deleteError && (
              <p className="delete-modal-error" role="alert" aria-live="assertive">
                {deleteError}
              </p>
            )}
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-btn delete-modal-btn--cancel"
                onClick={cancelDelete}
                ref={deleteCancelButtonRef}
                disabled={Boolean(deletingJobId)}
                aria-disabled={Boolean(deletingJobId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-btn delete-modal-btn--danger"
                onClick={confirmDelete}
                disabled={Boolean(deletingJobId)}
              >
                {deletingJobId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {draftJob && (
        <div className="delete-modal-overlay" role="presentation" onClick={closeDraft}>
          <div
            className="draft-modal"
            ref={draftModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-modal-title"
            onKeyDown={handleDraftModalKeyDown}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
          >
            <h2 className="delete-modal-title" id="draft-modal-title">
              Save Draft from Job Context
            </h2>
            <p className="delete-modal-text">
              This draft will be linked to <strong>{draftJob.title}</strong> at{' '}
              <strong>{draftJob.company}</strong> and shown in your document library.
            </p>

            <label className="draft-field-label" htmlFor="draft-name">
              Document Name
            </label>
            <input
              id="draft-name"
              className="draft-input"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Example: Stripe_Backend_Engineer_Draft"
              disabled={savingDraft}
            />

            <label className="draft-field-label" htmlFor="draft-type">
              Type
            </label>
            <select
              id="draft-type"
              className="draft-input"
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              disabled={savingDraft}
            >
              <option value="Resume">Resume</option>
              <option value="Cover Letter">Cover Letter</option>
              <option value="Transcript">Transcript</option>
              <option value="Other">Other</option>
            </select>

            <label className="draft-field-label" htmlFor="draft-file">
              Upload Document
            </label>
            <input
              id="draft-file"
              type="file"
              className="draft-input"
              accept=".pdf,application/pdf"
              onChange={(e) => setDraftFile(e.target.files?.[0] || null)}
              disabled={savingDraft}
            />
            <p className="delete-modal-text" style={{ marginTop: 8 }}>
              {draftFile ? `Selected file: ${draftFile.name}` : 'Supported: PDF only (max 10MB).'}
            </p>

            {(draftValidationError || draftSaveError) && (
              <p className="delete-modal-error" role="alert" aria-live="assertive">
                {draftValidationError || draftSaveError}
              </p>
            )}

            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-btn delete-modal-btn--cancel"
                onClick={closeDraft}
                ref={draftCancelButtonRef}
                disabled={savingDraft}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-btn"
                onClick={saveDraftFromJob}
                disabled={savingDraft}
              >
                {savingDraft ? 'Saving...' : 'Save to Documents'}
              </button>
            </div>
          </div>
        </div>
      )}

      {researchJob && (
        <SavedResearchModal
          job={jobWithResearch || researchJob}
          accessToken={session?.access_token}
          onClose={() => {
            setResearchJob(null);
            setJobWithResearch(null);
          }}
          onResearchUpdated={(updatedJob) => {
            if (updatedJob) {
              setJobWithResearch(updatedJob);
            }
            refetch();
          }}
        />
      )}
    </AppShell>
  );
}
