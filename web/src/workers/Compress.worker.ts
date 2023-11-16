import { deflate, inflate, stringifyAndDeflate, inflateAndJson } from "./CompressCommon.ts";

/*eslint no-restricted-globals: "off"*/
self.onmessage = msg => {
  const { tag, ...rest } = msg.data;
  for (const [key, value] of Object.entries(rest)) {
    let handleFn;
    switch (key) {
      case 'requestDeflate':
        handleFn = deflate;
        break;
      case 'requestInflate':
        handleFn = inflate;
        break;
      case 'stringifyAndDeflate':
        handleFn = stringifyAndDeflate;
        break;
      case 'inflateAndJson':
        handleFn = inflateAndJson;
        break;
    }
    if (handleFn === undefined) break;
    try {
      const res = handleFn(value as ArrayBuffer);
      if (res instanceof ArrayBuffer) {
        self.postMessage({ tag, data: res }, [res]);
      } else {
        self.postMessage({ tag, data: res });
      }
    } catch (error) {
      self.postMessage({ tag, error });
    }
    return;
  }
  self.postMessage({ tag, error: new Error("Unknown request") });
}

