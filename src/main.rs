use argh::FromArgs;

mod http_server;
mod statistics;
mod tls;
mod websocket;

use http_server::on_http;
use statistics::{statistics, InterfaceStatistics};
use websocket::on_websocket;

use std::collections::HashMap;
use std::sync::Arc;
use std::{convert::Infallible, net::SocketAddr};

use bytes::Bytes;
use futures::channel::mpsc;
use futures::lock::Mutex;
use futures::{Future, SinkExt, StreamExt};
use http_body_util::StreamBody;
use hyper::body::{Frame, Incoming};
use hyper::header::{self, HeaderValue};
use hyper::{
    rt::Executor,
    server::conn::{http1, http2},
    service::service_fn,
    Request,
};
use hyper::{Method, Response, StatusCode, Version};
use hyper_util::rt::TokioIo;

use tokio_rustls::rustls::ServerConfig;
use tokio_rustls::TlsAcceptor;
use tokio_tungstenite::{tungstenite, WebSocketStream};

use crate::tls::{load_certs, load_keys};

pub type ResponseUnit = Result<Frame<Bytes>, Box<dyn std::error::Error + Send + Sync>>;
pub type ResponseType = Response<StreamBody<mpsc::Receiver<ResponseUnit>>>;

#[tokio::main]
async fn main() {
    let opt: Options = argh::from_env();
    let addr = match &opt.listen_address {
        Some(s) => s.as_str(),
        None => "localhost:7200",
    };

    let (listener, cert_source, key_source) = futures::join!(
        tokio::net::TcpListener::bind(addr),
        read_file(&opt.certificate, "Failed to read certificate file"),
        read_file(&opt.private_key, "Failed to read private key file"),
    );
    let listener = listener.unwrap();

    let certs = load_certs(&cert_source).expect("No available ssl cert");
    let key = load_keys(&key_source)
        .ok()
        .and_then(|mut keys| keys.pop())
        .expect("No available ssl key");

    let mut config = ServerConfig::builder()
        .with_safe_defaults()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .unwrap();
    config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec(), b"http/1.0".to_vec()];
    let config = Arc::new(config);
    let acceptor = TlsAcceptor::from(config.clone());

    println!("listen on https://{:?}", listener.local_addr().unwrap());

    let (mut tx, rx) = mpsc::channel(0);
    tokio::spawn(async move { while let Ok(_) = tx.send(listener.accept().await).await {} });

    let http1_service = http1::Builder::new();
    let http2_service = http2::Builder::new(TokioExecutor);
    let start_time = std::time::Instant::now();
    let context: AppContext = AppContext {
        start_time: start_time.clone(),
        map: Default::default(),
    };

    let acceptor = &acceptor;
    let http1_service = &http1_service;
    let http2_service = &http2_service;
    let context = &context;

    let server = rx.for_each_concurrent(None, |res| async move {
        let (stream, addr) = match res {
            Ok(r) => r,
            Err(_) => return,
        };
        match acceptor.accept(stream).await {
            Ok(stream) => {
                let (_, session) = stream.get_ref();
                let is_h2 = match session.alpn_protocol() {
                    Some(alpn) => alpn == b"h2",
                    None => false,
                };
                let stream = TokioIo::new(stream);
                let res = if is_h2 {
                    let handle = |request| {
                        let context = context.clone();
                        let addr = addr.clone();
                        async move { on_http(&context, addr, request).await }
                    };
                    http2_service
                        .serve_connection(stream, service_fn(handle))
                        .await
                } else {
                    let handle = |req| http_websocket_classify(&context, addr, req);
                    http1_service
                        .serve_connection(stream, service_fn(handle))
                        .with_upgrades()
                        .await
                };
                if let Err(e) = res {
                    println!("Error: {:?}", e);
                }
            }
            Err(e) => {
                println!("SSL handshake error: {:?}", e);
            }
        }
    });

    futures::join!(server, statistics(start_time, context.map.clone()));
}

