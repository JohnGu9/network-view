import { SharedAxis, SharedAxisTransform } from 'material-design-transform';
import React from 'react';
import { Button, Card, Elevation, Icon, IconButton, ListItem, Tab, TabBar, Typography } from 'rmcw'
import { DataType, HeaderType, InterfaceDataType } from './common/Connection';
import DataManager from './common/DataManager';
import Manage from './dialogs/Manage';
import Help from './dialogs/Help';
import useEChart, { echarts } from './hooks/Echart';
import { EChartsOption, DefaultLabelFormatterCallbackParams } from 'echarts';
import useDarkMedia from './hooks/DarkMedia';

export default function Content() {
  const [openHelpDialog, setOpenHelpDialog] = React.useState(false);
  const [openManageDialog, setOpenManageDialog] = React.useState(false);
  const data = React.useContext(DataManager.DataContext);

  const list = React.useMemo(() => {
    return Object.entries(data).map(([key, value]) => {
      const { history, closed } = value;
      if (closed) return { name: key, speed: null };
      if (history.length < 2) return { name: key, speed: 0 };
      const last = history[history.length - 1];
      const elapsed = last[0] - history[history.length - 2][0];
      let amount = 0;
      for (const v of Object.values(last[1])) {
        amount += v;
      }

      return { name: key, speed: amount * 1000 / elapsed /** unit: Byte/s */ };
    });
  }, [data]);

  const all = React.useMemo(() => {
    let amount = 0;
    for (const v of list) {
      if (v.speed !== null)
        amount += v.speed;
    }
    return amount;
  }, [list]);

  const [selectedInterface, setSelectedInterface] = React.useState("");
  const detailData = data[selectedInterface];

  return (
    <>
      <div style={{
        width: 255,
        color: 'var(--mdc-top-app-bar-on-surface)',
        backgroundColor: 'var(--mdc-top-app-bar-surface)',
        '--mdc-ripple-color': 'var(--mdc-top-app-bar-on-surface)',
        '--mdc-theme-text-hint-on-background': 'var(--mdc-top-app-bar-on-surface)',
        '--mdc-theme-primary': 'var(--mdc-top-app-bar-on-surface)',
      } as React.CSSProperties}>
        <div className='column full-size' >
          <Typography.Headline5 style={{ margin: '24px 16px 16px' }}>
            Network View
          </Typography.Headline5>
          <ul className='expanded' >
            <ListItem primaryText="Overview" meta={toDisplay(all)}
              activated={selectedInterface === ""}
              onClick={() => setSelectedInterface("")} />
            {list.map(({ name, speed }, index) => {
              return <ListItem key={index} primaryText={name} meta={speed === null ? 'offline' : toDisplay(speed)}
                activated={selectedInterface === name}
                onClick={() => setSelectedInterface(name)} />
            })}
          </ul>
          <ul >
            <ListItem primaryText="Manage" meta={<Icon>settings</Icon>}
              onClick={() => setOpenManageDialog(true)} />
            <ListItem primaryText="Help" meta={<Icon>help</Icon>}
              onClick={() => setOpenHelpDialog(true)} />
          </ul>
        </div>
      </div>
      <SharedAxis className='expanded column'
        keyId={selectedInterface}
        forceRebuildAfterSwitched={false}>
        {detailData === undefined ?
          <Overview data={data} selectInterface={setSelectedInterface} /> :
          <Detail data={detailData} />}
      </SharedAxis>
      <Manage open={openManageDialog} close={() => setOpenManageDialog(false)} />
      <Help open={openHelpDialog} close={() => setOpenHelpDialog(false)} />
    </>
  );
}

const GB = (1024 * 1024 * 1024);
const MB = (1024 * 1024);
const KB = 1024

function toDisplay(speed: number) {
  if (speed > GB) {
    return `${(speed / GB).toFixed(2)} GB/s`
  } else if (speed > MB) {
    return `${(speed / MB).toFixed(2)} MB/s`
  } else if (speed > KB) {
    return `${(speed / KB).toFixed(2)} KB/s`
  } else {
    return `${speed.toFixed(2)} B/s`
  }
}

function isOut(header: HeaderType, data: InterfaceDataType) {
  return header.source === data.mac;
}

