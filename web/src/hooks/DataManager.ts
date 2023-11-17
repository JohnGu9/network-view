import React from "react";
import Connection, { DataType } from "../common/Connection";
import DataManager from "../common/DataManager";

function useDataManager(ws: WebSocket | null) {
    const [data, setData] = React.useState(null as null | DataType);
    const [manager, setConnection] = React.useState(null as null | DataManager);
    React.useEffect(() => {
        if (ws !== null) {
            const connection = new Connection(ws);
            const manager = new DataManager(connection, setData);
            setData(null);
            setConnection(manager);
            return () => {
                connection.dispose();
            };
        } else {
            setConnection(null);
        }
    }, [ws]);

    return [manager, data] as [DataManager | null, DataType | null];
}

export default useDataManager;