async fn read_file(path: &Option<String>, expect: &str) -> Option<Vec<u8>> {
    match path {
        Some(path) => {
            let v = tokio::fs::read(path).await.expect(expect);
            Some(v)
        }
        None => None,
    }
}

#[derive(Clone)]
pub struct AppContext {
    start_time: std::time::Instant,
    map: Arc<Mutex<HashMap<String, InterfaceStatistics>>>,
}

#[derive(FromArgs)]
/// AppConfig
struct Options {
    /// server listen address (default: 127.0.0.1:7200, example: 0.0.0.0:8080)
    #[argh(option, short = 'l')]
    listen_address: Option<String>,

    /// use custom tls certificate path (example: pem/test.crt)
    #[argh(option, short = 'c')]
    certificate: Option<String>,

    /// use custom tls private key path (example: pem/test.key)
    #[argh(option, short = 'k')]
    private_key: Option<String>,
}

#[derive(Clone)]
struct TokioExecutor;

impl<F> Executor<F> for TokioExecutor
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    fn execute(&self, future: F) {
        tokio::spawn(future);
    }
}

async fn http_websocket_classify(
    context: &AppContext,
    addr: SocketAddr,
    req: Request<Incoming>,
) -> Result<ResponseType, Infallible> {
    const UPGRADE_HEADER_VALUE: HeaderValue = HeaderValue::from_static("Upgrade");
    const WEBSOCKET_HEADER_VALUE: HeaderValue = HeaderValue::from_static("websocket");
    let headers = req.headers();
    let key = headers.get(header::SEC_WEBSOCKET_KEY);
    if let Some(key) = key {
        let derived = tungstenite::handshake::derive_accept_key(key.as_bytes()).parse();
        match derived {
            Ok(derived) => {
                if req.method() == Method::GET
                    && req.version() >= Version::HTTP_11
                    && headers
                        .get(header::CONNECTION)
                        .and_then(|h| h.to_str().ok())
                        .map(|h| {
                            h.split(|c| c == ' ' || c == ',')
                                .any(|p| p.eq_ignore_ascii_case("Upgrade"))
                        })
                        .unwrap_or(false)
                    && headers
                        .get(header::UPGRADE)
                        .and_then(|h| h.to_str().ok())
                        .map(|h| h.eq_ignore_ascii_case("websocket"))
                        .unwrap_or(false)
                    && headers
                        .get(header::SEC_WEBSOCKET_VERSION)
                        .map(|h| h == "13")
                        .unwrap_or(false)
                {
                    let (_, rx) = mpsc::channel(0);
                    let mut res = Response::new(StreamBody::new(rx));
                    *res.status_mut() = StatusCode::SWITCHING_PROTOCOLS;
                    *res.version_mut() = req.version();
                    let headers = res.headers_mut();
                    headers.append(header::CONNECTION, UPGRADE_HEADER_VALUE);
                    headers.append(header::UPGRADE, WEBSOCKET_HEADER_VALUE);
                    headers.append(header::SEC_WEBSOCKET_ACCEPT, derived);
                    tokio::spawn(upgrade_web_socket(context.to_owned(), addr, req));
                    return Ok(res);
                } else {
                    println!( "Connection ({}) come with SEC_WEBSOCKET_KEY but can't upgrade to websocket and fallback to normal http handle. ",&addr);
                }
            }
            Err(err) => {
                println!("Error derive_accept_key: {}. ", err);
            }
        }
    }
    return on_http(context, addr, req).await;
}

async fn upgrade_web_socket(context: AppContext, addr: SocketAddr, mut req: Request<Incoming>) {
    match hyper::upgrade::on(&mut req).await {
        Ok(upgraded) => {
            let upgraded = TokioIo::new(upgraded);
            let ws_stream = WebSocketStream::from_raw_socket(
                upgraded,
                tungstenite::protocol::Role::Server,
                None,
            )
            .await;
            println!("Websocket({}) connected", addr);
            let _ = on_websocket(&context, req, ws_stream).await;
            println!("Websocket({}) disconnected", addr);
        }
        Err(e) => {
            println!("Websocket upgrade error: {}", e);
        }
    }
}
