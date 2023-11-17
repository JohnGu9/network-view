// If this file cause build-failed, checkout readme.md

use bytes::Buf;
use rustls_pemfile::{certs, read_one, Item};
use std::io::{self, ErrorKind};
use tokio_rustls::rustls::{Certificate, PrivateKey};

pub fn load_certs(out: &Option<Vec<u8>>) -> Result<Vec<Certificate>, io::Error> {
    let bytes = match out {
        Some(bytes) => bytes.as_slice(),
        None => default_certs(),
    };
    certs(&mut bytes.reader())
        .map_err(|_| io::Error::new(ErrorKind::InvalidInput, "invalid cert"))
        .map(|mut certs| certs.drain(..).map(Certificate).collect())
}

#[cfg(feature = "internal-certificate")]
fn default_certs() -> &'static [u8] {
    include_bytes!("server.crt")
}

#[cfg(not(feature = "internal-certificate"))]
fn default_certs() -> &'static [u8] {
    &[]
}

pub fn load_keys(out: &Option<Vec<u8>>) -> Result<Vec<PrivateKey>, io::Error> {
    let bytes = match out {
        Some(bytes) => bytes.as_slice(),
        None => default_keys(),
    };
    private_keys(&mut bytes.reader())
        .map_err(|_| io::Error::new(ErrorKind::InvalidInput, "invalid key"))
        .map(|mut keys| keys.drain(..).map(PrivateKey).collect())
}

#[cfg(feature = "internal-private-key")]
fn default_keys() -> &'static [u8] {
    include_bytes!("server.key")
}

#[cfg(not(feature = "internal-private-key"))]
fn default_keys() -> &'static [u8] {
    &[]
}

fn private_keys(rd: &mut dyn io::BufRead) -> Result<Vec<Vec<u8>>, io::Error> {
    let mut keys = Vec::<Vec<u8>>::new();

    loop {
        match read_one(rd)? {
            None => return Ok(keys),
            Some(Item::PKCS8Key(key)) => keys.push(key),
            Some(Item::ECKey(key)) => keys.push(key),
            Some(Item::RSAKey(key)) => keys.push(key),
            _ => {}
        };
    }
}
