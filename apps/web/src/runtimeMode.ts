/** The demo build executes the same engine locally and never sends API requests. */
export const BROWSER_MODE = import.meta.env.VITE_SIMULATION_MODE === 'browser';
