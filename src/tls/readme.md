Place your [key](server.key) the [cert](server.crt) in here before build app.

Or generate by yourself:

```console
openssl req -nodes -new -x509  -keyout server.key -out server.crt
```

For now, not support encrypted ssl key.

<br/>

This folder should be like this.

```console
tls
 - server.key
 - server.crt
 - mod.rs
 - cert_verifier.rs
 - .gitignore
 - readme.md
```
