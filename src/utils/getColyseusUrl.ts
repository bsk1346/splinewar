export const getColyseusUrl = (): string => {
    // Vite injects import.meta.env.PROD as true during `npm run build`
    if (import.meta.env.PROD) {
        // Look for the VITE_SERVER_URL environment variable provided by Vercel
        // If not found, default to a generic fallback.
        const serverUrl = import.meta.env.VITE_SERVER_URL;
        if (!serverUrl) {
            console.warn("VITE_SERVER_URL environment variable is not defined!");
            return `wss://fallback-game-server.koyeb.app`;
        }

        // Ensure wss:// is used for secure production websocket
        if (serverUrl.startsWith('http')) {
            return serverUrl.replace(/^http/, 'ws');
        }

        return serverUrl.includes('://') ? serverUrl : `wss://${serverUrl}`;
    }

    // Local Development
    return `ws://${window.location.hostname}:2567`;
};
