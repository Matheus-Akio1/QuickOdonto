import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// No navegador a base relativa resolve contra a origem; no Node é preciso uma URL absoluta.
vi.stubEnv('VITE_API_URL', 'http://localhost/api/v1');