function Overview({ data, selectInterface }: { data: DataType, selectInterface: (interfaceName: string) => unknown }) {
  return (
    <div className='expanded' style={{ overflowY: 'auto' }}>
      {Object.entries(data).map(([interfaceName, data], index) => {
        return (
          <div style={{ padding: '8px 16px' }} key={index}>
            <Card actionIcons={<>
              <Button label="view" onClick={() => selectInterface(interfaceName)} />
              <div className='expanded' />
              <div style={{ color: 'var(--mdc-theme-on-surface)' }}>{interfaceName} ({data.mac})</div>
            </>}
              primaryAction={<InterfaceChart data={data} />}></Card>
          </div>);
      })}
    </div>
  );
}

function toChartOption(
  output: ([number, number])[],
  input: ([number, number])[],
  textColor: string | undefined,
): EChartsOption {
  return {
    grid: {
      top: 42,
      left: 20,
      right: 20,
      bottom: 15,
    },
    legend: {
      padding: 12,
      textStyle: {
        color: textColor,
      }
    },
    tooltip: {
      trigger: 'axis',
      formatter: function (params) {
        const ret = (params as DefaultLabelFormatterCallbackParams[]).reduce(
          (prev, curr) =>
            prev + '<li style="list-style:none">' + curr.marker + "&nbsp;&nbsp;" + toDisplay((curr.value as number[])[1]) + "</li>", "");
        return ret;
      }
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        show: false,
      },
      splitLine: {
        show: true
      }
    },
    yAxis: {
      type: 'value',
      axisTick: {
        inside: true
      },
      splitLine: {
        show: false
      },
      axisLabel: {
        inside: true,
        hideOverlap: true,
        showMinLabel: false,
        formatter: toDisplay,
      },
      z: 10
    },
    series: [
      {
        name: "Upload",
        data: output,
        type: 'line',
        smooth: true,
        itemStyle: {
          color: '#0770FF'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: 'rgba(58,77,233,0.8)'
            },
            {
              offset: 1,
              color: 'rgba(58,77,233,0.3)'
            }
          ])
        },
      },
      {
        name: "Download",
        data: input,
        type: 'line',
        smooth: true,
        itemStyle: {
          color: '#F2597F'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: 'rgba(213,72,120,0.8)'
            },
            {
              offset: 1,
              color: 'rgba(213,72,120,0.3)'
            }
          ])
        },
      }
    ]
  };
}

function InterfaceChart({ data }: { data: InterfaceDataType }) {
  const { output, input } = React.useMemo(() => {
    const output: Array<[number, number]> = [];
    const input: Array<[number, number]> = [];
    for (const [timestamp, d] of data.history) {
      let outAmount = 0;
      let inAmount = 0;
      for (const [key, v] of Object.entries(d)) {
        const h = JSON.parse(key) as HeaderType;
        if (isOut(h, data)) {
          outAmount += v;
        } else {
          inAmount += v;
        }
      }
      output.push([timestamp, outAmount]);
      input.push([timestamp, inAmount]);
    }
    return { output, input };
  }, [data]);
  const dark = useDarkMedia();
  const ref = React.useRef<HTMLDivElement>(null);
  useEChart(ref, toChartOption(output, input, dark ? "white" : "black"));
  return <div ref={ref} style={{ height: 200 }} />;
}

function Detail({ data }: {
  data: InterfaceDataType
}) {
  const [transform, setTransform] = React.useState(SharedAxisTransform.fromLeftToRight);
  const [selected, setSelected] = React.useState(0);
  return (
    <>
      <TabBar style={{ backgroundColor: 'var(--mdc-theme-surface)' }}
        selected={selected}
        onSelected={(i) => {
          if (i === selected) return;
          setTransform(selected < i ?
            SharedAxisTransform.fromRightToLeft :
            SharedAxisTransform.fromLeftToRight);
          setSelected(i);
        }}>
        <Tab label="Protocols" />
        <Tab label="IP Address" />
        <Tab label="Mac Address" />
      </TabBar>
      <SharedAxis
        className='expanded'
        style={{ position: 'relative' }}
        keyId={selected}
        transform={transform}>
        {(() => {
          switch (selected) {
            case 1:
              return <IpAddress key={data.mac} data={data} />
            case 2:
              return <MacAddress key={data.mac} data={data} />
            default:
              return <Protocols data={data} />
          }
        })()}
      </SharedAxis>
    </>
  );
}

