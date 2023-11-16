use futures::channel::{mpsc, oneshot};
use futures::lock::Mutex;
use futures::{FutureExt, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::time::{Duration, MissedTickBehavior};

use pnet::datalink::{self, NetworkInterface};
use pnet::packet::ethernet::{EtherTypes, EthernetPacket};
use pnet::packet::ipv4::Ipv4Packet;
use pnet::packet::ipv6::Ipv6Packet;
use pnet::packet::Packet;
use pnet::util::MacAddr;

use std::collections::{HashMap, VecDeque};
use std::net::IpAddr;
use std::sync::Arc;

pub async fn statistics(
    start_time: std::time::Instant,
    map: Arc<Mutex<HashMap<String, InterfaceStatistics>>>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    interval.set_missed_tick_behavior(MissedTickBehavior::Delay);
    interval.tick().await;
    loop {
        interval.tick().await;
        let mut map = map.lock().await;
        let elapsed = start_time.elapsed().as_millis();
        let mut updates = Vec::with_capacity(map.len());
        for (_, value) in map.iter_mut() {
            updates.push(value.update(elapsed, 60));
        }
        futures::future::join_all(updates).await;
    }
}

pub async fn start_statistics_interface(
    interface_name: String,
    start_time: std::time::Instant,
    map: Arc<Mutex<HashMap<String, InterfaceStatistics>>>,
) {
    let interface_names_match = |iface: &NetworkInterface| iface.name == interface_name;

    // Find the network interface with the provided name
    let interfaces = datalink::interfaces();
    let interface = interfaces.into_iter().filter(interface_names_match).next();
    let mac = match &interface {
        Some(interface) => interface.mac.clone(),
        None => None,
    };

    let (buffer, closed) = {
        let mut map = map.lock().await;
        let elapsed = start_time.elapsed().as_millis();
        match map.get_mut(&interface_name) {
            Some(s) => {
                if s.closed.1.is_some() {
                    return;
                }
                let (tx, rx) = oneshot::channel();
                let rx = rx.shared();
                s.history.push_back((elapsed as u64, Default::default()));
                s.closed = (rx.clone(), Some(tx));
                s.buffer.lock().await.clear();
                (s.buffer.clone(), rx)
            }
            None => {
                let (tx, rx) = oneshot::channel();
                let rx = rx.shared();
                let statistics = InterfaceStatistics {
                    buffer: Default::default(),
                    history: VecDeque::from([(elapsed as u64, Default::default())]),
                    closed: (rx.clone(), Some(tx)),
                    mac,
                };
                let buffer = statistics.buffer.clone();
                map.insert(interface_name.clone(), statistics);
                (buffer, rx)
            }
        }
    };

    if let Some(interface) = interface {
        statistics_interface(interface, buffer, closed.clone()).await;
    }

    {
        let mut map = map.lock().await;
        match map.get_mut(&interface_name) {
            Some(s) => s.close(),
            None => {}
        }
    }
}

async fn statistics_interface(
    interface: NetworkInterface,
    buffer: Arc<Mutex<HashMap<PackageHeader, usize>>>,
    closed: futures::future::Shared<oneshot::Receiver<()>>,
) {
    let name = &interface.name;

    println!("{} start listen", name);

    use pnet::datalink::Channel::Ethernet;
    let (_, mut rx) = match datalink::channel(&interface, Default::default()) {
        Ok(Ethernet(tx, rx)) => (tx, rx),
        Ok(_) => {
            println!("{} exit listen since unhandled channel type", name);
            return;
        }
        Err(e) => {
            println!(
                "{} exit listen since error unable to create channel {:?}",
                name, e
            );
            return;
        }
    };
    let (mut tx, mut channel_rx) = mpsc::channel(64);
    tokio::task::spawn_blocking(move || loop {
        match rx.next() {
            Ok(package) => {
                let header = PackageHeader::new(package);
                let header = match header {
                    Some(h) => h,
                    None => continue,
                };
                if let Err(_) = futures::executor::block_on(tx.send(Ok((header, package.len())))) {
                    break;
                }
            }
            Err(e) => {
                let _ = futures::executor::block_on(tx.send(Err(e)));
                break;
            }
        }
    });

    let buffer = &buffer;
    loop {
        let closed = closed.clone();
        let handle = |(header, len): (PackageHeader, usize)| async move {
            let mut buffer = buffer.lock().await;
            match buffer.get_mut(&header) {
                Some(count) => *count += len,
                None => {
                    buffer.insert(header, len);
                }
            }
        };
        tokio::select! {
            res = channel_rx.next() => {
                if let Some(res) = res {
                    match res {
                        Ok(res) => handle(res).await,
                        Err(e) => println!("{} receive error: {:?}", name, e),
                    }
                } else {
                    break;
                }
            }
            _ = closed => { break; }
        }
    }

    println!("{} exit listen", name);
}

pub struct InterfaceStatistics {
    buffer: Arc<Mutex<HashMap<PackageHeader, usize>>>,
    history: VecDeque<(u64, HashMap<PackageHeader, usize>)>,
    closed: (
        futures::future::Shared<oneshot::Receiver<()>>,
        Option<oneshot::Sender<()>>,
    ),
    mac: Option<MacAddr>,
}

impl InterfaceStatistics {
    async fn update(&mut self, timestamp: u128, history_length_limit: usize) {
        if self.closed.1.is_none() {
            return;
        }
        let buffer = {
            let mut c = self.buffer.lock().await;
            let c = &mut *c;
            let mut buffer = HashMap::with_capacity(c.len());
            std::mem::swap(&mut buffer, c);
            buffer
        };
        self.history.push_back((timestamp as u64, buffer));
        let len = self.history.len();
        if history_length_limit < len {
            for _ in 0..(len - history_length_limit) {
                self.history.pop_front();
            }
        }
    }

    pub fn close(&mut self) {
        let mut tx = None;
        std::mem::swap(&mut tx, &mut self.closed.1);
        // just drop tx
        // if let Some(tx) = tx {
        //     let _ = tx.send(());
        // }
    }

    fn convert_map(map: &HashMap<PackageHeader, usize>) -> HashMap<String, usize> {
        return map
            .iter()
            .map(|(key, value)| {
                return (json!(key).to_string(), value.clone());
            })
            .collect();
    }

    pub async fn to_json(&self) -> Value {
        let closed = self.closed.1.is_none();
        let history: Vec<(&u64, HashMap<String, usize>)> = self
            .history
            .iter()
            .map(|(t, m)| {
                return (t, Self::convert_map(m));
            })
            .collect();
        json!({
            "history": history,
            "closed": closed,
            "mac": self.mac,
        })
    }

    pub async fn part_to_json(&self, timestamp_limit: u64) -> Value {
        let closed = self.closed.1.is_none();
        let mut v = Vec::with_capacity(self.history.len());
        let mut i = self.history.iter();
        while let Some((timestamp, value)) = i.next() {
            if *timestamp <= timestamp_limit {
                v.push((timestamp, Value::Null));
            } else {
                v.push((timestamp, json!(Self::convert_map(value))));
                break;
            }
        }
        while let Some((timestamp, value)) = i.next() {
            v.push((timestamp, json!(Self::convert_map(value))));
        }

        json!({
            "history": v,
            "closed": closed,
            "mac": self.mac,
        })
    }
}

#[derive(Hash, PartialEq, Eq, Serialize, Deserialize)]
struct PackageHeader {
    protocol: u16, // EtherType
    source: MacAddr,
    destination: MacAddr,
    ip_header: Option<IpHeader>,
}

#[derive(Hash, PartialEq, Eq, Serialize, Deserialize)]
struct IpHeader {
    source: IpAddr,
    destination: IpAddr,
    protocol: u8, // IpNextHeaderProtocol
}

impl PackageHeader {
    fn new(package: &[u8]) -> Option<Self> {
        let ethernet = EthernetPacket::new(package);
        let ethernet = match ethernet {
            Some(ethernet) => ethernet,
            None => return None,
        };
        match ethernet.get_ethertype() {
            EtherTypes::Ipv4 => PackageHeader::new_ipv4(&ethernet),
            EtherTypes::Ipv6 => PackageHeader::new_ipv6(&ethernet),
            _ => Some(PackageHeader {
                protocol: ethernet.get_ethertype().0,
                source: ethernet.get_source(),
                destination: ethernet.get_destination(),
                ip_header: None,
            }),
        }
    }

    fn new_ipv4(ethernet: &EthernetPacket) -> Option<Self> {
        let header = Ipv4Packet::new(ethernet.payload());
        let header = match header {
            Some(header) => header,
            None => return None,
        };
        Some(PackageHeader {
            protocol: ethernet.get_ethertype().0,
            source: ethernet.get_source(),
            destination: ethernet.get_destination(),
            ip_header: Some(IpHeader {
                source: IpAddr::V4(header.get_source()),
                destination: IpAddr::V4(header.get_destination()),
                protocol: header.get_next_level_protocol().0,
            }),
        })
    }

    fn new_ipv6(ethernet: &EthernetPacket) -> Option<Self> {
        let header = Ipv6Packet::new(ethernet.payload());
        let header = match header {
            Some(header) => header,
            None => return None,
        };
        Some(PackageHeader {
            protocol: ethernet.get_ethertype().0,
            source: ethernet.get_source(),
            destination: ethernet.get_destination(),
            ip_header: Some(IpHeader {
                source: IpAddr::V6(header.get_source()),
                destination: IpAddr::V6(header.get_destination()),
                protocol: header.get_next_header().0,
            }),
        })
    }
}
