mod file_send;
mod not_found;

use file_send::file_send;
use not_found::not_found;

use std::{convert::Infallible, net::SocketAddr};

use crate::{AppContext, ResponseType};

use hyper::{body::Incoming, Method, Request};

pub async fn on_http(
    _: &AppContext,
    _: SocketAddr,
    req: Request<Incoming>,
) -> Result<ResponseType, Infallible> {
    match (req.method(), req.uri().path()) {
        (&Method::GET | &Method::HEAD, "" | "/") => file_send(&req, "index.html").await,
        (&Method::GET | &Method::HEAD, path) => file_send(&req, &path[1..]).await,
        (m, path) => Ok(not_found(format!("Unknown request {:?} {:?}", m, path)).await),
    }
}