function DetailChart({ children, open, close, data }: { children?: React.ReactNode, open: boolean, close: () => unknown, data: { output: [number, number][], input: [number, number][] } }) {
  const dark = useDarkMedia();
  const ref = React.useRef<HTMLDivElement>(null);
  useEChart(ref, toChartOption(data.output, data.input, dark ? "white" : "black"));
  return (
    <>
      <div className='full-size' style={{ overflowY: 'auto' }}>
        {children}
        <div style={{
          height: open ? 240 + 32 : 0,
          transition: 'height 250ms',
          willChange: 'height',
        }} />
      </div>
      <div className='row flex-stretch' style={{
        position: 'absolute', height: 240, width: '100%', maxWidth: '100%', left: 0,
        bottom: open ? 0 : -240,
        transition: 'bottom 250ms',
        willChange: 'bottom',
      }}>
        <div style={{ width: 16 }} />
        <div className='expanded column'>
          <Elevation depth={2} className='expanded column flex-stretch'
            style={{
              backgroundColor: 'var(--mdc-theme-surface)',
              borderRadius: 'var(--mdc-shape-medium, 4px)',
              overflow: 'hidden',
            }}>
            <div className='expanded' >
              <div className='full-size' ref={ref} />
            </div>
            <div className='row' style={{ height: 56 }}>
              <div style={{ width: 16 }} />
              <Typography.Button>Detail</Typography.Button>
              <div className='expanded' />
              <IconButton onClick={close}><Icon>close</Icon></IconButton>
              <div style={{ width: 16 }} />
            </div>
          </Elevation>
          <div style={{ height: 8 }} />
        </div>
        <div style={{ width: 16 }} />
      </div>
    </>
  );
}

type DirectInOutData = {
  output: ([number, number])[],
  input: ([number, number])[],
};

function Protocols({ data }: {
  data: InterfaceDataType
}) {
  const { tcp, udp, icmp, icmpV6, arp, other } = React.useMemo(() => {
    const tcp: DirectInOutData = { output: [], input: [] };
    const udp: DirectInOutData = { output: [], input: [] };
    const icmp: DirectInOutData = { output: [], input: [] };
    const icmpV6: DirectInOutData = { output: [], input: [] };
    const arp: DirectInOutData = { output: [], input: [] };
    const other: DirectInOutData = { output: [], input: [] };
    for (const [t, v] of data.history) {
      let tcpLength = 0;
      let udpLength = 0;
      let icmpLength = 0;
      let icmpV6Length = 0;
      let arpLength = 0;
      let otherLength = 0;
      let tcpLengthIn = 0;
      let udpLengthIn = 0;
      let icmpLengthIn = 0;
      let icmpV6LengthIn = 0;
      let arpLengthIn = 0;
      let otherLengthIn = 0;

      for (const [key, size] of Object.entries(v)) {
        const header = JSON.parse(key) as HeaderType;
        const isOutput = isOut(header, data);
        if (header.ip_header) {
          switch (header.ip_header.protocol) {
            case 6: {
              if (isOutput) tcpLength += size;
              else tcpLengthIn += size;
              break;
            }
            case 17: {
              if (isOutput) udpLength += size;
              else udpLengthIn += size;
              break;
            }
            case 1: {
              if (isOutput) icmpLength += size;
              else icmpLengthIn += size;
              break;
            }
            case 58: {
              if (isOutput) icmpV6Length += size;
              else icmpV6LengthIn += size;
              break;
            }
            default: {
              if (isOutput) otherLength += size;
              else otherLengthIn += size;
            }
          }
        } else {
          switch (header.protocol) {
            case 0x0806: {
              if (isOutput) arpLength += size;
              else arpLengthIn += size;
              break;
            }
            default: {
              if (isOutput) otherLength += size;
              else otherLengthIn += size;
            }
          }
        }

      }
      tcp.output.push([t, tcpLength]);
      udp.output.push([t, udpLength]);
      icmp.output.push([t, icmpLength]);
      icmpV6.output.push([t, icmpV6Length]);
      arp.output.push([t, arpLength]);
      other.output.push([t, otherLength]);

      tcp.input.push([t, tcpLengthIn]);
      udp.input.push([t, udpLengthIn]);
      icmp.input.push([t, icmpLengthIn]);
      icmpV6.input.push([t, icmpV6LengthIn]);
      arp.input.push([t, arpLengthIn]);
      other.input.push([t, otherLengthIn]);
    }
    return { tcp, udp, icmp, icmpV6, arp, other };
  }, [data]);
  function toSpeed(arr: ([number, number])[]) {
    if (arr.length < 2) return 0;
    const len = arr.length;
    const last = arr[len - 1];
    const last1 = arr[len - 2];
    return last[1] * 1000 / (last[0] - last1[0]);
  }
  const [selected, setSelected] = React.useState(0);
  const [openChart, setOpenChart] = React.useState(false);
  const select = (v: number) => {
    setSelected(v);
    setOpenChart(true);
  };

  return (
    <DetailChart open={openChart} close={() => setOpenChart(false)} data={((() => {
      switch (selected) {
        case 0: return tcp;
        case 1: return udp;
        case 2: return icmp;
        case 3: return icmpV6;
        case 4: return arp;
        default: return other;
      }
    })())}>
      <ul style={{ overflowY: 'auto' }}>
        <ListItem primaryText="TCP" meta={<SpeedView output={toSpeed(tcp.output)} input={toSpeed(tcp.input)} />}
          activated={selected === 0 && openChart}
          onClick={() => select(0)} />
        <ListItem primaryText="UDP" meta={<SpeedView output={toSpeed(udp.output)} input={toSpeed(udp.input)} />}
          activated={selected === 1 && openChart}
          onClick={() => select(1)} />
        <ListItem primaryText="ICMP" meta={<SpeedView output={toSpeed(icmp.output)} input={toSpeed(icmp.input)} />}
          activated={selected === 2 && openChart}
          onClick={() => select(2)} />
        <ListItem primaryText="ICMPv6" meta={<SpeedView output={toSpeed(icmpV6.output)} input={toSpeed(icmpV6.input)} />}
          activated={selected === 3 && openChart}
          onClick={() => select(3)} />
        <ListItem primaryText="ARP" meta={<SpeedView output={toSpeed(arp.output)} input={toSpeed(arp.input)} />}
          activated={selected === 4 && openChart}
          onClick={() => select(4)} />
        <ListItem primaryText="Other" meta={<SpeedView output={toSpeed(other.output)} input={toSpeed(other.input)} />}
          activated={selected === 5 && openChart}
          onClick={() => select(5)} />

      </ul>
    </DetailChart>
  );
}

