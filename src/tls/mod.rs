// If this file cause build-failed, checkout readme.md

#[cfg(feature = "internal-certificate")]
pub fn default_certs() -> Option<&'static [u8]> {
    Some(include_bytes!("server.crt"))
}

#[cfg(not(feature = "internal-certificate"))]
fn default_certs() -> Option<&'static [u8]> {
    None
}

#[cfg(feature = "internal-private-key")]
pub fn default_keys() -> Option<&'static [u8]> {
    Some(include_bytes!("server.key"))
}

#[cfg(not(feature = "internal-private-key"))]
fn default_keys() -> Option<&'static [u8]> {
    None
}
