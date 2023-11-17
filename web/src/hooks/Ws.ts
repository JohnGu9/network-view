import React from "react";

function useWs() {
    const [ws, setWs] = React.useState(null as null | WebSocket);
    const [refresh, refreshState] = React.useState(0);
    React.useEffect(() => {
        const { host } = document.location;
        const wsUri = `wss://${host}/rest`;
        const ws = new WebSocket(wsUri);
        let reconnectTimer = undefined as number | undefined;
        const onopen = () => {
            setWs(ws);
        };
        const onerror = () => {
            setWs(null);
            if (reconnectTimer === undefined) {
                reconnectTimer = window.setTimeout(() => {
                    reconnectTimer = undefined;
                    refreshState(v => v + 1);
                }, 1000);
            }
        };
        ws.addEventListener('error', onerror);
        ws.addEventListener('open', onopen);
        ws.addEventListener('close', onerror);
        return () => {
            window.clearTimeout(reconnectTimer);
            ws.removeEventListener('error', onerror);
            ws.removeEventListener('open', onopen);
            ws.removeEventListener('close', onerror);
            switch (ws.readyState) {
                case WebSocket.OPEN: {
                    ws.close();
                    break;
                }
                case WebSocket.CONNECTING: {
                    ws.addEventListener('open', function (e: Event) {
                        const ws = e.target as WebSocket;
                        ws.close();
                    }, { once: true, passive: true });
                }
            }
        };
    }, [refresh]);
    return ws;
}

export default useWs;
