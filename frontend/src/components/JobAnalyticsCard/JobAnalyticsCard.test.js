import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import JobAnalyticsCard from './JobAnalyticsCard';

const savedBackendUrl = process.env.REACT_APP_BACKEND_URL;

describe('JobAnalyticsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (savedBackendUrl === undefined) {
      delete process.env.REACT_APP_BACKEND_URL;
    } else {
      process.env.REACT_APP_BACKEND_URL = savedBackendUrl;
    }
  });

  test('loads picker then analytics when a job is selected', async () => {
    global.fetch = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/jobs?') && u.includes('page_size=100')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ id: 'job-a', company: 'Acme', title: 'Engineer', status: 'applied' }],
            total: 1,
          }),
        });
      }
      if (u.endsWith('/jobs/job-a/analytics')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            job_id: 'job-a',
            current_status: 'applied',
            status_changes_last_7_days: 2,
            status_changes_last_30_days: 5,
            time_in_stage: {
              applied: { seconds: 86400, label: 'Applied', is_current: true },
            },
            as_of: '2026-04-21T12:00:00+00:00',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => 'not found' });
    });

    render(<JobAnalyticsCard accessToken="tok" />);

    expect(
      await screen.findByRole('option', { name: /acme — engineer \(applied\)/i })
    ).toBeInTheDocument();

    const region = screen.getByRole('region', { name: /application analytics/i });

    fireEvent.change(within(region).getByLabelText(/select job for analytics/i), {
      target: { value: 'job-a' },
    });

    await waitFor(() => {
      const vals = region.querySelectorAll('.job-analytics-card__metric-value');
      expect(vals).toHaveLength(2);
      expect(vals[0]).toHaveTextContent('2');
      expect(vals[1]).toHaveTextContent('5');
      expect(within(region).getByText('1d')).toBeInTheDocument();
    });

    const currentStageBlock = within(region).getByTestId('job-analytics-current-stage');
    expect(currentStageBlock).toHaveTextContent(/current stage/i);
    expect(currentStageBlock).toHaveTextContent(/applied/i);

    expect(within(region).getByText(/^current$/i)).toBeInTheDocument();
  });

  test('shows current stage even when its accumulated time is zero', async () => {
    global.fetch = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/jobs?') && u.includes('page_size=100')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ id: 'job-b', company: 'Stripe', title: 'SWE', status: 'declined' }],
            total: 1,
          }),
        });
      }
      if (u.endsWith('/jobs/job-b/analytics')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            job_id: 'job-b',
            current_status: 'declined',
            status_changes_last_7_days: 3,
            status_changes_last_30_days: 3,
            time_in_stage: {
              applied: { seconds: 6300, label: 'Applied', is_current: false },
              declined: { seconds: 0, label: 'Declined', is_current: true },
            },
            as_of: '2026-04-27T21:33:46+00:00',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => 'not found' });
    });

    render(<JobAnalyticsCard accessToken="tok" />);

    expect(
      await screen.findByRole('option', { name: /stripe — swe \(declined\)/i })
    ).toBeInTheDocument();
    const region = screen.getByRole('region', { name: /application analytics/i });
    fireEvent.change(within(region).getByLabelText(/select job for analytics/i), {
      target: { value: 'job-b' },
    });

    await waitFor(() => {
      const declinedCell = within(region)
        .getAllByText('Declined')
        .find((node) => node.tagName === 'TD');
      expect(declinedCell).toBeInTheDocument();
    });
    expect(within(region).getByText(/^current$/i)).toBeInTheDocument();
    const declinedRow = within(region)
      .getAllByText('Declined')
      .find((node) => node.tagName === 'TD')
      .closest('tr');
    expect(declinedRow).toHaveClass('job-analytics-card__stage-row--current');
  });

  test('uses second/minute/hour/day granularity for stage duration labels', async () => {
    global.fetch = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/jobs?') && u.includes('page_size=100')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ id: 'job-c', company: 'Stripe', title: 'Data Eng', status: 'interviewing' }],
            total: 1,
          }),
        });
      }
      if (u.endsWith('/jobs/job-c/analytics')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            job_id: 'job-c',
            current_status: 'interviewing',
            status_changes_last_7_days: 1,
            status_changes_last_30_days: 2,
            time_in_stage: {
              withdrawn: { seconds: 59, label: 'Withdrawn', is_current: false },
              declined: { seconds: 61, label: 'Declined', is_current: false },
              applied: { seconds: 3660, label: 'Applied', is_current: false },
              interviewing: { seconds: 90000, label: 'Interviewing', is_current: true },
            },
            as_of: new Date().toISOString(),
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => 'not found' });
    });

    render(<JobAnalyticsCard accessToken="tok" />);

    expect(
      await screen.findByRole('option', { name: /stripe — data eng \(interviewing\)/i })
    ).toBeInTheDocument();
    const region = screen.getByRole('region', { name: /application analytics/i });
    fireEvent.change(within(region).getByLabelText(/select job for analytics/i), {
      target: { value: 'job-c' },
    });

    await waitFor(() => {
      expect(within(region).getByText('59s')).toBeInTheDocument();
      expect(within(region).getByText('1m')).toBeInTheDocument();
      expect(within(region).getByText('1h')).toBeInTheDocument();
      expect(within(region).getByText('1d 1h')).toBeInTheDocument();
    });
  });

  test('increments current-stage display from seconds to minutes in real time', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-29T20:08:00.000Z'));
    global.fetch = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/jobs?') && u.includes('page_size=100')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            items: [{ id: 'job-d', company: 'Acme', title: 'DS', status: 'interviewing' }],
            total: 1,
          }),
        });
      }
      if (u.endsWith('/jobs/job-d/analytics')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            job_id: 'job-d',
            current_status: 'interviewing',
            status_changes_last_7_days: 0,
            status_changes_last_30_days: 1,
            time_in_stage: {
              interviewing: { seconds: 0, label: 'Interviewing', is_current: true },
            },
            as_of: '2026-04-29T20:07:01.000Z',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => 'not found' });
    });

    render(<JobAnalyticsCard accessToken="tok" />);

    const region = await screen.findByRole('region', { name: /application analytics/i });
    expect(
      await screen.findByRole('option', { name: /acme — ds \(interviewing\)/i })
    ).toBeInTheDocument();
    fireEvent.change(within(region).getByLabelText(/select job for analytics/i), {
      target: { value: 'job-d' },
    });

    await waitFor(() => {
      expect(within(region).getByText('59s')).toBeInTheDocument();
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await waitFor(() => {
      expect(within(region).getByText('1m')).toBeInTheDocument();
    });
  });

  test('clears stale selection when selected job disappears from picker', async () => {
    let pickerCallCount = 0;
    global.fetch = jest.fn((url) => {
      const u = String(url);
      if (u.includes('/jobs?') && u.includes('page_size=100')) {
        pickerCallCount += 1;
        if (pickerCallCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              items: [{ id: 'job-a', company: 'Acme', title: 'Engineer', status: 'applied' }],
              total: 1,
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ items: [], total: 0 }) });
      }
      if (u.endsWith('/jobs/job-a/analytics')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            job_id: 'job-a',
            current_status: 'applied',
            status_changes_last_7_days: 0,
            status_changes_last_30_days: 0,
            time_in_stage: { applied: { seconds: 60, label: 'Applied', is_current: true } },
            as_of: '2026-04-27T21:33:46+00:00',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => 'not found' });
    });

    const { rerender } = render(<JobAnalyticsCard accessToken="tok" jobsDataVersion={0} />);

    expect(
      await screen.findByRole('option', { name: /acme — engineer \(applied\)/i })
    ).toBeInTheDocument();

    const region = screen.getByRole('region', { name: /application analytics/i });
    const select = within(region).getByLabelText(/select job for analytics/i);
    fireEvent.change(select, { target: { value: 'job-a' } });
    expect(select).toHaveValue('job-a');

    rerender(<JobAnalyticsCard accessToken="tok" jobsDataVersion={1} />);

    await waitFor(() => {
      expect(within(region).getByLabelText(/select job for analytics/i)).toHaveValue('');
    });
  });
});
