import CustomerScreen from './screens/CustomerScreen';
import OpportunitiesIndex from './screens/OpportunitiesIndex';

export default function App() {
  const match = window.location.pathname.match(/^\/customers\/([^/]+)$/);
  if (match) return <CustomerScreen customerId={decodeURIComponent(match[1])} />;
  return <OpportunitiesIndex />;
}
