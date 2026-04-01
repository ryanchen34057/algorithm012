import { ThemeProvider } from './components/ThemeContext';
import Dashboard from './pages/Dashboard';
import './index.css';

export default function App() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  );
}
