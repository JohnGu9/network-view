mod assets_map;
use assets_map::assets_map;

use std::{convert::Infallible, error::Error, io::Write};

use bytes::Bytes;
use flate2::{
    write::{DeflateEncoder, GzEncoder},
    Compression,
};
use futures::{channel::mpsc::channel, SinkExt};
use http_body_util::StreamBody;
use hyper::{body::Frame, header, http::HeaderValue, Request, Response};

use crate::ResponseType;

use super::not_found::not_found;

pub async fn file_send(
    req: &Request<hyper::body::Incoming>,
    filename: &str,
) -> Result<ResponseType, Infallible> {
    match assets_map(filename) {
        Ok(v) => {
            let guess = mime_guess::from_path(filename);
            let guess = guess.first_or_text_plain();
            let mime = HeaderValue::from_str(guess.to_string().as_str())
                .unwrap_or(HeaderValue::from_static("text/plain"));

            let (mut tx, rx) = channel(1);
            let body = StreamBody::new(rx);
            let mut res = Response::new(body);

            let accept_encoding = req.headers().get(header::ACCEPT_ENCODING);
            let bytes = convert_data(v, accept_encoding, &mut res);

            let headers = res.headers_mut();
            headers.append(header::CONTENT_TYPE, mime);
            headers.append(header::VARY, HeaderValue::from_static("Accept-Encoding"));
            if let Ok(h) = HeaderValue::from_str(bytes.len().to_string().as_str()) {
                headers.append(header::CONTENT_LENGTH, h);
            } else {
                headers.append(
                    header::TRANSFER_ENCODING,
                    HeaderValue::from_static("chunked"),
                );
            }
            let _ = tx.send(Ok(Frame::data(bytes))).await;
            Ok(res)
        }
        Err(_) => Ok(not_found("Unknown request").await),
    }
}

fn convert_data(
    data: &'static [u8],
    accept_encoding: Option<&HeaderValue>,
    response: &mut ResponseType,
) -> Bytes {
    match accept_encoding {
        Some(accept_encoding) => match accept_encoding.to_str() {
            Ok(accept_encoding) => {
                if accept_encoding.contains("Gzip") {
                    let mut compress = vec![];
                    if let Ok(_) = internal_gzip(data, &mut compress) {
                        response
                            .headers_mut()
                            .append(header::CONTENT_ENCODING, HeaderValue::from_static("Gzip"));
                        return Bytes::from(compress);
                    }
                } else if accept_encoding.contains("gzip") {
                    let mut compress = vec![];
                    if let Ok(_) = internal_gzip(data, &mut compress) {
                        response
                            .headers_mut()
                            .append(header::CONTENT_ENCODING, HeaderValue::from_static("gzip"));
                        return Bytes::from(compress);
                    }
                } else if accept_encoding.contains("Deflate") {
                    let mut compress = vec![];
                    if let Ok(_) = internal_deflate(data, &mut compress) {
                        response.headers_mut().append(
                            header::CONTENT_ENCODING,
                            HeaderValue::from_static("Deflate"),
                        );
                        return Bytes::from(compress);
                    }
                } else if accept_encoding.contains("deflate") {
                    let mut compress = vec![];
                    if let Ok(_) = internal_deflate(data, &mut compress) {
                        response.headers_mut().append(
                            header::CONTENT_ENCODING,
                            HeaderValue::from_static("deflate"),
                        );
                        return Bytes::from(compress);
                    }
                }
            }
            Err(_) => {}
        },
        None => {}
    }
    Bytes::from_static(data)
}

fn internal_gzip(input: &[u8], res: &mut Vec<u8>) -> Result<(), Box<dyn Error>> {
    let mut decoder = GzEncoder::new(res, Compression::default());
    decoder.write_all(input)?;
    decoder.finish()?;
    Ok(())
}

fn internal_deflate(input: &[u8], res: &mut Vec<u8>) -> Result<(), Box<dyn Error>> {
    let mut decoder = DeflateEncoder::new(res, Compression::default());
    decoder.write_all(input)?;
    decoder.finish()?;
    Ok(())
}
