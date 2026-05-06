import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Connect } from 'vite';

const execFileAsync = promisify(execFile);

const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)\//;

function getYtDlpCandidates(): string[] {
  if (platform() === 'win32') {
    const local = process.env.LOCALAPPDATA ?? '';
    return [
      join(local, 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
      join(local, 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
      join(local, 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
    ];
  }
  return ['/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
}

function getFfmpegCandidates(): string[] {
  if (platform() === 'win32') {
    return [
      join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1-full_build', 'bin'),
      join(process.env.ProgramFiles ?? '', 'ffmpeg', 'bin'),
      'C:\\ffmpeg\\bin',
    ];
  }
  return ['/usr/local/bin', '/usr/bin'];
}

const ffmpegBinary = platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

async function findExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await access(p);
      return p;
    } catch {
      // Keep probing candidate paths.
    }
  }
  return null;
}

async function findFfmpegDir(): Promise<string | null> {
  for (const dir of getFfmpegCandidates()) {
    try {
      await access(join(dir, ffmpegBinary));
      return dir;
    } catch {
      // Keep probing candidate paths.
    }
  }
  return null;
}

let cachedYtDlp: string | null = null;
let cachedFfmpegDir: string | null | undefined = undefined;

interface YtResult {
  audioPath: string;
  title: string;
  uploader: string;
}

async function downloadAudio(url: string, dir: string): Promise<YtResult> {
  if (!cachedYtDlp) {
    cachedYtDlp = await findExisting(getYtDlpCandidates());
    if (!cachedYtDlp) {
      throw new Error('yt-dlp not found. Install it: pip install yt-dlp');
    }
    console.log('[youtube-api] yt-dlp:', cachedYtDlp);
  }
  if (cachedFfmpegDir === undefined) {
    cachedFfmpegDir = await findFfmpegDir();
    console.log('[youtube-api] ffmpeg dir:', cachedFfmpegDir ?? 'NOT FOUND');
  }

  const template = join(dir, 'audio.%(ext)s');
  const args = [
    '--js-runtimes', `node:${process.execPath}`,
    '--remote-components', 'ejs:github',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '5',
    '--no-playlist',
    '--print', '%(title)s',
    '--print', '%(uploader)s',
    '-o', template,
  ];

  if (cachedFfmpegDir) {
    args.push('--ffmpeg-location', cachedFfmpegDir);
  }
  args.push(url);

  console.log('[youtube-api] Running:', cachedYtDlp, args.join(' '));

  const { stdout, stderr } = await execFileAsync(cachedYtDlp, args, {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stderr) console.log('[youtube-api] stderr:', stderr.slice(0, 500));

  const lines = stdout.trim().split('\n');
  const title = lines[0] || 'Unknown Title';
  const uploader = lines[1] || '';

  // Find whatever audio file yt-dlp actually created
  const files = await readdir(dir);
  console.log('[youtube-api] Files in temp dir:', files);
  const audioFile = files.find(f => f.startsWith('audio.'));
  if (!audioFile) {
    throw new Error(`yt-dlp produced no output file. Files: ${files.join(', ')}`);
  }

  return { audioPath: join(dir, audioFile), title, uploader };
}

function readBody(req: Connect.IncomingMessage, maxBytes = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

let downloading = false;

export const youtubeMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url !== '/api/youtube' || req.method !== 'POST') {
    next();
    return;
  }

  if (downloading) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'A download is already in progress' }));
    return;
  }

  downloading = true;
  (async () => {
    const body = JSON.parse(await readBody(req)) as { url?: string };
    const url = body.url ?? '';

    if (!YT_URL_RE.test(url)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid YouTube URL' }));
      return;
    }

    let tmpDir: string | null = null;
    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'yt-'));
      const { audioPath, title, uploader } = await downloadAudio(url, tmpDir);
      const data = await readFile(audioPath);

      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': data.length,
        'X-Title': encodeURIComponent(title),
        'X-Artist': encodeURIComponent(uploader),
      });
      res.end(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[youtube-api] Error:', msg);
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    } finally {
      if (tmpDir) rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  })().catch(() => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }).finally(() => {
    downloading = false;
  });
};
