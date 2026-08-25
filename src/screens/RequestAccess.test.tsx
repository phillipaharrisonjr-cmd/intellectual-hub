import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RequestAccess from './RequestAccess';
import { getIdentity } from '../identity';
import { mockFetch } from '../test/mockFetch';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function fillStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Organization/), 'Pinecrest Bank');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

async function fillStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Full name/), 'Jordan Ellis');
  await user.type(screen.getByLabelText(/Work email/), 'jellis@pinecrest.bank');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

async function fillStep3(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText(/Requested role/), 'analyst');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('RequestAccess', () => {
  it('gates each step on valid input', async () => {
    render(<RequestAccess />);
    const user = userEvent.setup();

    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Organization is required')).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();

    await fillStep1(user);
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Full name/), 'Jordan Ellis');
    await user.type(screen.getByLabelText(/Work email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Enter a valid work email address')).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 4/)).toBeInTheDocument();
  });

  it('submits the completed flow and shows the confirmation', async () => {
    const fetchMock = mockFetch({
      'POST /api/access-requests': () => ({ status: 201, body: { id: 'acc_1', status: 'received' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RequestAccess />);
    const user = userEvent.setup();

    await fillStep1(user);
    await fillStep2(user);
    await fillStep3(user);

    expect(screen.getByText(/Step 4 of 4/)).toBeInTheDocument();
    expect(screen.getByText('Pinecrest Bank')).toBeInTheDocument();
    expect(screen.getByText('jellis@pinecrest.bank')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    await waitFor(() => expect(screen.getByText(/Request received/)).toBeInTheDocument());

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post).toBeDefined();
    expect(JSON.parse(String(post![1]!.body))).toMatchObject({
      organization: 'Pinecrest Bank',
      userType: 'bank_employee',
      fullName: 'Jordan Ellis',
      workEmail: 'jellis@pinecrest.bank',
      requestedRole: 'analyst',
    });
  });

  it('a filled honeypot never reaches the API but still looks like success', async () => {
    const fetchMock = mockFetch({});
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<RequestAccess />);
    const user = userEvent.setup();

    const hp = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(hp).not.toBeNull();
    hp.value = 'https://spam.example';

    await fillStep1(user);
    await fillStep2(user);
    await fillStep3(user);
    await user.click(screen.getByRole('button', { name: 'Submit request' }));

    await waitFor(() => expect(screen.getByText(/Request received/)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('demo sign-in stores the chosen identity', async () => {
    const onSignedIn = vi.fn();
    render(<RequestAccess onSignedIn={onSignedIn} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.selectOptions(screen.getByLabelText(/Role/), 'approver');
    const name = screen.getByLabelText(/Your name/);
    await user.clear(name);
    await user.type(name, 'Marcus Lee');
    await user.click(screen.getByRole('button', { name: 'Enter portal' }));

    expect(onSignedIn).toHaveBeenCalled();
    expect(getIdentity()).toEqual({ role: 'approver', name: 'Marcus Lee' });
  });
});
