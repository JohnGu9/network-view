export type DataType = {
    [interfaceName: string]: InterfaceDataType
};

export type InterfaceDataType = {
    history: ([number, { [header: string]: number }])[],
    closed: boolean,
    mac: string | null,
}

export type HeaderType = {
    protocol: number,
    source: string,
    destination: string,
    ip_header: {
        protocol: number,
        source: string,
        destination: string,
    } | null,
}

class Connection {

    constructor(ws: WebSocket) {
        this.ws = ws;
        this._listener = this._listener.bind(this);
        ws.addEventListener('message', this._listener);
    }
    protected ws: WebSocket;
    protected tag = 0;
    protected callbacks: Map<number, (value: unknown) => unknown> = new Map();

    protected _listener(event: MessageEvent) {
        const e = event as MessageEvent<string>;
        const message = e.data;
        const obj = JSON.parse(message);
        if (obj && typeof obj === 'object') {
            if ('tag' in obj && 'response' in obj) {
                const callback = this.callbacks.get(obj.tag);
                this.callbacks.delete(obj.tag);
                if (callback !== undefined) {
                    callback(obj.response);
                }

            }
        }
    }

    protected _request(o: unknown) {
        const t = this.tag++;
        return new Promise(resolve => {
            this.callbacks.set(t, resolve);
            this.ws.send(
                JSON.stringify({ "tag": t, "request": o })
            );
        });
    }

    async getAll() {
        const data = await this._request("get_all") as DataType;
        if (data === null) throw new Error('No data');
        return data;
    }

    async get(timestamps: { [interfaceName: string]: number }) {
        const data = await this._request({ get: timestamps }) as DataType;
        if (data === null) throw new Error('No data');
        return data;
    }

    async getInterfaces() {
        const data = await this._request("get_interfaces") as string[];
        if (data === null) throw new Error('No data');
        return data;
    }

    listenInterface(interfaceName: string) {
        return this._request({ listen_interfaces: interfaceName });
    }

    notListenInterface(interfaceName: string) {
        return this._request({ not_listen_interfaces: interfaceName });
    }

    clearInterface(interfaceName: string) {
        return this._request({ clear_interfaces: interfaceName });
    }

    dispose() {
        this.ws.removeEventListener('message', this._listener);
        this._listener = function () { };
        this.callbacks.forEach((value) => value(null));
        this.callbacks.clear();
    }
}

export default Connection;
