use bytes::Bytes;
use futures::{channel::mpsc::channel, SinkExt};
use http_body_util::StreamBody;
use hyper::{body::Frame, Response, StatusCode};

use crate::ResponseType;

pub async fn not_found(error: impl std::fmt::Debug) -> ResponseType {
    let message = format!("{:?}", error);
    let (mut tx, rx) = channel(1);
    let _ = tx.send(Ok(Frame::data(Bytes::from(message)))).await;
    let body = StreamBody::new(rx);
    let mut response = Response::new(body);
    *(response.status_mut()) = StatusCode::NOT_FOUND;
    return response;
}
