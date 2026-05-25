# PhotoTransfer

Private, zero-compression photo transfer app — PC → Cloud → Mobile.  
RAW/HD JPEG files are stored and delivered byte-for-byte without any quality loss.

## Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS (PWA)
- **Backend**: Node.js + Express + Multer
- **Storage**: Cloudinary (raw binary upload, no transformations)

---

## 1. Cloudinary Setup

1. Create a free account at [cloudinary.com](https://cloudinary.com)
2. In your Dashboard note: **Cloud Name**, **API Key**, **API Secret**
3. (Optional) Go to **Settings → Upload → Upload presets** and confirm no auto-optimization is set globally

---

## 2. Backend Setup

```bash
cd server
cp .env.example .env
# Fill in your Cloudinary credentials in .env

npm install
npm run dev        # development (nodemon)
# or
npm start          # production
```

Server runs on **http://localhost:3001**

---

## 3. Frontend Setup

```bash
cd client
npm install
npm run dev        # development — http://localhost:5173
```

For production:

```bash
npm run build      # outputs to client/dist/
npm run preview    # preview the production build locally
```

The Vite dev server proxies `/api/*` to `http://localhost:3001` automatically.

---

## 4. PWA Icons

Place two PNG icons in `client/public/icons/`:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

You can generate them with any icon tool or use a simple camera emoji favicon as placeholder.

---

## 5. Mobile Installation

### Android (Chrome)
Open the app URL in Chrome → tap the three-dot menu → **Add to Home screen**

### iOS (Safari)
Open the app URL in Safari → tap the **Share** icon → **Add to Home Screen**

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/upload` | Upload photos (`multipart/form-data`, field: `photos`) |
| `GET` | `/api/photos` | List all uploaded photos, newest first |
| `DELETE` | `/api/photos/:publicId` | Delete a photo by Cloudinary public ID |

---

## Zero-Compression Guarantee

- Images (`jpg`, `png`, `webp`, etc.) → `resource_type: "image"`, **no** `quality` or `format` transform params passed to Cloudinary
- RAW camera files (`cr2`, `nef`, `arw`, `dng`, etc.) → `resource_type: "raw"` — stored as binary blobs, zero processing
- Download: client fetches the original URL as a **Blob** and triggers a native browser download — Cloudinary's auto-optimization pipeline is bypassed entirely
