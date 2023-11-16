import React from "react";
import { Button, Checkbox, Dialog, LinearProgress, ListDivider, ListItem, Switch, Typography } from "rmcw";
import DataManager from "../common/DataManager";

function Manage({ open, close }: { open: boolean, close: () => unknown }) {
  const connection = React.useContext(DataManager.Context);
  const [loading, setLoading] = React.useState(false);
  const [interfaces, setInterfaces] = React.useState([] as string[]);
  const manager = React.useContext(DataManager.Context);
  const data = React.useContext(DataManager.DataContext);
  const { lostConnectionInterfaces, cachedInterfaces } = React.useMemo(() => {
    const l = new Set(interfaces);
    const entries = Object.entries(data);
    const cachedInterfaces = new Map(entries);
    const lostConnectionInterfaces = entries.filter(([v]) => !l.has(v));
    return { lostConnectionInterfaces, cachedInterfaces };
  }, [data, interfaces]);

  React.useEffect(() => {
    if (connection) {
      let signal = false;
      setLoading(true);
      connection.getInterfaces()
        .then(v => {
          if (signal) return;
          setInterfaces(v);
          setLoading(false);
        });
      return () => {
        signal = true;
      };
    }
  }, [connection]);

  React.useEffect(() => {
    if (open && connection) {
      let signal = false;
      setLoading(true);
      Promise.all([
        connection.getInterfaces(),
        new Promise(resolve => window.setTimeout(() => requestAnimationFrame(resolve), 150))
      ]).then(([v]) => {
        if (signal) return;
        setInterfaces(v);
        setLoading(false);
      });
      return () => {
        signal = true;
      };
    }
  }, [open, connection]);

  return (
    <Dialog open={open}
      onScrimClick={close}
      onEscapeKey={close}
      fullscreen
      title="Manage"
      actions={<Button onClick={close}>close</Button>}>
      <LinearProgress closed={!loading} />
      {interfaces.map((v, index) => {
        const d = cachedInterfaces.get(v);
        const selected = d !== undefined;
        return <ListItem key={index}
          graphic={<Checkbox checked={selected} onClick={(e) => {
            if (manager) {
              if (selected) {
                manager.clearInterface(v);
              } else {
                manager.listenInterface(v);
              }
              e.stopPropagation();
            }

          }} />}
          primaryText={v}
          meta={<Switch selected={d?.closed === false} />}
          onClick={() => {
            if (manager) {
              if (d?.closed === false) {
                manager.notListenInterface(v);
              } else {
                manager.listenInterface(v);
              }
            }
          }} />
      })}
      {lostConnectionInterfaces.length !== 0 ?
        <>
          <ListDivider />
          <Typography.Button>Not Available</Typography.Button>
          {lostConnectionInterfaces.map((v, index) => <ListItem key={index} primaryText={v[0]} disabled />)}
        </> :
        undefined}
    </Dialog>
  );
}

export default Manage;
