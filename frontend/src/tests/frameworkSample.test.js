import { render, screen } from '@testing-library/react';

function SampleMessage() {
  return <div>Frontend test setup is working</div>;
}

test('frontend unit test framework is working', () => {
  render(<SampleMessage />);

  expect(screen.getByText(/frontend test setup is working/i)).toBeInTheDocument();
});
