import CustomerScreen from './screens/CustomerScreen';
import OpportunitiesIndex from './screens/OpportunitiesIndex';
import RequestAccess from './screens/RequestAccess';

export default function App() {
  const path = window.location.pathname;
  if (path === '/request-access') return <RequestAccess />;
  const match = path.match(/^\/customers\/([^/]+)$/);
  if (match) return <CustomerScreen customerId={decodeURIComponent(match[1])} />;
  return <OpportunitiesIndex />;
}
