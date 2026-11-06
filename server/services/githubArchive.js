const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createGunzip } = require("node:zlib");
const { extract } = require("tar-stream");

const MiB = 1024 * 1024;
const HEADER_LIMIT = 4096;

function limitStream(limit, inspect) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > limit) return callback(new Error("GitHub source archive exceeded the download size limit."));
      inspect?.(chunk);
      callback(null, chunk);
    },
  });
}

// Git tar archives put the commit ID in the leading global PAX header.
function archiveCommit(prefix) {
  if (prefix.length < 512 || prefix[156] !== 0x67) return "";
  const size = Number.parseInt(prefix.toString("ascii", 124, 136), 8);
  if (!Number.isSafeInteger(size) || size < 1 || size > prefix.length - 512) return "";
  return prefix.toString("utf8", 512, 512 + size)
    .match(/(?:^|\n)52 comment=([0-9a-f]{40})\n/)?.[1] || "";
}

async function listPublicArchive(fullName, includeFile) {
  const signal = AbortSignal.timeout(15000);
  const response = await fetch(`https://codeload.github.com/${fullName}/tar.gz/HEAD`, {
    headers: { "User-Agent": "OpenBounty-Agent" }, signal,
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`GitHub public archive returned ${response.status}.`);
  }

  let prefix = Buffer.alloc(0);
  const files = [];
  const entries = extract();
  entries.on("entry", (header, stream, next) => {
    const path = header.name.slice(header.name.indexOf("/") + 1);
    if (header.type === "file" && includeFile(path, header.size) && files.length < 10000) {
      files.push({ path, size: header.size });
    }
    stream.on("end", next);
    stream.resume();
  });
  await pipeline(Readable.fromWeb(response.body), limitStream(16 * MiB), createGunzip(),
    limitStream(64 * MiB, (chunk) => {
      if (prefix.length < HEADER_LIMIT) {
        prefix = Buffer.concat([prefix, chunk.subarray(0, HEADER_LIMIT - prefix.length)]);
      }
    }), entries, { signal });

  const sha = archiveCommit(prefix);
  if (!sha) throw new Error("GitHub archive did not contain a verifiable commit ID.");
  return { fullName, branch: "", sha, files, truncated: files.length === 10000 };
}

module.exports = { listPublicArchive };
