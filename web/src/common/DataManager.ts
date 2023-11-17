import React from "react";
import Connection, { DataType } from "./Connection";

class DataManager {
    static DataContext = React.createContext(null as unknown as DataType);
    static Context = React.createContext(null as null | DataManager);
    constructor(connection: Connection, callback: (data: DataType) => unknown) {
        this.connection = connection;
        this.callback = callback;
        this.data = {};
    }
    callback: (data: DataType) => unknown;
    connection: Connection;
    data: DataType;

    protected async getAll() {
        const data = await this.connection.getAll();
        this.data = data;
        this.callback(this.data);
    }

    async get() {
        const latestTimestamp: { [interfaceName: string]: number } = {};
        for (const [key, value] of Object.entries(this.data)) {
            if (value.history.length === 0) continue;
            latestTimestamp[key] = value.history[value.history.length - 1][0];
        }
        if (Object.entries(latestTimestamp).length === 0) return await this.getAll();

        const partOfData = await this.connection.get(latestTimestamp);
        for (const [key, value] of Object.entries(partOfData)) {
            const oldData = this.data[key];
            const mergeData = value;
            if (oldData) {
                value.mac = oldData.mac;
                const history = mergeData.history;
                const start = history.findIndex(v => v !== null);
                if (start !== -1) {
                    mergeData.history = [
                        ...oldData.history,
                        ...history.slice(start, history.length)
                    ].slice(-history.length);
                } else {
                    mergeData.history = oldData.history;
                }
            } else {

                mergeData.history = popFontNull(mergeData.history);
            }
        }
        this.data = partOfData;
        this.callback(this.data);
    }

    getInterfaces() {
        return this.connection.getInterfaces();
    }

    listenInterface(interfaceName: string) {
        this.data = { ...this.data, [interfaceName]: { history: [], closed: false, mac: null } }
        this.connection.listenInterface(interfaceName);
        this.callback(this.data);

    }

    notListenInterface(interfaceName: string) {
        this.data = { ...this.data };
        this.data[interfaceName].closed = true;
        this.connection.notListenInterface(interfaceName);
        this.callback(this.data);
    }

    clearInterface(interfaceName: string) {
        this.data = { ...this.data };
        delete this.data[interfaceName];
        this.connection.clearInterface(interfaceName);
        this.callback(this.data);
    }
}

export default DataManager;

function popFontNull<T>(arr: Array<T>) {
    const i = arr.findIndex(v => v !== null);
    if (i === -1) return [];
    return arr.slice(i, arr.length - 1);
}