function SpeedView({ output, input }: { output: number, input: number }) {
  return (
    <span className='column'>
      <span className='row' style={{ minWidth: 96 }}>
        <Icon style={{ fontSize: 16 }}>arrow_upward</Icon>
        <span className='expanded' />
        {toDisplay(output)}
      </span>
      <span style={{ height: 2 }} />
      <span className='row' style={{ minWidth: 96 }}>
        <Icon style={{ fontSize: 16 }}>arrow_downward</Icon>
        <span className='expanded' />
        {toDisplay(input)}
      </span>
    </span>
  );
}

function toNum(d: unknown) {
  if (typeof d === 'number') {
    return d;
  }
  return 0;
}

type InOutData = {
  output: { [timestamp: number]: number },
  input: { [timestamp: number]: number }
};

function IpAddress({ data }: {
  data: InterfaceDataType
}) {
  const { ips, timestamps } = React.useMemo(() => {
    const result: { [ip: string]: InOutData } = {};// <MacAddr, {[timestamp:number]: size}>
    function ensure(obj: { [ip: string]: InOutData },
      ip: string, timestamp: number, size: number, isOutput: boolean) {
      const t = ip in obj ? obj[ip] : (obj[ip] = { output: {}, input: {} });
      const o = isOutput ? t.output : t.input;
      if (!(timestamp in t)) o[timestamp] = 0;
      o[timestamp] += size;
    }
    for (const [timestamp, v] of data.history) {
      for (const [key, size] of Object.entries(v)) {
        const header = JSON.parse(key) as HeaderType;
        if (header.ip_header) {
          const isOutput = isOut(header, data);
          ensure(result, header.ip_header.source, timestamp, size, isOutput);
          ensure(result, header.ip_header.destination, timestamp, size, isOutput);
        }
      }
    }
    const timestamps = data.history.map(([t]) => t);
    return { ips: result, timestamps };
  }, [data]);

  const len = timestamps.length;
  const lastTimestamp = timestamps[len - 1];
  const elapsed = len < 2 ? null : lastTimestamp - timestamps[len - 2];
  const toSpeed = elapsed === null ?
    () => { return 0; } :
    (size?: number) => {
      if (typeof size === 'number')
        return size * 1000 / elapsed;
      return 0;
    };
  function allSize(obj: InOutData) {
    let res = 0;
    for (const s of Object.values(obj.input)) res += s;
    for (const s of Object.values(obj.output)) res += s;
    return res;
  }

  const [selected, setSelected] = React.useState("");
  const [openChart, setOpenChart] = React.useState(false);
  const select = (v: string) => {
    setSelected(v);
    setOpenChart(true);
  };
  const chartData = React.useMemo(() => {
    const ipData = ips[selected];
    let output: Array<[number, number]>;
    let input: Array<[number, number]>;
    if (ipData) {

      output = [];
      input = [];
      for (const [timestamp] of data.history) {
        output.push([timestamp, toNum(ipData.output[timestamp])]);
        input.push([timestamp, toNum(ipData.input[timestamp])]);
      }
      return { input, output };
    } else {
      input = output = data.history.map<[number, number]>(([timestamp]) => {
        return [timestamp, 0];
      });
      return { input, output };
    }
  }, [data, ips, selected]);

  const ipsList = Object.entries(ips);

  return (
    <DetailChart open={openChart} close={() => setOpenChart(false)} data={chartData}>
      {
        ipsList.length === 0 ?
          <div className='full-size column flex-center'>No Data</div> :
          <ul>
            {ipsList.map(([ip, sizes]) => [ip, sizes, allSize(sizes)] as [string, InOutData, number])
              .sort((k0, k1) => {
                if (k0[2] === k1[2]) {
                  if (k0[0] < k1[0]) return -1;
                  else if (k0[0] === k1[0]) return 0;
                  else return 1;
                }
                return k1[2] - k0[2]
              })
              .map(([ip, speed]) => {
                return <ListItem key={ip} primaryText={ip}
                  meta={<SpeedView output={toSpeed(speed.output[lastTimestamp])} input={toSpeed(speed.input[lastTimestamp])} />}
                  activated={selected === ip && openChart}
                  onClick={() => select(ip)} />
              })}
          </ul>
      }
    </DetailChart>
  );
}

