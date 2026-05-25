require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const https = require('https');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3001;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

app.use(cors({
  origin: [
    process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    'capacitor://localhost',   // iOS Capacitor
    'ionic://localhost',        // fallback
    'http://localhost',         // Android Capacitor
    'http://localhost:5173',
  ],
}));
app.use(express.json());

const RAW_EXTENSIONS = new Set([
  'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2',
  'raf', 'rw2', 'rwl', 'pef', 'ptx', 'dng', 'orf',
  'srw', 'x3f', 'raw',
]);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

function bufferToStream(buffer) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

function getResourceType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return RAW_EXTENSIONS.has(ext) ? 'raw' : 'image';
}

function buildThumbnailUrl(publicId) {
  return cloudinary.url(publicId, {
    resource_type: 'image',
    width: 600,
    height: 600,
    crop: 'fill',
    quality: 'auto:low',
    format: 'webp',
    secure: true,
  });
}

function buildDownloadUrl(publicId, format, resourceType) {
  if (resourceType === 'raw') return null;
  return cloudinary.url(publicId, {
    resource_type: 'image',
    flags: 'attachment',
    format: format,
    secure: true,
  });
}

// POST /api/upload
app.post('/api/upload', upload.array('photos', 100), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided.' });
  }

  const uploadPromises = req.files.map((file) =>
    new Promise((resolve, reject) => {
      const resourceType = getResourceType(file.originalname);
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'photo-transfer',
          resource_type: resourceType,
          use_filename: true,
          unique_filename: true,
          overwrite: false,
        },
        (error, result) => {
          if (error) return reject(error);
          const downloadUrl =
            buildDownloadUrl(result.public_id, result.format, resourceType) ||
            result.secure_url;
          resolve({
            public_id: result.public_id,
            secure_url: result.secure_url,
            thumbnail_url: resourceType === 'image' ? buildThumbnailUrl(result.public_id) : null,
            download_url: downloadUrl,
            original_filename: result.original_filename,
            format: result.format,
            bytes: result.bytes,
            width: result.width || null,
            height: result.height || null,
            created_at: result.created_at,
            resource_type: resourceType,
          });
        }
      );
      bufferToStream(file.buffer).pipe(stream);
    })
  );

  const results = await Promise.allSettled(uploadPromises);
  res.json({
    uploaded: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    errors: results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message),
  });
});

// Fetch ALL resources for a given resource_type by following next_cursor pages
async function fetchAllResources(resourceType) {
  const results = [];
  let nextCursor = undefined;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix: 'photo-transfer/',
      max_results: 500,
      direction: 'desc',
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });
    results.push(...page.resources);
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return results;
}

// GET /api/photos
app.get('/api/photos', async (req, res) => {
  try {
    const [imgResources, rawResources] = await Promise.all([
      fetchAllResources('image'),
      fetchAllResources('raw'),
    ]);

    const imgRes = { resources: imgResources };
    const rawRes = { resources: rawResources };

    const images = imgRes.resources.map((r) => ({
      public_id: r.public_id,
      secure_url: r.secure_url,
      thumbnail_url: buildThumbnailUrl(r.public_id),
      download_url: buildDownloadUrl(r.public_id, r.format, 'image'),
      original_filename: r.public_id.split('/').pop(),
      format: r.format,
      bytes: r.bytes,
      width: r.width || null,
      height: r.height || null,
      created_at: r.created_at,
      resource_type: 'image',
    }));

    const raws = rawRes.resources.map((r) => ({
      public_id: r.public_id,
      secure_url: r.secure_url,
      thumbnail_url: null,
      download_url: r.secure_url,
      original_filename: r.public_id.split('/').pop(),
      format: r.format,
      bytes: r.bytes,
      width: null,
      height: null,
      created_at: r.created_at,
      resource_type: 'raw',
    }));

    const photos = [...images, ...raws].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    res.json({ photos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch a remote URL as a Buffer (works on all Node.js versions)
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// POST /api/download-zip — build a ZIP of selected photos server-side
// Sends a single ZIP file so iOS Safari can download everything in one tap.
app.post('/api/download-zip', express.json(), async (req, res) => {
  const photos = req.body.photos; // [{ secure_url, filename }]
  if (!Array.isArray(photos) || photos.length === 0) {
    return res.status(400).json({ error: 'No photos specified.' });
  }

  const zipName = `PhotoTransfer_${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  const archive = archiver('zip', { zlib: { level: 0 } }); // level 0 = no re-compression
  archive.pipe(res);

  for (const { secure_url, filename } of photos) {
    try {
      const buf = await fetchBuffer(secure_url);
      archive.append(buf, { name: filename });
    } catch {
      // skip failed file, continue with rest
    }
  }

  await archive.finalize();
});

// Delete ALL resources of a given type by looping pages
async function deleteAllByPrefix(resourceType) {
  let deleted = 0;
  let nextCursor = undefined;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      resource_type: resourceType,
      prefix: 'photo-transfer/',
      max_results: 100,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    });
    if (page.resources.length > 0) {
      const ids = page.resources.map((r) => r.public_id);
      await cloudinary.api.delete_resources(ids, { resource_type: resourceType });
      deleted += ids.length;
    }
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return deleted;
}

// DELETE /api/photos/clear-all — MUST be defined before /:publicId(*) route
app.delete('/api/photos/clear-all', async (req, res) => {
  try {
    const [imgDeleted, rawDeleted] = await Promise.all([
      deleteAllByPrefix('image'),
      deleteAllByPrefix('raw'),
    ]);
    res.json({ deleted: imgDeleted + rawDeleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/photos/:publicId
app.delete('/api/photos/:publicId(*)', async (req, res) => {
  const publicId = decodeURIComponent(req.params.publicId);
  try {
    // Try image first; if not found, try raw
    const imgResult = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    if (imgResult.result === 'ok') return res.json({ result: 'ok' });

    const rawResult = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    res.json({ result: rawResult.result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
