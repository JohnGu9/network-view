import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import posixPath from 'node:path/posix';

async function main() {
    const webBuildPath = path.join(__dirname, "web", "dist");
    const rustPath = path.join(__dirname, "src", "http_server", "file_send");
    const rustAssetsPath = path.join(rustPath, "build");
    await fs.rm(rustAssetsPath, { recursive: true }).catch(function () { });
    await fs.mkdir(rustAssetsPath, { recursive: true });
    await fs.cp(webBuildPath, rustAssetsPath, { recursive: true });
    await buildAssetsMap(rustPath);
}
main();

async function buildAssetsMap(p: string) {
    const rustSource = path.join(p, "assets_map.rs");
    const assets = path.join(p, "build");
    const assetsMap: (string[])[] = [];
    async function walkDir(dir: string, internalDir: string[], assetsMap: (string[])[]) {
        for await (const entry of await fs.opendir(dir)) {
            if (entry.isFile()) {
                assetsMap.push([...internalDir, entry.name]);
            } else if (entry.isDirectory()) {
                const subDir = path.join(dir, entry.name);
                const subInternalDir = [...internalDir, entry.name]
                await walkDir(subDir, subInternalDir, assetsMap);
            }
        }
    }
    await walkDir(assets, [], assetsMap);
    const writeStream = createWriteStream(rustSource);
    writeStream.write(Buffer.from(
        `pub fn assets_map(filename: &str) -> Result<&'static [u8], ()> {
    match filename {
`));
    for (const assets of assetsMap) {
        const p0 = posixPath.join(...assets);
        const p1 = path.join("build", ...assets);
        writeStream.write(Buffer.from(`        r"${p0}" => Ok(include_bytes!(r"${p1}")),
`));
    }
    writeStream.write(Buffer.from(
        `        _ => Err(()),
    }
}`));
    await new Promise<void>(resolve => {
        writeStream.once('close', resolve);
        writeStream.end();
    });
}


