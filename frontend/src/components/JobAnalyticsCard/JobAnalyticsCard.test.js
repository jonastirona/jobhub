import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import JobAnalyticsCard from './JobAnalyticsCard';

describe('JobAnalyticsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REACT_APP_BACKEND_URL = 'http://localhost:8000';
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
            status_changes_last_7_days: 2,
            status_changes_last_30_days: 5,
            time_in_stage: {
              applied: { seconds: 86400, label: 'Applied' },
            },
            as_of: '2026-04-21T12:00:00+00:00',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: async () => 'not found' });
    });

    render(<JobAnalyticsCard accessToken="tok" />);

    expect(await screen.findByRole('option', { name: /acme — engineer/i })).toBeInTheDocument();

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
  });
});