function MacAddress({ data }: {
  data: InterfaceDataType
}) {

  const { macs, timestamps } = React.useMemo(() => {
    const result: { [mac: string]: InOutData } = {};// <MacAddr, {[timestamp:number]: size}>
    if (typeof data.mac === 'string') {
      result[data.mac] = { output: {}, input: {} };
    }
    function ensure(obj: { [mac: string]: InOutData },
      mac: string, timestamp: number, size: number, isOutput: boolean) {
      const t = mac in obj ? obj[mac] : (obj[mac] = { output: {}, input: {} });
      const o = isOutput ? t.output : t.input;
      if (!(timestamp in t)) o[timestamp] = 0;
      o[timestamp] += size;
    }
    for (const [timestamp, v] of data.history) {
      for (const [key, size] of Object.entries(v)) {
        const header = JSON.parse(key) as HeaderType;
        const isOutput = isOut(header, data);
        ensure(result, header.source, timestamp, size, isOutput);
        ensure(result, header.destination, timestamp, size, isOutput);
      }
    }
    const timestamps = data.history.map(([t]) => t);
    return { macs: result, timestamps };
  }, [data]);

  const len = timestamps.length;
  const lastTimestamp = timestamps[len - 1];
  const elapsed = len < 2 ? null : lastTimestamp - timestamps[len - 2];
  const toSpeed = elapsed === null ?
    () => { return 0; } :
    (size?: number) => {
      if (typeof size === 'number')
        return size * 1000 / elapsed;
      return 0;
    };

  const [selected, setSelected] = React.useState("");
  const [openChart, setOpenChart] = React.useState(false);
  const select = (v: string) => {
    setSelected(v);
    setOpenChart(true);
  };
  const chartData = React.useMemo(() => {
    const macData = macs[selected];
    let output: Array<[number, number]>;
    let input: Array<[number, number]>;
    if (macData) {
      output = [];
      input = [];
      for (const [timestamp] of data.history) {
        output.push([timestamp, toNum(macData.output[timestamp])])
        input.push([timestamp, toNum(macData.input[timestamp])])
      }
      return { input, output };

    } else {
      input = output = data.history.map<[number, number]>(([timestamp]) => {
        return [timestamp, 0];
      });
      return { input, output }
    }
  }, [data, macs, selected]);

  return (
    <DetailChart open={openChart} close={() => setOpenChart(false)} data={chartData}>
      <ul>
        {Object.entries(macs).map(([mac, sizes]) => {
          return <ListItem key={mac} primaryText={mac}
            secondaryText={mac === data.mac ? "This interface's MAC address" : undefined}
            meta={<SpeedView output={toSpeed(sizes.output[lastTimestamp])} input={toSpeed(sizes.input[lastTimestamp])} />}
            activated={selected === mac && openChart}
            onClick={() => select(mac)} />
        })}
      </ul>
    </DetailChart>
  );
}
