use std::{collections::HashMap, error::Error};

use futures::{lock::Mutex, SinkExt, StreamExt};
use hyper::{body::Incoming, upgrade::Upgraded, Request};
use hyper_util::rt::TokioIo;
use pnet::datalink;
use serde_json::{json, Value};
use tokio_tungstenite::{tungstenite::Message, WebSocketStream};

use crate::{statistics::start_statistics_interface, AppContext};

pub async fn on_websocket(
    context: &AppContext,
    _: Request<Incoming>,
    ws: WebSocketStream<TokioIo<Upgraded>>,
) -> Result<(), Box<dyn Error>> {
    let (tx, rx) = ws.split();
    let tx = Mutex::new(tx);
    rx.for_each_concurrent(None, |message| async {
        if let Ok(message) = message {
            let message = match message {
                tokio_tungstenite::tungstenite::Message::Text(s) => s,
                _ => return,
            };

            if let Ok(v) = serde_json::from_str::<Value>(&message) {
                if let Value::Object(mut m) = v {
                    let tag = m.remove("tag");
                    let request = m.remove("request");
                    if let Some(request) = request {
                        let response = handle_request(context, request).await;
                        let _ = tx
                            .lock()
                            .await
                            .send(Message::Text(
                                json!({"tag": tag, "response": response}).to_string(),
                            ))
                            .await;
                    }
                }
            }
        }
    })
    .await;
    Ok(())
}

async fn handle_request(context: &AppContext, request: Value) -> Value {
    match request {
        Value::String(message) => match message.as_str() {
            "get_all" => {
                let map = context.map.lock().await;
                let mut m = serde_json::Map::with_capacity(map.len());
                for (key, value) in map.iter() {
                    m.insert(key.clone(), value.to_json().await);
                }
                return json!(m);
            }
            "get_interfaces" => {
                let interfaces = datalink::interfaces();
                let interfaces: Vec<String> = interfaces.into_iter().map(|i| i.name).collect();
                return json!(interfaces);
            }
            _ => {}
        },
        Value::Object(m) => {
            for (key, value) in m.into_iter() {
                match key.as_str() {
                    "get" => {
                        if let Value::Object(m) = value {
                            let mut latest_timestamp = HashMap::with_capacity(m.len());
                            for (key, value) in m.into_iter() {
                                if let Some(n) = value.as_u64() {
                                    latest_timestamp.insert(key, n);
                                }
                            }

                            let map = context.map.lock().await;
                            let mut m = serde_json::Map::with_capacity(map.len());
                            for (key, value) in map.iter() {
                                if let Some(n) = latest_timestamp.get(key) {
                                    m.insert(key.clone(), value.part_to_json(n.clone()).await);
                                } else {
                                    m.insert(key.clone(), value.to_json().await);
                                }
                            }
                            return json!(m);
                        }
                    }
                    "listen_interfaces" => {
                        if let Value::String(name) = value {
                            tokio::spawn(start_statistics_interface(
                                name,
                                context.start_time.clone(),
                                context.map.clone(),
                            ));
                        }
                    }
                    "not_listen_interfaces" => {
                        if let Value::String(name) = value {
                            let mut map = context.map.lock().await;
                            if let Some(s) = map.get_mut(&name) {
                                s.close();
                            }
                        }
                    }
                    "clear_interfaces" => {
                        if let Value::String(name) = value {
                            let mut map = context.map.lock().await;
                            if let Some(mut s) = map.remove(&name) {
                                s.close();
                            }
                        }
                    }
                    _ => {}
                }
                break;
            }
        }
        _ => {}
    }
    return Value::Null;
}
